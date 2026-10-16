/**
 * Backend listing state → hi-fi status chip. One place, so every screen says the same word for the
 * same state. "Live" is only ever derived from the marketplace's own state (`marketplace_state`
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
  inactive: { status: 'not-listed', label: 'Inactive' },
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

export function listingChip(l: { status: ListingStatus; marketplace_state: MarketplaceState }): ChipView {
  if (l.status === 'published') return BY_MARKETPLACE[l.marketplace_state]
  return BY_STATUS[l.status]
}

/** Listing statuses where the agent is actively working (drives the sidebar Agent card). */
export const AGENT_BUSY_STATUSES = ['generating', 'publishing'] as const satisfies readonly ListingStatus[]
