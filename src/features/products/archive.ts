/**
 * Product archive (Chrome pass 2, 12 Nov: the menu offered only "Delete product"):
 * POST /products/{product_id}/archive and /unarchive. Owner and admin only (`settings:manage`).
 * Archive puts a product away without deleting it: it leaves the product list, its listings are
 * archived and its open questions close; its photos, facts and history stay, and Unarchive brings
 * it back. The server refuses it as it refuses delete (a listing sent to a marketplace, one being
 * sent or drafting), so the menu disables it first with the same reason (`archiveBlock`).
 */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, unwrap } from '@/api/client'
import { isApiError } from '@/api/errors'
import type { Schema } from '@/api/types'
import { toast, toastError } from '@/lib/toast'
import { useKeys } from '@/lib/query-keys'

type Listing = Schema<'ListingOut'>

/** Why archive is off for these listings, or null. Mirrors services/product_archive.py. */
export function archiveBlock(listings: readonly (Listing | undefined)[]): string | null {
  for (const l of listings) {
    if (!l) continue
    if (l.status === 'publishing') return 'A listing is being sent to a marketplace. Try again once it finishes.'
    if (l.status === 'published' || l.marketplace_state !== 'not_submitted' || l.external_id)
      return 'A listing was sent to a marketplace, so this product can’t be archived here.'
  }
  return null
}

const REFUSAL: Record<string, string> = {
  INVALID_STATUS_TRANSITION: 'A listing was sent to a marketplace.',
  SUBMISSION_IN_FLIGHT: 'A listing is being sent to a marketplace.',
  LISTING_BUSY: 'A listing is drafting. Try again in a minute.',
  VALIDATION_FAILED: 'A size is archived with its style.',
}

export const ARCHIVED_NOTE = 'Archived. It is out of your product list and nothing is drafted or sent for it.'

export function useArchiveProduct(productId: string, sku: string) {
  const keys = useKeys()
  const qc = useQueryClient()
  return useMutation({
    meta: { toast: false },
    mutationFn: async (archive: boolean) =>
      unwrap(
        archive
          ? api.POST('/products/{product_id}/archive', { params: { path: { product_id: productId } } })
          : api.POST('/products/{product_id}/unarchive', { params: { path: { product_id: productId } } }),
      ),
    onSuccess: (product, archive) => {
      qc.setQueryData(keys.products.detail(productId), (old: unknown) => (old && typeof old === 'object' ? { ...old, ...product } : product))
      toast.success(archive ? `${sku} archived` : `${sku} is back`, {
        description: archive
          ? 'It left your product list and its open questions are closed. Unarchive it from its page.'
          : 'It is in your product list again. Draft it when you are ready.',
      })
    },
    onError: (err, archive) => {
      const why = isApiError(err) ? REFUSAL[err.type] : undefined
      toastError(err, why ? `${sku} wasn’t ${archive ? 'archived' : 'unarchived'}. ${why}` : `${sku} wasn’t ${archive ? 'archived' : 'unarchived'}`)
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: keys.products.list() })
      void qc.invalidateQueries({ queryKey: keys.products.detail(productId) })
      void qc.invalidateQueries({ queryKey: keys.listings.all() })
      void qc.invalidateQueries({ queryKey: keys.tasks.all() })
    },
  })
}
