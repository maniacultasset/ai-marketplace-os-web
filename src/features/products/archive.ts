/**
 * Product archive (Chrome pass 2, 12 Nov: the menu offered only "Delete product"):
 * POST /products/{product_id}/archive and /unarchive. Owner and admin only (`settings:manage`).
 * Archive puts a product away without deleting it: it leaves the product list, its listings are
 * archived and its open questions close; its photos, facts and history stay, and Unarchive brings
 * it back. The server refuses it as it refuses delete (a listing sent to a marketplace, one being
 * sent or drafting), so the menu disables it first with the same reason (`archiveBlock`).
 */
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { api, unwrap } from '@/api/client'
import { isApiError } from '@/api/errors'
import type { Schema } from '@/api/types'
import { toast, toastError } from '@/lib/toast'
import { useKeys, type QueryKeys } from '@/lib/query-keys'
import { productQuery, type ProductDetail } from './api'

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

/** Every draft action on an archived product is off with this reason (generate answers 409 LISTING_ARCHIVED). */
export const ARCHIVED_DRAFT_REASON = 'Archived. Unarchive it to draft.'

/** The read-only note under an archived style's variants: they are archived with it, never "a single item". */
export function archivedFamilyNote(variants: number): string {
  return `${variants} ${variants === 1 ? 'variant' : 'variants'}, archived with this product. Unarchive it to edit or draft them.`
}

/** Why drafting is off for this product because it is archived, or null. */
export function archivedDraftBlock(product: { archived_at?: string | null }): string | null {
  return product.archived_at ? ARCHIVED_DRAFT_REASON : null
}

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
      // The page reads the product under productQuery's key: patch that entry, so the banner, the
      // header and the draft actions change at once (the refetch below then brings the new ETag).
      qc.setQueryData<ProductDetail>(productQuery(keys, productId).queryKey, (old) =>
        old ? { ...old, ...product } : undefined,
      )
      toast.success(archive ? `${sku} archived` : `${sku} is back`, {
        description: archive
          ? 'It left your product list and its open questions are closed. Find it under Archived in Products.'
          : 'It is in your product list again. Draft it when you are ready.',
      })
    },
    onError: (err, archive) => {
      const why = isApiError(err) ? REFUSAL[err.type] : undefined
      toastError(err, why ? `${sku} wasn’t ${archive ? 'archived' : 'unarchived'}. ${why}` : `${sku} wasn’t ${archive ? 'archived' : 'unarchived'}`)
    },
    // Archive moves the product and its variants between the lists, archives its listings and
    // closes its open questions: refresh the product (detail and every list, which holds the
    // variants), its listings, issues and tasks (Inbox counts) and the Home summary.
    onSettled: () => invalidateAfterArchive(qc, keys),
  })
}

export function invalidateAfterArchive(qc: QueryClient, keys: QueryKeys) {
  return Promise.all(
    [keys.products.all(), keys.listings.all(), keys.issues.all(), keys.tasks.all(), keys.analytics.all()].map((queryKey) =>
      qc.invalidateQueries({ queryKey }),
    ),
  )
}
