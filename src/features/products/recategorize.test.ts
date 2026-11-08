import { describe, expect, it } from 'vitest'
import { ApiError } from '@/api/errors'
import { recategorizeRefusal, recategorizeState, SENT_REASON } from './recategorize'

describe('recategorizeState', () => {
  it('is for products with listings only', () => {
    expect(recategorizeState([])).toEqual({ kind: 'none' })
    expect(recategorizeState([{ status: 'needs_review', marketplace_state: 'not_submitted' }])).toEqual({ kind: 'open' })
  })
  it('refuses once a listing reached a marketplace, or while drafting', () => {
    expect(recategorizeState([{ status: 'published', marketplace_state: 'inactive' }])).toEqual({ kind: 'refused', reason: SENT_REASON })
    expect(recategorizeState([{ status: 'blocked', marketplace_state: 'rejected' }])).toEqual({ kind: 'refused', reason: SENT_REASON })
    expect(recategorizeState([{ status: 'generating', marketplace_state: 'not_submitted' }]).kind).toBe('refused')
  })
})

describe('recategorizeRefusal', () => {
  const e = (status: number, type = 'INVALID_STATUS_TRANSITION', details: { loc: string[]; msg: string }[] = []) =>
    new ApiError({ type: type as never, status, message: 'x', details })
  it('explains each refusal', () => {
    expect(recategorizeRefusal(e(409))).toBe(SENT_REASON)
    expect(recategorizeRefusal(e(422, 'VALIDATION_FAILED', [{ loc: ['body', 'category'], msg: 'No template.' }]))).toBe('No template.')
    expect(recategorizeRefusal(e(403, 'PERMISSION_DENIED'))).toMatch(/role/)
    expect(recategorizeRefusal(e(404, 'NOT_FOUND'))).toMatch(/isn’t available yet/)
  })
})
