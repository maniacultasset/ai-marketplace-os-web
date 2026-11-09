/**
 * Backend listing state → hi-fi status chip. One place, so every screen says the same word for the
 * same state. The server's `display_state` wins over `status` for "needs you" (prod QA 9 Nov: a
 * listing with open blocking issues read "Ready to approve" here while Review blocked it). "Live" is only ever derived from the marketplace's own state (`marketplace_state`
 * live), never from our `published` status alone (hi-fi build rule: "Live means confirmed").
 */
import type { ChipStatus } from '@/components/la/status-chip'
import type { Schema } from '@/api/types'

type ListingStatus = Schema<'ListingStatus'>
type MarketplaceState = Schema<'MarketplaceState'>

export interface ChipView {
  status: ChipStatus
  label: string
}

const BY_MARKETPLACE: Record<MarketplaceState, ChipView> = {
  not_submitted: { status: 'working', label: 'Working' },
  processing: { status: 'working', label: 'Processing' },
  pending_review: { status: 'working', label: 'In marketplace review' },
  live: { status: 'live', label: 'Live' },
  partially_live: { status: 'partly-live', label: 'Partly live' },
  // SI9: published and inactive = Amazon has the product page (ASIN) but it is not buyable yet.
  inactive: { status: 'working', label: 'Live, not buyable yet' },
  rejected: { status: 'error', label: 'Rejected' },
  removed: { status: 'not-listed', label: 'Removed' },
}

const BY_STATUS: Record<Exclude<ListingStatus, 'published'>, ChipView> = {
  created: { status: 'draft', label: 'Draft' },
  generating: { status: 'working', label: 'Working' },
  validated: { status: 'ready', label: 'Ready to approve' },
  needs_review: { status: 'needs-you', label: 'Needs review' },
  approved: { status: 'ready', label: 'Ready to list' },
  publishing: { status: 'working', label: 'Submitting' },
  blocked: { status: 'blocked', label: 'Blocked' },
  failed: { status: 'error', label: 'Error' },
}

/** SI9: on the marketplace (it has its ID) but not buyable yet. */
export const isNotBuyable = (l: { status: ListingStatus; marketplace_state: MarketplaceState }) =>
  l.status === 'published' && l.marketplace_state === 'inactive'

/** The one next step for "Live, not buyable yet". */
export const NOT_BUYABLE_NEXT =
  'Amazon made the product page but is not selling it yet. This often clears within a day. If it does not, check price, stock and any listing issue in Seller Central, then check status here.'

type DisplayFields = Partial<Pick<Schema<'ListingOut'>, 'display_state' | 'needs_you_count'>>

/**
 * The server's display state says open blocking issues keep a person from approving this version
 * (whatever `status` says: a stored "passed" can be stale). Older API builds omit it: false.
 */
export function needsYourInfo(l: DisplayFields): boolean {
  return l.display_state === 'needs_you'
}

/** "Needs your info · 6": the count is the open blocking issues on the current version. */
export function needsYourInfoLabel(l: DisplayFields): string {
  const n = l.needs_you_count ?? 0
  return n > 0 ? `Needs your info · ${n}` : 'Needs your info'
}

/** What every screen says about an approved Amazon listing while Amazon publishing is switched off. */
export const APPROVED_PAUSED_LABEL = 'Approved · publishing paused'

/** Deployment switches that change what a chip may promise (GET /tenants/me capabilities). */
export interface ChipContext {
  /** Amazon publishing is switched off: an approved Amazon listing waits, nobody can send it. */
  amazonPublishingPaused?: boolean
}

type ChipInput = { status: ListingStatus; marketplace_state: MarketplaceState; marketplace?: string } & DisplayFields

/** An approved Amazon listing that cannot be sent while Amazon publishing is off. */
export const isApprovedPaused = (l: Pick<ChipInput, 'status' | 'marketplace'>, ctx?: ChipContext) =>
  !!ctx?.amazonPublishingPaused && l.marketplace === 'amazon' && l.status === 'approved'

export function listingChip(l: ChipInput, ctx?: ChipContext): ChipView {
  if (l.status === 'published') return BY_MARKETPLACE[l.marketplace_state]
  if (needsYourInfo(l)) return { status: 'needs-you', label: needsYourInfoLabel(l) }
  if (isApprovedPaused(l, ctx)) return { status: 'paused', label: APPROVED_PAUSED_LABEL }
  return BY_STATUS[l.status]
}

/** Listing statuses where the agent is actively working (drives the sidebar Agent card). */
export const AGENT_BUSY_STATUSES = ['generating', 'publishing'] as const satisfies readonly ListingStatus[]
