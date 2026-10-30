import { describe, expect, it } from 'vitest'
import type { LoginResult } from '@/api/types'
import { advance, daysLabel, groupSecret, isRecoveryCode, isTotp, totpInput, ttlLabel } from './login-flow'

const memberships = [{ tenant_id: 't1', tenant_name: 'Acme', role: 'owner' as const }]
const signedIn: LoginResult = {
  status: 'signed_in',
  access_token: 'a',
  refresh_token: 'r',
  token_type: 'bearer',
  expires_in: 1800,
  memberships,
}
const challenge = (status: LoginResult['status'], ttl?: number): LoginResult => ({
  status,
  challenge_token: 'ch-1',
  challenge_expires_in: ttl,
})

describe('advance (LoginResult → next step)', () => {
  it('signed_in carries the token pair', () => {
    const next = advance(signedIn)
    expect(next).toEqual({
      kind: 'signed-in',
      tokens: { access_token: 'a', refresh_token: 'r', expires_in: 1800, memberships, token_type: 'bearer' },
      graceUntil: null,
    })
  })

  it('passes the grace date on for a banner', () => {
    const next = advance({ ...signedIn, mfa_grace_until: '2026-11-20T00:00:00+05:30' })
    expect(next.kind === 'signed-in' && next.graceUntil).toBe('2026-11-20T00:00:00+05:30')
  })

  it('treats a missing status as signed_in (an API older than 2.0.0)', () => {
    const { status: _omit, ...legacy } = signedIn
    expect(advance(legacy as LoginResult).kind).toBe('signed-in')
  })

  it('mfa_required → the code step with a 5 minute challenge', () => {
    const next = advance(challenge('mfa_required', 300), 1_000)
    expect(next).toEqual({
      kind: 'step',
      step: { kind: 'mfa', challenge: { token: 'ch-1', expiresAt: 301_000, ttl: 300, trustDays: null, trustLapsed: false } },
      graceUntil: null,
    })
  })

  it('mfa_enrollment_required → enrolment, 15 minutes when the server omits the TTL', () => {
    const next = advance(challenge('mfa_enrollment_required'), 0)
    expect(next.kind === 'step' && next.step).toEqual({ kind: 'enroll', challenge: { token: 'ch-1', expiresAt: 900_000, ttl: 900, trustDays: null, trustLapsed: false } })
  })

  it('password_change_required → the new password step', () => {
    const next = advance(challenge('password_change_required', 300), 0)
    expect(next.kind === 'step' && next.step.kind).toBe('password')
  })

  it('carries the trust offer (days) and a lapsed browser trust into the challenge', () => {
    const next = advance({ ...challenge('mfa_required', 300), device_trust_days: 7, device_token_invalid: true }, 0)
    expect(next.kind === 'step' && next.step.kind === 'mfa' && next.step.challenge).toMatchObject({ trustDays: 7, trustLapsed: true })
    const enrol = advance({ ...challenge('mfa_enrollment_required'), device_trust_days: 30 }, 0)
    expect(enrol.kind === 'step' && enrol.step.kind === 'enroll' && enrol.step.challenge).toMatchObject({ trustDays: 30, trustLapsed: false })
  })

  it('offers no trust when the API leaves the days out, or sends nonsense', () => {
    for (const days of [undefined, null, 0, -3]) {
      const next = advance({ ...challenge('mfa_required', 300), device_trust_days: days }, 0)
      expect(next.kind === 'step' && next.step.kind === 'mfa' && next.step.challenge.trustDays).toBeNull()
    }
  })

  it('a malformed answer is invalid (no tokens, or no challenge)', () => {
    expect(advance({ status: 'signed_in' })).toEqual({ kind: 'invalid' })
    expect(advance({ status: 'mfa_required' })).toEqual({ kind: 'invalid' })
  })
})

describe('code helpers', () => {
  it('accepts exactly six ASCII digits', () => {
    expect(isTotp('123456')).toBe(true)
    expect(isTotp('12345')).toBe(false)
    expect(isTotp('１２３４５６')).toBe(false)
    expect(isTotp('12345a')).toBe(false)
  })
  it('filters typed or pasted codes to six digits', () => {
    expect(totpInput('123 456')).toBe('123456')
    expect(totpInput('12-34-56-78')).toBe('123456')
    expect(totpInput('abc')).toBe('')
  })
  it('accepts recovery codes of 1..64 characters', () => {
    expect(isRecoveryCode(' abcd-efgh ')).toBe(true)
    expect(isRecoveryCode('   ')).toBe(false)
    expect(isRecoveryCode('x'.repeat(65))).toBe(false)
  })
  it('groups the setup key by four and labels TTLs', () => {
    expect(groupSecret('JBSWY3DPEHPK3PXP')).toBe('JBSW Y3DP EHPK 3PXP')
    expect(groupSecret('JBSWY3DPE')).toBe('JBSW Y3DP E')
    expect(ttlLabel(300)).toBe('5 minutes')
    expect(ttlLabel(900)).toBe('15 minutes')
    expect(ttlLabel(30)).toBe('1 minute')
    expect(daysLabel(30)).toBe('30 days')
    expect(daysLabel(1)).toBe('1 day')
  })
})
