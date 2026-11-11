/**
 * Listing-flow reads and the generate entry point. Everything else reuses
 * `@/features/listings/api` (detail, history, submissions, preview, validate, approve, publish,
 * refresh-status) and `useJobPolling` (GET /jobs/{id}). Checked against
 * `.backend/apps/api/app/api/v1/routers/listings.py` and `jobs.py`:
 *
 *   GET  /listings/{id}/status    ListingStatusOut (status, status_reason, marketplace_state, status_changed_at)
 *   GET  /listings?product_id=    the product's listings, one per marketplace (cursor page)
 *   POST /listings/generate       Idempotency-Key; 202 JobAccepted; 409 LISTING_BUSY /
 *                                 INVALID_STATUS_TRANSITION (exists and not `created`), 422 category
 *   GET  /listings/{id}/resolution ResolutionOut (SI11): polled while Kuinn or the marketplace works;
 *                                 404 on a backend without it, read as "nothing to show"
 *   GET  /listings/{id}/issue-history IssueHistoryOut (feedback item 20): each marketplace issue and
 *                                 each fix Kuinn made; 404 on a backend without it, read as nothing
 */
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { api, unwrap } from '@/api/client'
import { isNetworkError, isNotFound } from '@/api/errors'
import { useIntentKey } from '@/api/idempotency'
import { BUSY_REFETCH_MS, fetchListingsPage, useGenerateListing } from '@/features/listings/api'
import { useCursorList } from '@/hooks/use-cursor-list'
import { rememberJob } from '@/features/listings/job-memory'
import { isBusy, type Listing, type Marketplace } from '@/features/listings/model'
import { useKeys } from '@/lib/query-keys'
import { WORKING_STATES } from './resolution-model'

/** Re-read the cheap status alias while the marketplace is still deciding. */
const STATUS_POLL_MS = 30_000

export function useListingStatus(listingId: string, opts: { poll?: boolean } = {}) {
  const keys = useKeys()
  return useQuery({
    queryKey: keys.listings.status(listingId),
    queryFn: () => unwrap(api.GET('/listings/{listing_id}/status', { params: { path: { listing_id: listingId } } })),
    refetchInterval: (q) => {
      if (!opts.poll) return false
      const s = q.state.data
      if (!s) return false
      return s.status === 'publishing' || s.marketplace_state === 'processing' || s.marketplace_state === 'pending_review'
        ? STATUS_POLL_MS
        : false
    },
    refetchIntervalInBackground: false,
  })
}

/** Re-read the resolution while Kuinn or the marketplace is still working. */
export const RESOLUTION_POLL_MS = 10_000

/**
 * "What Kuinn did" (GET /listings/{id}/resolution). A backend without the route answers 404: the
 * hook then resolves to null, so the screen shows nothing instead of an error.
 */
export function useListingResolution(listingId: string, opts: { enabled?: boolean } = {}) {
  const keys = useKeys()
  return useQuery({
    queryKey: keys.listings.resolution(listingId),
    enabled: opts.enabled ?? true,
    queryFn: async () => {
      try {
        return await unwrap(api.GET('/listings/{listing_id}/resolution', { params: { path: { listing_id: listingId } } }))
      } catch (e) {
        if (isNotFound(e)) return null
        throw e
      }
    },
    retry: (n, e) => !isNotFound(e) && n < 2,
    refetchInterval: (q) => (q.state.data && WORKING_STATES.has(q.state.data.state) ? RESOLUTION_POLL_MS : false),
    refetchIntervalInBackground: false,
  })
}

/**
 * "Issues and fixes" (GET /listings/{id}/issue-history). A backend without the route answers 404:
 * the hook then resolves to null, so the screen shows nothing instead of an error. `poll` follows
 * the resolution read: while Kuinn or the marketplace works, the history is re-read with it.
 */
export function useIssueHistory(listingId: string, opts: { enabled?: boolean; poll?: boolean } = {}) {
  const keys = useKeys()
  return useQuery({
    queryKey: keys.listings.issueHistory(listingId),
    enabled: opts.enabled ?? true,
    queryFn: async () => {
      try {
        return await unwrap(api.GET('/listings/{listing_id}/issue-history', { params: { path: { listing_id: listingId } } }))
      } catch (e) {
        if (isNotFound(e)) return null
        throw e
      }
    },
    retry: (n, e) => !isNotFound(e) && n < 2,
    refetchInterval: opts.poll ? RESOLUTION_POLL_MS : false,
    refetchIntervalInBackground: false,
  })
}

/** Every listing of one product (one per marketplace, so one page is the whole set). */
export function useProductListings(productId: string | null | undefined) {
  const keys = useKeys()
  const filters = { productId: productId ?? undefined }
  return useCursorList<Listing>({
    queryKey: keys.listings.list(filters),
    enabled: !!productId,
    // Per-product: never show another product's listings while this one loads.
    keepPrevious: false,
    // Re-read while any sibling is generating or publishing, so tabs and lanes stay in step.
    refetchInterval: (q) => (q.state.data?.pages.some((p) => p.data.some((l) => isBusy(l.status))) ? BUSY_REFETCH_MS : false),
    fetchPage: (cursor) => fetchListingsPage(filters, cursor),
  })
}

/**
 * "List on <marketplace>": POST /listings/generate for a product that has no listing there yet,
 * then open the agent run (/runs/<job id>). One intent key per click so a retry is safe.
 */
export function useListOn() {
  const generate = useGenerateListing()
  const intent = useIntentKey()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const keys = useKeys()
  const start = (productId: string, marketplace: Marketplace, opts: { onError?: (e: unknown) => void } = {}) =>
    generate.mutate(
      { body: { product_id: productId, marketplace, force_regenerate: false, category: null, user_instructions: null }, key: intent.get() },
      {
        onSuccess: (accepted) => {
          intent.reset()
          if (accepted.listing_id) rememberJob(accepted.listing_id, accepted.job_id)
          void qc.invalidateQueries({ queryKey: keys.listings.lists() })
          void navigate({ to: '/runs/$runId', params: { runId: accepted.job_id } })
        },
        onError: (e) => {
          // A network failure keeps the key, so the retry of the same click is not a second job.
          if (!isNetworkError(e)) intent.reset()
          opts.onError?.(e)
        },
      },
    )
  return { start, ...generate }
}
