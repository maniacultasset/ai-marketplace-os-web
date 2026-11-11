/**
 * What the approved card hands the sign-in page, in the browser's history state (never in the
 * URL, a log or storage): that the brand was just approved, and the email the person applied with
 * when the page knew it. The sign-in page fills the email in and says why one sign-in is needed.
 */
import { EMAIL_PATTERN, LOGIN_EMAIL_MAX } from '@/lib/validation'

declare module '@tanstack/react-router' {
  interface HistoryState {
    approvedSignIn?: { email?: string }
  }
}

const plausible = (v: unknown): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= LOGIN_EMAIL_MAX && EMAIL_PATTERN.test(v.trim())

/** The history state for the approved card's link to /login. */
export function approvedSignIn(email?: string | null): { approvedSignIn: { email?: string } } {
  return { approvedSignIn: plausible(email) ? { email: email.trim() } : {} }
}

/** Read back on /login: null when the page was not opened from an approved card. */
export function readApprovedSignIn(state: unknown): { email: string | null } | null {
  if (!state || typeof state !== 'object') return null
  const entry = (state as { approvedSignIn?: unknown }).approvedSignIn
  if (!entry || typeof entry !== 'object') return null
  const email = (entry as { email?: unknown }).email
  return { email: plausible(email) ? email.trim() : null }
}
