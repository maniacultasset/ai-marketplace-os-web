/**
 * What the review (p13) and mapping (p18) screens both read for one listing:
 *   GET /listings/{id}            content + latest validation (ETag = current version)
 *   GET /products/{id}            title and SKU
 *   GET /listings?product_id=     the marketplace tabs
 *   GET /listings/{id}/preview    what the adapter would send (409 busy, 501 no adapter → none)
 *   GET /rules?marketplace=       rules, then filtered to the listing's category (or every category)
 * and the gate roll-up over them (gates.ts).
 */
import { useMemo } from 'react'
import { useListing, useListingPreview } from '@/features/listings/api'
import { useProduct } from '@/features/products/api'
import { useAllRules } from '@/features/rules/use-rules'
import { useProductListings } from './api'
import { applicableRules, currentFindings, rollUpGates } from './gates'

export function useListingChecks(listingId: string) {
  const listingQ = useListing(listingId)
  const listing = listingQ.data?.data
  const product = useProduct(listing?.product_id)
  const siblings = useProductListings(listing?.product_id)
  const hasVersion = !!listing?.current_version_id && listing.status !== 'created' && listing.status !== 'generating'
  const preview = useListingPreview(listingId, hasVersion)
  const rulesQ = useAllRules({ marketplace: listing?.marketplace }, { enabled: !!listing })

  const rules = useMemo(
    () => (listing && rulesQ.complete ? applicableRules(rulesQ.rows, listing.marketplace, listing.category ?? listing.content?.category) : null),
    [listing, rulesQ.complete, rulesQ.rows],
  )
  const previewView = preview.data ? { errors: preview.data.report.errors ?? [], productType: preview.data.product_type } : null
  const current = currentFindings(listing?.validation, listing?.current_version_id)
  const gates = useMemo(
    () => (listing ? rollUpGates({ listing, validation: listing.validation, rules, preview: previewView }) : []),
    // previewView is derived from preview.data
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [listing, rules, preview.data],
  )

  return { listingQ, listing, etag: listingQ.data?.etag ?? null, product, siblings, preview, rulesQ, rules, gates, current }
}
