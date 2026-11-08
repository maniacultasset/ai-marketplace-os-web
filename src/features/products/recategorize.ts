/**
 * SI9 "Change category" for a product that already has listings:
 *   POST /products/{id}/recategorize {category}   product:import
 *     200  the product; its unpublished listings take the new category and wait for a new draft
 *          (the same category is 200 with nothing written)
 *     409  INVALID_STATUS_TRANSITION  a listing was already sent to a marketplace
 *     422  a category with no template, or a bad slug
 * Before a listing exists the category is edited on the product itself (PATCH).
 */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, unwrap } from '@/api/client'
import { describeError, isApiError } from '@/api/errors'
import type { Schema } from '@/api/types'
import { useKeys } from '@/lib/query-keys'

type Listing = Pick<Schema<'ListingOut'>, 'status' | 'marketplace_state'>

export type RecategorizeState =
  /** No listing yet: change it in Edit. */
  | { kind: 'none' }
  | { kind: 'open' }
  | { kind: 'refused'; reason: string }

export const SENT_REASON = 'A listing of this product was already sent to a marketplace, so its category stays. Add it as a new product to list it in another category.'

/** Whether "Change category" can work, from what the page already read. */
export function recategorizeState(listings: readonly Listing[]): RecategorizeState {
  if (!listings.length) return { kind: 'none' }
  const sent = listings.some((l) => l.status === 'publishing' || l.status === 'published' || l.marketplace_state !== 'not_submitted')
  if (sent) return { kind: 'refused', reason: SENT_REASON }
  if (listings.some((l) => l.status === 'generating')) return { kind: 'refused', reason: 'A draft is being written. Try again when it finishes.' }
  return { kind: 'open' }
}

/** One sentence for a refused change. */
export function recategorizeRefusal(e: unknown): string {
  if (!isApiError(e)) return describeError(e)
  if (e.status === 409) return SENT_REASON
  if (e.status === 422) return e.details[0]?.msg ?? 'This category can’t be used for this product.'
  if (e.status === 403) return 'Your role can’t change products. An owner or operator can.'
  if (e.status === 404 || e.status === 405) return 'Changing the category isn’t available yet.'
  return describeError(e)
}

export function useRecategorize(productId: string) {
  const qc = useQueryClient()
  const keys = useKeys()
  return useMutation({
    meta: { toast: false },
    mutationFn: (category: string) =>
      unwrap(api.POST('/products/{product_id}/recategorize', { params: { path: { product_id: productId } }, body: { category } })),
    onSuccess: () => {
      // The read carries a new ETag: read it again rather than keep one without it.
      void qc.invalidateQueries({ queryKey: keys.products.detail(productId) })
      void qc.invalidateQueries({ queryKey: keys.products.list() })
      void qc.invalidateQueries({ queryKey: keys.listings.all() })
      void qc.invalidateQueries({ queryKey: keys.issues.all() })
    },
  })
}
