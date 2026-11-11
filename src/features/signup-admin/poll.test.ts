import { describe, expect, it } from 'vitest'
import { ApiError } from '@/api/errors'
import { POLL_MS, pollDelay } from './poll'

const answer = (status: 'pending' | 'approved' | 'rejected') => ({ status, brand_name: 'Acme', requested_at: '2026-11-11T09:00:00Z' })
const err = (status: number, retryAfter: number | null = null) =>
  new ApiError({ type: status === 404 ? 'NOT_FOUND' : 'RATE_LIMITED', status, message: 'm', retryAfter })

describe('pollDelay', () => {
  it('polls every 15 s while pending (and before the first answer)', () => {
    expect(POLL_MS).toBe(15_000)
    expect(pollDelay({})).toBe(POLL_MS)
    expect(pollDelay({ data: answer('pending') })).toBe(POLL_MS)
  })

  it('stops once decided', () => {
    expect(pollDelay({ data: answer('approved') })).toBe(false)
    expect(pollDelay({ data: answer('rejected') })).toBe(false)
  })

  it('stops for a handle that names nothing (404)', () => {
    expect(pollDelay({ data: answer('pending'), error: err(404) })).toBe(false)
  })

  it('waits Retry-After on a 429, never less than 15 s', () => {
    expect(pollDelay({ data: answer('pending'), error: err(429, 40) })).toBe(40_000)
    expect(pollDelay({ error: err(429, 3) })).toBe(POLL_MS)
    expect(pollDelay({ error: err(429) })).toBe(60_000)
  })

  it('keeps polling after a network blip', () => {
    expect(pollDelay({ data: answer('pending'), error: new ApiError({ type: 'NETWORK', status: 0, message: 'm' }) })).toBe(POLL_MS)
  })
})
