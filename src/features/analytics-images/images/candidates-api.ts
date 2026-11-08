import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, unwrap } from '@/api/client'
import { idempotencyHeader, newIdempotencyKey } from '@/api/idempotency'
import { jobPollInterval } from '@/hooks/use-job-polling'
import { useKeys } from '@/lib/query-keys'
import { anyQueued, type Candidate, type CandidateKind } from './candidates-model'

/** Preview URLs are signed for 10 minutes: refresh well before, and on every mount. */
const PREVIEW_REFRESH_MS = 8 * 60_000

/**
 * GET /products/{id}/image-candidates. While one is queued the list is polled on the same
 * timing as image jobs (1 s, then 2 s, then 5 s), so a reload mid-generation still lands.
 */
export function useImageCandidates(productId: string, enabled: boolean) {
  const keys = useKeys()
  return useQuery({
    queryKey: keys.images.candidates(productId),
    queryFn: () =>
      unwrap(api.GET('/products/{product_id}/image-candidates', { params: { path: { product_id: productId } } })).then(
        (page) => page.items,
      ),
    enabled,
    staleTime: 0,
    refetchIntervalInBackground: false,
    refetchInterval: (q) => {
      const items = q.state.data as Candidate[] | undefined
      if (!anyQueued(items)) return items?.some((c) => c.status === 'ready') ? PREVIEW_REFRESH_MS : false
      const oldest = Math.min(...(items ?? []).filter((c) => c.status === 'queued').map((c) => Date.parse(c.created_at)))
      return jobPollInterval(Date.now() - oldest)
    },
  })
}

/** After any candidate change: the list, the product (its images and fixes) and the reports. */
function useRefresh(productId: string) {
  const keys = useKeys()
  const qc = useQueryClient()
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: keys.images.candidates(productId) }),
      qc.invalidateQueries({ queryKey: keys.products.detail(productId) }),
    ])
}

/** POST /products/{id}/image-candidates; one Idempotency-Key per click. */
export function useCreateCandidate(productId: string) {
  const refresh = useRefresh(productId)
  return useMutation({
    meta: { toast: false },
    mutationFn: ({ kind, sourceImageId }: { kind: CandidateKind; sourceImageId: string | null }) =>
      unwrap(
        api.POST('/products/{product_id}/image-candidates', {
          params: { path: { product_id: productId }, header: idempotencyHeader(newIdempotencyKey()) },
          body: kind === 'size_chart' ? { kind } : { kind, source_image_id: sourceImageId },
        }),
      ),
    onSuccess: () => refresh(),
  })
}

/**
 * POST /image-candidates/{id}/accept: the candidate becomes a product image. The old main is now an
 * extra image, so every image report is read again (its cached report still says main).
 */
export function useAcceptCandidate(productId: string) {
  const keys = useKeys()
  const qc = useQueryClient()
  const refresh = useRefresh(productId)
  return useMutation({
    meta: { toast: false },
    mutationFn: (candidateId: string) =>
      unwrap(
        api.POST('/image-candidates/{candidate_id}/accept', {
          params: { path: { candidate_id: candidateId }, header: idempotencyHeader(newIdempotencyKey()) },
        }),
      ),
    onSettled: () => {
      // Reports refresh in the background: the new image's job is handed over without waiting on them.
      void qc.invalidateQueries({ queryKey: keys.images.all() })
      return refresh()
    },
  })
}

/** POST /image-candidates/{id}/reject. Its answer has no previews, so the list is read again. */
export function useRejectCandidate(productId: string) {
  const refresh = useRefresh(productId)
  return useMutation({
    meta: { toast: false },
    mutationFn: (candidateId: string) =>
      unwrap(
        api.POST('/image-candidates/{candidate_id}/reject', {
          params: { path: { candidate_id: candidateId }, header: idempotencyHeader(newIdempotencyKey()) },
        }),
      ),
    onSettled: () => refresh(),
  })
}
