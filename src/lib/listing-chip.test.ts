import { describe, expect, it } from 'vitest'
import { isNotBuyable, listingChip, needsYourInfoLabel } from './listing-chip'

describe('listingChip', () => {
  it('says Needs your info with the count when the server marks open blocking issues (prod QA 9 Nov)', () => {
    // the defect: a validated listing with 6 blocking issues read "Ready to approve"
    const stale = { status: 'validated', marketplace_state: 'not_submitted', display_state: 'needs_you', needs_you_count: 6 } as const
    expect(listingChip(stale)).toEqual({ status: 'needs-you', label: 'Needs your info · 6' })
    expect(listingChip({ ...stale, status: 'needs_review' }).label).toBe('Needs your info · 6')
    expect(listingChip({ ...stale, display_state: 'ready_to_approve', needs_you_count: 0 })).toEqual({ status: 'ready', label: 'Ready to approve' })
    // an older API build without the field keeps the status words
    expect(listingChip({ status: 'validated', marketplace_state: 'not_submitted' }).label).toBe('Ready to approve')
    expect(needsYourInfoLabel({ display_state: 'needs_you' })).toBe('Needs your info')
  })

  it('only says Live when the marketplace itself reports live', () => {
    expect(listingChip({ status: 'published', marketplace_state: 'live' }).status).toBe('live')
    expect(listingChip({ status: 'published', marketplace_state: 'processing' }).status).toBe('working')
    expect(listingChip({ status: 'approved', marketplace_state: 'live' }).status).toBe('ready')
  })
  it('maps failure and attention states to glyph statuses', () => {
    expect(listingChip({ status: 'failed', marketplace_state: 'not_submitted' }).status).toBe('error')
    expect(listingChip({ status: 'blocked', marketplace_state: 'not_submitted' }).status).toBe('blocked')
    expect(listingChip({ status: 'needs_review', marketplace_state: 'not_submitted' }).status).toBe('needs-you')
    expect(listingChip({ status: 'published', marketplace_state: 'rejected' }).status).toBe('error')
    expect(listingChip({ status: 'published', marketplace_state: 'partially_live' }).status).toBe('partly-live')
  })
  it('treats generating and publishing as working', () => {
    expect(listingChip({ status: 'generating', marketplace_state: 'not_submitted' }).status).toBe('working')
    expect(listingChip({ status: 'publishing', marketplace_state: 'processing' }).status).toBe('working')
  })
  it('says a published, inactive listing is live but not buyable yet (SI9)', () => {
    const l = { status: 'published', marketplace_state: 'inactive' } as const
    expect(listingChip(l)).toEqual({ status: 'working', label: 'Live, not buyable yet' })
    expect(isNotBuyable(l)).toBe(true)
    expect(isNotBuyable({ status: 'blocked', marketplace_state: 'inactive' })).toBe(false)
  })
})
