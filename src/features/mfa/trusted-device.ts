/**
 * Trusted browsers (contract 2.1.0, ADR-0023): after a correct login code the person may let this
 * browser skip the code at the next sign-in. The API answers a `device_token` (43 base64url
 * characters, 256 random bits); this module keeps it in localStorage, one entry per account, and
 * hands it back at the next sign-in in the request body only (never a URL).
 *
 *   key    `kuinn.dt.<base64url(sha256(trimmed, lower-cased email))>`, so one account's entry is
 *          never sent for another, and the stored keys do not spell out who signed in here
 *   value  `{ token, expiresAt, savedAt }`
 *
 * The server alone decides whether a token still counts (it stores only a hash, bound to the user,
 * with a fixed expiry, and swaps the value on every use). The local expiry only saves sending a
 * token that cannot work. At most `MAX_ACCOUNTS` entries live in one browser; the oldest goes.
 *
 * Every storage access is wrapped: blocked storage (a private window, a strict browser) simply
 * means no trust, never an error. Tokens never go to the query cache, logs or analytics.
 */
import type { LoginResult } from '@/api/types'
import { b64url } from '@/features/google/start'

export const DEVICE_KEY_PREFIX = 'kuinn.dt.'
/** Trusted accounts kept per browser (the API takes at most 5 tokens on the Google path). */
export const MAX_ACCOUNTS = 5
/** The contract's DeviceToken pattern: anything else would answer 422, so it is never sent. */
const TOKEN = /^[A-Za-z0-9_-]{43}$/

interface Entry {
  token: string
  /** Epoch ms after which the server refuses the token. */
  expiresAt: number
  /** Epoch ms of the last write, for keeping the newest `MAX_ACCOUNTS`. */
  savedAt: number
}

/**
 * How long a new trust lasts, for copy only (backend `TRUST_DAYS_BRAND` / `TRUST_DAYS_ADMIN`). The
 * sign-in steps use the API's `device_trust_days` instead; Settings has no sign-in answer to read.
 */
export const TRUST_DAYS = { brand: 30, admin: 7 } as const

export const normalizeEmail = (email: string) => email.trim().toLowerCase()

/** The storage key for an account, or null when this browser cannot hash (no WebCrypto). */
export async function deviceKey(email: string): Promise<string | null> {
  const e = normalizeEmail(email)
  if (!e) return null
  try {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(e))
    return DEVICE_KEY_PREFIX + b64url(new Uint8Array(digest))
  } catch {
    return null
  }
}

function parse(raw: string | null): Entry | null {
  if (!raw) return null
  try {
    const v = JSON.parse(raw) as Partial<Entry>
    if (typeof v.token !== 'string' || !TOKEN.test(v.token)) return null
    if (typeof v.expiresAt !== 'number' || !Number.isFinite(v.expiresAt)) return null
    return { token: v.token, expiresAt: v.expiresAt, savedAt: typeof v.savedAt === 'number' ? v.savedAt : 0 }
  } catch {
    return null
  }
}

function remove(key: string) {
  try {
    localStorage.removeItem(key)
  } catch {
    // Blocked storage: nothing was stored either.
  }
}

/** Every entry in this browser, newest first. Broken or expired entries are deleted on the way. */
function entries(now = Date.now()): { key: string; entry: Entry }[] {
  const out: { key: string; entry: Entry }[] = []
  try {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k?.startsWith(DEVICE_KEY_PREFIX)) keys.push(k)
    }
    for (const key of keys) {
      const entry = parse(localStorage.getItem(key))
      if (!entry || entry.expiresAt <= now) remove(key)
      else out.push({ key, entry })
    }
  } catch {
    return []
  }
  return out.sort((a, b) => b.entry.savedAt - a.entry.savedAt)
}

/** This account's token, if this browser holds a live one. */
export async function readDeviceToken(email: string, now = Date.now()): Promise<string | null> {
  const key = await deviceKey(email)
  if (!key) return null
  try {
    const entry = parse(localStorage.getItem(key))
    if (entry && entry.expiresAt > now) return entry.token
    if (localStorage.getItem(key) !== null) remove(key)
  } catch {
    return null
  }
  return null
}

/**
 * Keep a token for this account. A malformed token or expiry is dropped (and any old entry with
 * it: it was just replaced on the server). Keeps the newest `MAX_ACCOUNTS` entries.
 */
export async function writeDeviceToken(email: string, token: string, expiresAt: string | null | undefined, now = Date.now()): Promise<void> {
  const key = await deviceKey(email)
  if (!key) return
  const exp = expiresAt ? new Date(expiresAt).getTime() : Number.NaN
  if (!TOKEN.test(token) || !Number.isFinite(exp) || exp <= now) return remove(key)
  try {
    localStorage.setItem(key, JSON.stringify({ token, expiresAt: exp, savedAt: now } satisfies Entry))
  } catch {
    return
  }
  for (const { key: old } of entries(now).slice(MAX_ACCOUNTS)) remove(old)
}

/** Forget this account's token (the server said it no longer counts, or the trust was removed). */
export async function forgetDeviceToken(email: string): Promise<void> {
  const key = await deviceKey(email)
  if (key) remove(key)
}

/**
 * Every live token in this browser, newest first, at most `MAX_ACCOUNTS`. For Google sign-in,
 * where the account is not known until the API answers: the server matches only the token bound
 * to that Google account's user, so the others are inert there.
 */
export function liveDeviceTokens(now = Date.now()): string[] {
  return entries(now)
    .slice(0, MAX_ACCOUNTS)
    .map((e) => e.entry.token)
}

/**
 * Apply what a sign-in answer says about this browser: keep a new or rotated token (only with
 * `signed_in`), or forget the old one when the API says it no longer counts.
 */
export async function rememberDevice(email: string | null | undefined, result: LoginResult | null | undefined): Promise<void> {
  if (!email || !result) return
  const signedIn = (result.status ?? 'signed_in') === 'signed_in'
  if (signedIn && result.device_token) return writeDeviceToken(email, result.device_token, result.device_expires_at)
  if (result.device_token_invalid) return forgetDeviceToken(email)
}
