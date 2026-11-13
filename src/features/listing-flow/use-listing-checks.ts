/**
 * What the review (p13) and mapping (p18) screens both read for one listing:
 *   GET /listings/{id}            content + latest validation (ETag = current version)
 *   GET /products/{id}            title and SKU
 *   GET /listings?product_id=     the marketplace tabs
 *   GET /listings/{id}/preview    what the adapter would send (409 busy, 501 no adapter → none)
 *   GET /rules?marketplace=       rules, then filtered to the listing's category (or every category)
 *   GET /issues?status=open&listing_id=  its open blocking issues (what `needs_you_count` counts)
 * and the gate roll-up over them (gates.ts).
 */
import { useMemo } from 'react'
import { MARKETPLACES } from '@/components/la/marketplace'
import { useListing, useListingPreview } from '@/features/listings/api'
import { useProduct } from '@/features/products/api'
import { useAllRules } from '@/features/rules/use-rules'
import { useOpenListingIssues } from '@/features/home-inbox/api'
import { useProductListings } from './api'
import { applicableRules, currentFindings, issueFindings, previewIdentity, rollUpGates } from './gates'

export function useListingChecks(listingId: string) {
  const listingQ = useListing(listingId)
  const listing = listingQ.data?.data
  const product = useProduct(listing?.product_id)
  const siblings = useProductListings(listing?.product_id)
  const hasVersion = !!listing?.current_version_id && listing.status !== 'created' && listing.status !== 'generating'
  const preview = useListingPreview(listingId, hasVersion)
  const rulesQ = useAllRules({ marketplace: listing?.marketplace }, { enabled: !!listing })
  const issuesQ = useOpenListingIssues(hasVersion ? listingId : undefined)

  const rules = useMemo(
    () => (listing && rulesQ.complete ? applicableRules(rulesQ.rows, listing.marketplace, listing.category ?? listing.content?.category) : null),
    [listing, rulesQ.complete, rulesQ.rows],
  )
  const previewView = preview.data
    ? { errors: preview.data.report.errors ?? [], productType: preview.data.product_type, identity: previewIdentity(preview.data.items) }
    : null
  const current = currentFindings(listing?.validation, listing?.current_version_id)
  // Images on the current version; null while there is no version to count (unknown, not zero).
  const imageCount = hasVersion && listing.content ? (listing.content.images?.length ?? 0) : null
  const marketplaceName = listing ? MARKETPLACES.find((m) => m.id === listing.marketplace)?.name : undefined
  const issues = useMemo(() => issueFindings(issuesQ.data ?? [], listing?.current_version_id), [issuesQ.data, listing?.current_version_id])
  const gates = useMemo(
    () =>
      listing
        ? rollUpGates({ listing, validation: listing.validation, rules, preview: previewView, imageCount, marketplaceName, issues })
        : [],
    // previewView is derived from preview.data
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [listing, rules, preview.data, imageCount, marketplaceName, issues],
  )
  // Every read the gates depend on has settled (an error counts as settled), so they paint once.
  const rulesSettled = rulesQ.complete || !!rulesQ.error
  const gatesReady = !!listing && rulesSettled && (!hasVersion || (preview.fetchStatus === 'idle' && !issuesQ.isPending))

  return { listingQ, listing, etag: listingQ.data?.etag ?? null, product, siblings, preview, rulesQ, rules, gates, current, gatesReady }
}
