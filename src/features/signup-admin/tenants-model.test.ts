import { describe, expect, it } from 'vitest'
import { ApiError } from '@/api/errors'
import { canActivate, canExtend, checkReason, extendedTrialEnd, parseExtendDays, recoveryError, trialEndLabel } from './tenants-model'

const now = Date.parse('2026-11-08T10:00:00Z')
const DAY = 86_400_000
const apiError = (status: number, type: string) =>
  new ApiError({ type: type as never, status, message: 'm', details: [], errorReport: null, correlationId: 'req', retryAfter: null })

describe('brand recovery rules', () => {
  it('activate and extend only a brand on trial or suspended', () => {
    expect(['trial', 'suspended'].every((s) => canActivate(s as never) && canExtend(s as never))).toBe(true)
    expect(canActivate('active')).toBe(false)
    expect(canExtend('offboarded')).toBe(false)
  })
  it('takes 1 to 90 whole days', () => {
    expect(parseExtendDays('1')).toBe(1)
    expect(parseExtendDays(' 30 ')).toBe(30)
    expect(parseExtendDays('090')).toBe(90)
    for (const bad of ['', '0', '91', '1.5', '-3', 'ten', '1000']) expect(parseExtendDays(bad)).toBe('invalid')
  })
  it('needs a reason of at most 500 characters', () => {
    expect(checkReason('  Paid plan  ')).toEqual({ ok: true, value: 'Paid plan' })
    expect(checkReason('   ')).toMatchObject({ ok: false })
    expect(checkReason('x'.repeat(501))).toMatchObject({ ok: false })
    expect(checkReason('a\u0007b')).toMatchObject({ ok: false })
  })
  it('extends a live trial from its end, an ended one or a suspended brand from today', () => {
    const live = { status: 'trial' as const, trial_ends_at: new Date(now + 5 * DAY).toISOString() }
    expect(extendedTrialEnd(live, 10, now).getTime()).toBe(now + 15 * DAY)
    const ended = { status: 'trial' as const, trial_ends_at: new Date(now - 5 * DAY).toISOString() }
    expect(extendedTrialEnd(ended, 10, now).getTime()).toBe(now + 10 * DAY)
    const suspended = { status: 'suspended' as const, trial_ends_at: new Date(now - 20 * DAY).toISOString() }
    expect(extendedTrialEnd(suspended, 30, now).getTime()).toBe(now + 30 * DAY)
  })
  it('shows the trial end only where it matters', () => {
    expect(trialEndLabel({ status: 'trial', trial_ends_at: '2026-12-08T10:00:00Z' }, now)).toBe('Ends 8 Dec 2026')
    expect(trialEndLabel({ status: 'suspended', trial_ends_at: '2026-11-01T10:00:00Z' }, now)).toBe('Ended 1 Nov 2026')
    expect(trialEndLabel({ status: 'active', trial_ends_at: '2026-11-01T10:00:00Z' }, now)).toBeNull()
    expect(trialEndLabel({ status: 'trial', trial_ends_at: null }, now)).toBeNull()
  })
  it('a 409 on extend points to Activate', () => {
    expect(recoveryError(apiError(409, 'INVALID_STATUS_TRANSITION'), 'extend')).toMatch(/Activate it instead/)
    expect(recoveryError(apiError(409, 'INVALID_STATUS_TRANSITION'), 'activate')).toMatch(/offboarded/)
    expect(recoveryError(apiError(404, 'NOT_FOUND'), 'activate')).toMatch(/no longer exists/)
  })
})
