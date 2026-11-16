/**
 * G2: photos downloaded from the spreadsheet's photo links (main_image, additional_images).
 *
 * The switch is GET /tenants/me `capabilities.sheet_photos_enabled` (backend SHEET_PHOTOS_ENABLED,
 * off by default). While it is false (or the read has not landed) every screen keeps today's copy:
 * links are kept but never downloaded, and both retries answer 501.
 *
 * Live ops (surface.py, permission product:import):
 *   POST   /imports/{import_id}/photo-links/retry    Idempotency-Key -> 202 {queued, products}
 *   POST   /products/{product_id}/photo-links/retry  Idempotency-Key -> 202 JobAccepted
 *   DELETE /photo-links/{link_id}                    -> 204 (failed or skipped links only)
 * Both retries: 409 INVALID_STATUS_TRANSITION when nothing can be retried, 501 while the switch is off.
 *
 * Invalidation: an import retry -> imports.detail(id) (its rows sit under the same prefix);
 * a product retry -> products.detail(id); a dismiss -> products.detail(id) and imports.all().
 */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, unwrap } from '@/api/client'
import { idempotencyHeader, newIdempotencyKey } from '@/api/idempotency'
import type { Schema } from '@/api/types'
import { useBrandProfile } from '@/features/brand/api'
import { useKeys } from '@/lib/query-keys'

export type ImportPhotoTotals = Schema<'ImportPhotoTotals'>

/** Whether photos are downloaded from the file's photo links for this deployment. */
export function useSheetPhotos(): boolean {
  return useBrandProfile().data?.data.capabilities?.sheet_photos_enabled === true
}

/** How often an import report is read again while its photos still download. */
export const PHOTO_TOTALS_POLL_MS = 5_000

/** The report's next read while photos download (`photos.waiting > 0`), else none. */
export function photoTotalsDelay(report: { photos?: ImportPhotoTotals | null } | null | undefined): number | false {
  return (report?.photos?.waiting ?? 0) > 0 ? PHOTO_TOTALS_POLL_MS : false
}

/**
 * "40 saved · 2 failed · 3 skipped · 8 downloading", leaving out the zero parts ("No photos yet" for
 * none). Skipped links (the per-file cap, a photo the seller removed, a deleted product) were never
 * downloaded, so they are counted apart from the failed ones.
 */
export function photoTotalsText(t: ImportPhotoTotals): string {
  const parts = [
    t.saved ? `${t.saved.toLocaleString('en-IN')} saved` : null,
    t.failed ? `${t.failed.toLocaleString('en-IN')} failed` : null,
    t.skipped ? `${t.skipped.toLocaleString('en-IN')} skipped` : null,
    t.waiting ? `${t.waiting.toLocaleString('en-IN')} downloading` : null,
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : 'No photos yet'
}

/** POST /imports/{import_id}/photo-links/retry: every failed link of the file goes back in the queue. */
export function useRetryImportPhotos(importId: string) {
  const keys = useKeys()
  const qc = useQueryClient()
  return useMutation({
    meta: { toast: false },
    mutationFn: () =>
      unwrap(
        api.POST('/imports/{import_id}/photo-links/retry', {
          params: { path: { import_id: importId }, header: idempotencyHeader(newIdempotencyKey()) },
        }),
      ),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.imports.detail(importId) }),
  })
}

/** POST /products/{product_id}/photo-links/retry: the product's failed links (style and colours). */
export function useRetryProductPhotos(productId: string) {
  const keys = useKeys()
  const qc = useQueryClient()
  return useMutation({
    meta: { toast: false },
    mutationFn: () =>
      unwrap(
        api.POST('/products/{product_id}/photo-links/retry', {
          params: { path: { product_id: productId }, header: idempotencyHeader(newIdempotencyKey()) },
        }),
      ),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.products.detail(productId) }),
  })
}

/** DELETE /photo-links/{link_id}: hide a failed or skipped link from the product and the import rows. */
export function useDismissPhotoLink(productId: string) {
  const keys = useKeys()
  const qc = useQueryClient()
  return useMutation({
    meta: { toast: false },
    mutationFn: (linkId: string) => unwrap(api.DELETE('/photo-links/{link_id}', { params: { path: { link_id: linkId } } })),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: keys.products.detail(productId) })
      // The link also leaves its import's rows (marked stale; nothing on this screen reads them).
      void qc.invalidateQueries({ queryKey: keys.imports.all() })
    },
  })
}
