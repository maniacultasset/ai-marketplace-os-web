/**
 * Live confirmation proof (hi-fi p14). Build note: "Live means confirmed. Only render Live with a
 * marketplace status, a listing ID and a last-sync time." The API does not expose `external_id`,
 * `live_confirmed_at` or `last_synced_at` yet (analysis plan Appendix A, p14), so the proof is
 * assembled from what it does expose:
 *
 *   - marketplace status: `marketplace_state` (GET /listings/{id}/status, fresher than the detail);
 *   - listing ID: the backend builds `live_url` from the marketplace's own ID once it is live
 *     (status_sync_outcome.py, registry.live_url; Amazon only, Flipkart returns none);
 *   - confirmation time: the `resolved_at` of the submission whose outcome is `live`.
 *
 * All three must be present to say Live. Otherwise the page says what is missing.
 */
import type { Schema } from '@/api/types'
import type { Listing, Submission } from '@/features/listings/model'

export type ListingStatusOut = Schema<'ListingStatusOut'>

export type ProofState = 'live' | 'unconfirmed' | 'partial' | 'waiting' | 'problem' | 'not-sent'

export interface Proof {
  state: ProofState
  marketplaceState: Listing['marketplace_state']
  liveUrl: string | null
  /** The marketplace's ID, read from the live link the backend built from it. */
  externalId: string | null
  latest: Submission | null
  confirmedAt: string | null
  sentAt: string | null
  attempt: number | null
  variants: { live: number; total: number } | null
  skus: string[]
  /** What stops us from saying Live, in plain words. */
  missing: string[]
}

/** amazon.in/dp/B0C9X12345 → "B0C9X12345". Only the shapes the backend builds. */
export function externalIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null
  const m = /\/dp\/([A-Z0-9]{10})(?:[/?#]|$)/i.exec(url)
  return m ? m[1]!.toUpperCase() : null
}

/** "B0C9X12345" → "B0C9X••••" (the design masks the tail; the full ID stays in the link). */
export function maskId(id: string): string {
  return id.length <= 5 ? id : `${id.slice(0, 5)}••••`
}

export function liveProof(
  listing: Pick<Listing, 'status' | 'marketplace_state' | 'live_url'>,
  status: Pick<ListingStatusOut, 'status' | 'marketplace_state'> | null | undefined,
  submissionsNewestFirst: readonly Submission[],
): Proof {
  const marketplaceState = status?.marketplace_state ?? listing.marketplace_state
  const listingStatus = status?.status ?? listing.status
  const latest = submissionsNewestFirst[0] ?? null
  const liveSub = submissionsNewestFirst.find((s) => s.outcome === 'live') ?? null
  const confirmedAt = liveSub?.resolved_at ?? null
  const liveUrl = listing.live_url ?? null
  const externalId = externalIdFromUrl(liveUrl)
  const items = (liveSub ?? latest)?.items ?? []
  const variants = items.length ? { live: items.filter((i) => i.marketplace_state === 'live').length, total: items.length } : null

  const missing: string[] = []
  if (marketplaceState !== 'live') missing.push('the marketplace has not reported it live')
  if (!liveUrl) missing.push('we do not hold the marketplace’s listing ID yet')
  if (!confirmedAt) missing.push('no confirmed sync time is recorded')

  let state: ProofState
  if (!missing.length) state = 'live'
  else if (marketplaceState === 'live') state = 'unconfirmed'
  else if (marketplaceState === 'partially_live') state = 'partial'
  else if (marketplaceState === 'rejected' || marketplaceState === 'removed' || marketplaceState === 'inactive' || listingStatus === 'failed')
    state = 'problem'
  else if (listingStatus === 'published' || listingStatus === 'publishing' || latest) state = 'waiting'
  else state = 'not-sent'

  return {
    state,
    marketplaceState,
    liveUrl,
    externalId,
    latest,
    confirmedAt,
    sentAt: latest?.sent_at ?? null,
    attempt: latest?.attempt ?? null,
    variants,
    skus: [...new Set(items.map((i) => i.seller_sku))],
    missing,
  }
}
