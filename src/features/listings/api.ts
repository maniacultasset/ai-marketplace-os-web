/**
 * Listings data layer. Every call is typed from the contract (schema.d.ts) and checked against
 * `.backend/apps/api/app/api/v1/routers/listings.py` (+ jobs.py for cancel):
 *
 *   GET   /listings                               status, marketplace, product_id, limit, cursor
 *   GET   /listings/{id}                          ETag = current version (Versioned<ListingDetail>)
 *   PATCH /listings/{id}/content                  If-Match; 409 STALE_VERSION
 *   GET   /listings/{id}/history | /submissions   cursor pages
 *   GET   /listings/{id}/preview                  409 LISTING_BUSY, 501 no adapter
 *   POST  /listings/validate                      200 ValidationSummary (a failed check is not an error)
 *   POST  /listings/generate                      Idempotency-Key, 202 JobAccepted
 *   POST  /listings/{id}/regenerate               Idempotency-Key, 202 JobAccepted
 *   POST  /listings/approve                       Idempotency-Key, 200 BatchResult (per-item status)
 *   POST  /listings/publish                       Idempotency-Key, 202 BatchAccepted (per-item status)
 *   POST  /listings/{id}/publish/retry-fields     Idempotency-Key, 202 JobAccepted
 *   POST  /listings/{id}/refresh-status           Idempotency-Key, 202 JobAccepted; 429 within 5 min
 *   POST  /jobs/{id}/cancel                       Idempotency-Key, 200 JobEnvelope
 */
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { api, unwrap } from '@/api/client'
import { ifMatchHeader, unwrapVersioned, type Versioned } from '@/api/etag'
import { idempotencyHeader } from '@/api/idempotency'
import type { JobEnvelope } from '@/api/types'
import { PAGE_SIZE, useCursorList } from '@/hooks/use-cursor-list'
import { useKeys, type ListingsFilters, type QueryKeys } from '@/lib/query-keys'
import {
  isBusy,
  type ApproveItem,
  type AuditEvent,
  type BatchAccepted,
  type BatchResult,
  type ContentPatch,
  type GenerateBody,
  type JobAccepted,
  type Listing,
  type ListingDetail,
  type MarketplacePreview,
  type PublishItem,
  type Submission,
  type ValidationSummary,
} from './model'

/* ---------------------------------------------------------------------------------------------- */
/* Reads                                                                                           */
/* ---------------------------------------------------------------------------------------------- */

export function fetchListingsPage(f: ListingsFilters, cursor: string | undefined, limit = PAGE_SIZE) {
  return unwrap(
    api.GET('/listings', {
      params: {
        query: {
          status: f.status,
          marketplace: f.marketplace,
          product_id: f.productId,
          limit,
          cursor,
        },
      },
    }),
  )
}

export function useListingsList(filters: ListingsFilters) {
  const keys = useKeys()
  return useCursorList<Listing>({
    queryKey: keys.listings.list(filters),
    fetchPage: (cursor) => fetchListingsPage(filters, cursor),
  })
}

/** While a listing is generating or publishing, re-read it on this cadence (the job may be unknown). */
const BUSY_REFETCH_MS = 15_000

export function useListing(listingId: string) {
  const keys = useKeys()
  return useQuery({
    queryKey: keys.listings.detail(listingId),
    queryFn: () =>
      unwrapVersioned(api.GET('/listings/{listing_id}', { params: { path: { listing_id: listingId } } })),
    refetchInterval: (q) => (q.state.data && isBusy(q.state.data.data.status) ? BUSY_REFETCH_MS : false),
    refetchIntervalInBackground: false,
  })
}

export function useListingHistory(listingId: string, enabled = true) {
  const keys = useKeys()
  return useCursorList<AuditEvent>({
    queryKey: keys.listings.history(listingId),
    enabled,
    fetchPage: (cursor) =>
      unwrap(
        api.GET('/listings/{listing_id}/history', {
          params: { path: { listing_id: listingId }, query: { limit: PAGE_SIZE, cursor } },
        }),
      ),
  })
}

export function useListingSubmissions(listingId: string, enabled = true) {
  const keys = useKeys()
  return useCursorList<Submission>({
    queryKey: keys.listings.submissions(listingId),
    enabled,
    fetchPage: (cursor) =>
      unwrap(
        api.GET('/listings/{listing_id}/submissions', {
          params: { path: { listing_id: listingId }, query: { limit: 20, cursor } },
        }),
      ),
  })
}

export function useListingPreview(listingId: string, enabled: boolean) {
  const keys = useKeys()
  return useQuery<MarketplacePreview>({
    queryKey: keys.listings.preview(listingId),
    enabled,
    queryFn: () => unwrap(api.GET('/listings/{listing_id}/preview', { params: { path: { listing_id: listingId } } })),
  })
}

/* ---------------------------------------------------------------------------------------------- */
/* Invalidation                                                                                    */
/* ---------------------------------------------------------------------------------------------- */

/** Everything a listing action can change (GROUNDWORK "What to invalidate after each mutation"). */
export function invalidateListingWork(qc: QueryClient, keys: QueryKeys, listingIds: readonly string[]) {
  void qc.invalidateQueries({ queryKey: keys.listings.lists() })
  for (const id of new Set(listingIds)) void qc.invalidateQueries({ queryKey: keys.listings.detail(id) })
  void qc.invalidateQueries({ queryKey: keys.issues.all() })
  void qc.invalidateQueries({ queryKey: keys.tasks.all() })
  void qc.invalidateQueries({ queryKey: keys.analytics.all() })
}

/* ---------------------------------------------------------------------------------------------- */
/* Mutations. Each takes the caller's intent key (useIntentKey) so a retry reuses it.              */
/* ---------------------------------------------------------------------------------------------- */

