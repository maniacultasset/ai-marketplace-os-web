import { describe, expect, it } from 'vitest'
import { reviewApproveState } from './review-model'

const on = { show: true, enabled: true } as const
const off = { show: true, enabled: false, reason: 'You edited this version, so another reviewer must approve it.' } as const

describe('reviewApproveState (prod Chrome pass 12 Nov, B10)', () => {
  it('holds Approve while a saved edit re-reads the history and the server has not decided', () => {
    // the edit answer had no can_approve: the stale history named the old maker, so Approve was "on"
    const s = reviewApproveState(on, { canApprove: null, historySettled: false, fixesPending: false })
    expect(s).toEqual({ show: true, enabled: false, reason: 'Checking who worked on this version…' })
  })
  it('trusts the server answer without waiting for the history', () => {
    expect(reviewApproveState(on, { canApprove: true, historySettled: false, fixesPending: false })).toBe(on)
  })
  it('waits for what Kuinn fixed', () => {
    expect(reviewApproveState(on, { canApprove: true, historySettled: true, fixesPending: true }).enabled).toBe(false)
  })
  it('never turns a disabled Approve on, and keeps its reason', () => {
    expect(reviewApproveState(off, { canApprove: null, historySettled: false, fixesPending: true })).toBe(off)
  })
})
