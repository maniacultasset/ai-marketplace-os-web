import { describe, expect, it } from 'vitest'
import { ApiError } from '@/api/errors'
import { AI_PAUSED_REASON, aiPaused, CREDIT_STATE, isAiPausedError, trialDaysLeft, trialLabel, trialTone, usd } from './model'

const err = (type: string, status = 503) => new ApiError({ type: type as never, status, message: 'x' })

describe('isAiPausedError', () => {
  it('is the two pause codes only', () => {
    expect(isAiPausedError(err('AI_CREDIT_EXHAUSTED'))).toBe(true)
    expect(isAiPausedError(err('AI_PROVIDER_KEY_INVALID'))).toBe(true)
    // The platform daily cap is a different, timed message.
    expect(isAiPausedError(err('BUDGET_EXCEEDED', 429))).toBe(false)
    expect(isAiPausedError(new Error('x'))).toBe(false)
  })
})

describe('pause copy', () => {
  it('promises no person, only that drafting resumes', () => {
    expect(AI_PAUSED_REASON).toBe('AI drafting is paused. It starts again once AI is back, and your products and drafts are saved.')
    expect(AI_PAUSED_REASON).not.toMatch(/team|—/)
  })
})

describe('aiPaused', () => {
  it('follows /auth/me, and a refused generate newer than the last read', () => {
    expect(aiPaused({ ai_paused: true }, 100, null)).toBe(true)
    expect(aiPaused({ ai_paused: false }, 100, null)).toBe(false)
    expect(aiPaused({ ai_paused: false }, 100, 200)).toBe(true)
    expect(aiPaused({ ai_paused: false }, 300, 200)).toBe(false)
  })
  it('is off when an older backend sends no field', () => {
    expect(aiPaused({}, 100, null)).toBe(false)
    expect(aiPaused(undefined, 0, null)).toBe(false)
  })
})

describe('trial', () => {
  const now = Date.parse('2026-11-08T10:00:00Z')
  it('counts whole days left, rounded up', () => {
    expect(trialDaysLeft('2026-11-08T13:00:00Z', now)).toBe(1)
    expect(trialDaysLeft('2026-11-15T10:00:00Z', now)).toBe(7)
    expect(trialDaysLeft('2026-11-01T10:00:00Z', now)).toBe(0)
  })
  it('is null without a trial or with a bad date', () => {
    expect(trialDaysLeft(null, now)).toBeNull()
    expect(trialDaysLeft(undefined, now)).toBeNull()
    expect(trialDaysLeft('soon', now)).toBeNull()
  })
  it('labels and tones', () => {
    expect(trialLabel(0)).toBe('Trial ends today')
    expect(trialLabel(1)).toBe('Trial: 1 day left')
    expect(trialLabel(12)).toBe('Trial: 12 days left')
    expect(trialTone(3)).toBe('attention')
    expect(trialTone(4)).toBe('neutral')
  })
})

describe('admin credit', () => {
  it('formats USD strings', () => {
    expect(usd('9.600000')).toBe('$9.60')
    expect(usd(null)).toBe('Not checked')
    expect(usd('x')).toBe('Not checked')
  })
  it('names every state', () => {
    expect(Object.keys(CREDIT_STATE).sort()).toEqual(['low', 'ok', 'paused', 'unknown'])
  })
})
