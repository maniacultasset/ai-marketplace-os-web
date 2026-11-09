import { describe, expect, it } from 'vitest'
import { blockedReason, historyReason, REJECT_REASONS, reviewDetail, validationBlocking } from './model'

describe('reviewDetail (prod QA 9 Nov, item 15)', () => {
  it('names the version and the reason of a decision', () => {
    expect(reviewDetail({ version: 2, reason_code: 'poor_quality' })).toBe('Version 2 · Poor quality')
    expect(reviewDetail({ version: 3 })).toBe('Version 3')
    expect(reviewDetail({ reason_code: 'off_brand' })).toBe('Off brand')
    expect(reviewDetail(null)).toBeNull()
    expect(reviewDetail(undefined)).toBeNull()
  })
  it('puts the decided version on a history row, with the reject label and note', () => {
    const r = REJECT_REASONS[0]
    expect(historyReason({ action: 'listing.approved', review: { version: 2 } })).toBe('Version 2')
    expect(historyReason({ action: 'listing.rejected', reason: r.code, review: { version: 3, reason_code: r.code }, after: { note: 'Wrong fabric' } })).toBe(
      `Version 3 · ${r.label}. Note: “Wrong fabric”`,
    )
    expect(historyReason({ action: 'listing.rejected', reason: r.code })).toBe(r.label)
  })
})

describe('validationBlocking (prod QA 9 Nov, item 14)', () => {
  it('counts the server blockers when the rules passed, so the tab agrees with Review', () => {
    const passed = { passed: true, blocking_count: 0 }
    expect(validationBlocking(passed, { display_state: 'needs_you', needs_you_count: 6 })).toEqual({ blocking: 6, marketplace: true })
    expect(validationBlocking(passed, { display_state: 'ready_to_approve', needs_you_count: 0 })).toEqual({ blocking: 0, marketplace: false })
    expect(validationBlocking({ passed: false, blocking_count: 2 }, { display_state: 'needs_you', needs_you_count: 2 })).toEqual({ blocking: 2, marketplace: false })
    expect(validationBlocking(passed, undefined)).toEqual({ blocking: 0, marketplace: false })
  })
})

describe('blockedReason (prod QA 9 Nov, item 23)', () => {
  it('says why a block with no open issue is a block', () => {
    expect(blockedReason({ status: 'blocked', status_reason: 'rejected' }, 0)).toBe('Rejected by a reviewer')
    expect(blockedReason({ status: 'blocked', status_reason: 'human_task_open' }, 0)).toBe('A question is waiting in your Inbox')
    expect(blockedReason({ status: 'blocked', status_reason: null }, 0)).toBe('Blocked: open the listing to see why')
    expect(blockedReason({ status: 'blocked', status_reason: 'validation_errors' }, 6)).toBeNull()
    expect(blockedReason({ status: 'validated' }, 0)).toBeNull()
  })
})