export function useGenerateListing() {
  const keys = useKeys()
  const qc = useQueryClient()
  return useMutation({
    meta: { toast: false },
    mutationFn: ({ body, key }: { body: GenerateBody; key: string }): Promise<JobAccepted> =>
      unwrap(api.POST('/listings/generate', { params: { header: idempotencyHeader(key) }, body })),
    onSuccess: (accepted) => invalidateListingWork(qc, keys, accepted.listing_id ? [accepted.listing_id] : []),
  })
}

export function useSaveContent(listingId: string) {
  const keys = useKeys()
  const qc = useQueryClient()
  return useMutation({
    meta: { toast: false },
    mutationFn: ({ body, etag }: { body: ContentPatch; etag: string | null }): Promise<Versioned<ListingDetail>> =>
      unwrapVersioned(
        api.PATCH('/listings/{listing_id}/content', {
          params: { path: { listing_id: listingId }, header: ifMatchHeader(etag) },
          body,
        }),
      ),
    onSuccess: (next) => {
      qc.setQueryData(keys.listings.detail(listingId), next)
      void qc.invalidateQueries({ queryKey: keys.listings.history(listingId) })
      void qc.invalidateQueries({ queryKey: keys.listings.preview(listingId) })
      void qc.invalidateQueries({ queryKey: keys.listings.lists() })
      void qc.invalidateQueries({ queryKey: keys.issues.all() })
      void qc.invalidateQueries({ queryKey: keys.tasks.all() })
      void qc.invalidateQueries({ queryKey: keys.analytics.all() })
    },
  })
}

export function useValidateListing(listingId: string) {
  const keys = useKeys()
  const qc = useQueryClient()
  return useMutation({
    meta: { errorTitle: 'Couldn’t run the checks' },
    mutationFn: (versionId: string | null): Promise<ValidationSummary> =>
      unwrap(api.POST('/listings/validate', { body: { listing_id: listingId, listing_version_id: versionId } })),
    // A revalidate can move the status (validated / needs_review / blocked) and the issues.
    onSuccess: () => invalidateListingWork(qc, keys, [listingId]),
  })
}

export function useRegenerateListing(listingId: string) {
  const keys = useKeys()
  const qc = useQueryClient()
  return useMutation({
    meta: { toast: false },
    mutationFn: ({ instructions, key }: { instructions: string | null; key: string }): Promise<JobAccepted> =>
      unwrap(
        api.POST('/listings/{listing_id}/regenerate', {
          params: { path: { listing_id: listingId }, header: idempotencyHeader(key) },
          body: instructions ? { instructions } : {},
        }),
      ),
    onSuccess: () => invalidateListingWork(qc, keys, [listingId]),
  })
}

/** Approve or reject (maker-checker per item). The request is 200; read each item's own status. */
export function useReviewListings() {
  const keys = useKeys()
  const qc = useQueryClient()
  return useMutation({
    meta: { toast: false },
    mutationFn: ({ items, key }: { items: ApproveItem[]; key: string }): Promise<BatchResult> =>
      unwrap(api.POST('/listings/approve', { params: { header: idempotencyHeader(key) }, body: { items } })),
    onSettled: (_r, _e, vars) => invalidateListingWork(qc, keys, vars.items.map((i) => i.listing_id)),
  })
}

/** Publish approved listings. 202 with per-item results; each accepted item is one publish job. */
export function usePublishListings() {
  const keys = useKeys()
  const qc = useQueryClient()
  return useMutation({
    meta: { toast: false },
    mutationFn: ({ items, key }: { items: PublishItem[]; key: string }): Promise<BatchAccepted> =>
      unwrap(api.POST('/listings/publish', { params: { header: idempotencyHeader(key) }, body: { items } })),
    onSettled: (_r, _e, vars) => invalidateListingWork(qc, keys, vars.items.map((i) => i.listing_id)),
  })
}

export function useRetryFields(listingId: string) {
  const keys = useKeys()
  const qc = useQueryClient()
  return useMutation({
    meta: { errorTitle: 'Couldn’t retry the failed fields' },
    mutationFn: (key: string): Promise<JobAccepted> =>
      unwrap(
        api.POST('/listings/{listing_id}/publish/retry-fields', {
          params: { path: { listing_id: listingId }, header: idempotencyHeader(key) },
        }),
      ),
    onSuccess: () => invalidateListingWork(qc, keys, [listingId]),
  })
}

export function useRefreshStatus(listingId: string) {
  const keys = useKeys()
  const qc = useQueryClient()
  return useMutation({
    meta: { errorTitle: 'Couldn’t check the marketplace status' },
    mutationFn: (key: string): Promise<JobAccepted> =>
      unwrap(
        api.POST('/listings/{listing_id}/refresh-status', {
          params: { path: { listing_id: listingId }, header: idempotencyHeader(key) },
        }),
      ),
    onSuccess: () => invalidateListingWork(qc, keys, [listingId]),
  })
}

export function useCancelJob() {
  const keys = useKeys()
  const qc = useQueryClient()
  return useMutation({
    meta: { errorTitle: 'Couldn’t cancel the job' },
    mutationFn: ({ jobId, key }: { jobId: string; key: string }): Promise<JobEnvelope> =>
      unwrap(api.POST('/jobs/{job_id}/cancel', { params: { path: { job_id: jobId }, header: idempotencyHeader(key) } })),
    onSuccess: (job) => {
      qc.setQueryData(keys.jobs.detail(job.job_id), job)
      if (job.listing_id) invalidateListingWork(qc, keys, [job.listing_id])
    },
  })
}
