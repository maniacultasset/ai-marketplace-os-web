/**
 * The sign-up status handle (backend ADR-0019 amendment, 11 Nov 2026): an opaque, read-only value
 * the sign-up answers return (`status_handle`). The waiting screens send it to
 * POST /signup/status/poll to learn the decision without a password or a new Google sign-in.
 *
 * Kept in localStorage so a closed tab can come back on this device. Only the handle, how the person
 * signs in (`password` or `google`) and where to go after signing in are stored: no email, brand
 * or name. The handle only travels in a request body, never in a URL. Every storage access is
 * wrapped: a browser that blocks storage still gets a live page while it stays open.
 */
import { safeRedirect } from '@/lib/redirect'

const KEY = 'kuinn.signup-status'
const HANDLE = /^[A-Za-z0-9_-]{43}$/

export type SignInVia = 'password' | 'google'

export interface StatusHandleEntry {
  handle: string
  via: SignInVia
  /** Where to go after signing in, already passed through `safeRedirect`. */
  returnTo: string | null
}

export const isStatusHandle = (value: unknown): value is string => typeof value === 'string' && HANDLE.test(value)

/** Keep the newest handle; false when this browser blocks storage (or the handle is malformed). */
export function saveStatusHandle(entry: StatusHandleEntry): boolean {
  if (!isStatusHandle(entry.handle)) return false
  try {
    const value: StatusHandleEntry = { handle: entry.handle, via: entry.via, returnTo: safeRedirect(entry.returnTo) ?? null }
    localStorage.setItem(KEY, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

/** The stored handle, or null (none, unreadable, malformed or blocked storage). */
export function readStatusHandle(): StatusHandleEntry | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const { handle, via, returnTo } = parsed as Record<string, unknown>
    if (!isStatusHandle(handle) || (via !== 'password' && via !== 'google')) return null
    return { handle, via, returnTo: typeof returnTo === 'string' ? safeRedirect(returnTo) : null }
  } catch {
    return null
  }
}

export function clearStatusHandle(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // storage blocked: nothing was kept
  }
}
