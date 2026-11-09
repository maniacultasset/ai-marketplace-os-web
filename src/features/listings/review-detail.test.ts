import { describe, expect, it } from 'vitest'
import { reviewDetail, validationBlocking } from './model'

describe('reviewDetail (prod QA 9 Nov, item 15)', () => {
  it('names the version, the reason and the note of a decision', () => {
    expect(reviewDetail({ version: 2, reason_code: 'poor_quality', feedback: ' Title repeats the brand. ' })).toBe(
      'Version 2 · Poor quality: Title repeats the brand.',
    )
    expect(reviewDetail({ version: 3 })).toBe('Version 3')
    expect(reviewDetail({ reason_code: 'off_brand' })).toBe('Off brand')
    expect(reviewDetail(null)).toBeNull()
    expect(reviewDetail(undefined)).toBeNull()
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
