/**
 * The sign-in state machine (contract 2.0.0). Every answer of /auth/login, /auth/login/mfa,
 * /auth/password/expired (and the `result` of /auth/login/mfa/confirm) is a `LoginResult`; its
 * `status` says what comes next. Only `signed_in` carries tokens; every other status carries a
 * challenge token, which lives in component memory only (never storage, never the query cache).
 */
import type { LoginResult, TokenResponse } from '@/api/types'

/** Attempts per challenge (ADR-0021 §1); the server burns the challenge after the 5th miss. */
export const CHALLENGE_ATTEMPTS = 5
/** Fallbacks when the server omits `challenge_expires_in`: 15 minutes to enrol, else 5. */
export const ENROLL_TTL_S = 900
export const CHALLENGE_TTL_S = 300

export interface Challenge {
  token: string
  /** Epoch ms after which the server refuses the challenge. */
  expiresAt: number
  /** The TTL the server gave, in seconds (for the "expires after N minutes" hint). */
  ttl: number
}

export type FlowStep =
  | { kind: 'credentials' }
  | { kind: 'mfa'; challenge: Challenge }
  | { kind: 'enroll'; challenge: Challenge }
  | { kind: 'password'; challenge: Challenge }
  /** `next` is decided when the confirm answer arrives, so its challenge clock is the server's. */
  | { kind: 'recovery-codes'; codes: string[]; next: Advance }

export type Advance =
  | { kind: 'signed-in'; tokens: TokenResponse; graceUntil: string | null }
  | { kind: 'step'; step: FlowStep; graceUntil: string | null }
  /** A malformed answer (no tokens and no challenge): start over. */
  | { kind: 'invalid' }

/** Decide the next step from a `LoginResult`. A missing `status` (an older API) means signed in. */
export function advance(result: LoginResult, now = Date.now()): Advance {
  const status = result.status ?? 'signed_in'
  const graceUntil = result.mfa_grace_until ?? null
  if (status === 'signed_in') {
    const { access_token, refresh_token, expires_in, memberships } = result
    if (!access_token || !refresh_token || !expires_in || !memberships) return { kind: 'invalid' }
    return {
      kind: 'signed-in',
      tokens: { access_token, refresh_token, expires_in, memberships, token_type: 'bearer' },
      graceUntil,
    }
  }
  if (!result.challenge_token) return { kind: 'invalid' }
  const ttl = result.challenge_expires_in ?? (status === 'mfa_enrollment_required' ? ENROLL_TTL_S : CHALLENGE_TTL_S)
  const challenge: Challenge = { token: result.challenge_token, expiresAt: now + ttl * 1000, ttl }
  const kind = status === 'mfa_required' ? 'mfa' : status === 'mfa_enrollment_required' ? 'enroll' : 'password'
  return { kind: 'step', step: { kind, challenge }, graceUntil }
}

/** "5 minutes" / "15 minutes" for a TTL in seconds. */
export function ttlLabel(ttl: number): string {
  const min = Math.max(1, Math.round(ttl / 60))
  return `${min} minute${min === 1 ? '' : 's'}`
}

/** A TOTP code: exactly six ASCII digits (the backend pattern `^[0-9]{6}$`). */
export const isTotp = (v: string) => /^[0-9]{6}$/.test(v)

/** Keep digits only, at most six (paste of "123 456" or "123-456" works). */
export const totpInput = (v: string) => v.replace(/[^0-9]/g, '').slice(0, 6)

/** A recovery code as typed; case, spaces and dashes are ignored by the server. 1..64 characters. */
export const isRecoveryCode = (v: string) => {
  const t = v.trim()
  return t.length >= 1 && t.length <= 64
}

/** "JBSWY3DPEHPK3PXP" → "JBSW Y3DP EHPK 3PXP" for manual entry. */
export function groupSecret(secret: string): string {
  return secret.replace(/\s+/g, '').replace(/(.{4})(?=.)/g, '$1 ')
}

/** Why the flow went back to the email and password form. */
export type RestartReason = 'expired' | 'attempts' | 'mfa-off' | 'invalid'

export const RESTART_MESSAGES: Record<RestartReason, string> = {
  expired: 'That sign-in step timed out. Sign in again.',
  attempts: 'Too many codes did not work. Sign in again to get a new try.',
  'mfa-off': 'Login codes are not available right now. Try again later, or contact support if this continues.',
  invalid: 'Something went wrong while signing in. Try again.',
}

/** Wrong code or a dead challenge: the same 401, the same words. */
export const CODE_REJECTED = "That code didn't work. Check it and try again."

/**
 * A 429 on a sign-in or code form. Fixed text: the alert is assertive, so a count in it would be
 * read out every second; the seconds left show on the disabled submit button.
 */
export const TOO_MANY = 'Too many attempts. Wait for the timer on the button, then try again.'
