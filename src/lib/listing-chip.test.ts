import { describe, expect, it } from 'vitest'
import { listingChip } from './listing-chip'

describe('listingChip', () => {
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
})
