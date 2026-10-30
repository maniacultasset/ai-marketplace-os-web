/**
 * Starting a Google sign-in, and picking it up again on /auth/google.
 *
 * Before leaving for Google the browser makes a 32-byte random secret and keeps it in
 * sessionStorage (this tab only). `start` receives only its SHA-256; `complete`, `link` and
 * `/signup/google` must send the secret itself, so a handle that leaks (or is planted by another
 * site) is useless in any other browser. The secret never goes in a URL, and it is removed from
 * storage the moment /auth/google reads it; after that it lives in component memory only.
 *
 * The intent (sign in or sign up) is kept here too. It only picks the copy on /auth/google; the
 * server never sees it and it never changes what the server allows.
 */
import { safeRedirect } from '@/lib/redirect'

const KEY = 'gsi'
/** Always relative: the API is reached through the same-origin `/api` rewrite, never another host. */
export const GOOGLE_START_PATH = '/api/v1/auth/google/start'

export type GoogleIntent = 'login' | 'signup'

/** Google's own button wording for each intent. */
export const GOOGLE_LABEL: Record<GoogleIntent, string> = {
  login: 'Continue with Google',
  signup: 'Sign up with Google',
}

export interface GoogleTicket {
  /** The binding secret, base64url of 32 random bytes (43 characters). */
  bind: string
  /** Where to go after signing in, already passed through `safeRedirect`. */
  returnTo: string | null
  intent: GoogleIntent
}

const B64URL_32 = /^[A-Za-z0-9_-]{43}$/

export function b64url(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** A fresh binding secret and its SHA-256 (over the 32 raw bytes), both base64url. */
export async function newBinding(): Promise<{ secret: string; hash: string }> {
  const raw = crypto.getRandomValues(new Uint8Array(32))
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', raw))
  return { secret: b64url(raw), hash: b64url(digest) }
}

/** Thrown when this browser blocks sessionStorage: the sign-in could not be finished here. */
export class StorageBlockedError extends Error {
  constructor() {
    super('Session storage is blocked')
    this.name = 'StorageBlockedError'
  }
}

/**
 * Store the ticket and leave for Google. `go` is the navigation (a full page load, so the
 * browser's own Google session and cookies are used, and nothing of ours is in that request).
 */
export async function startGoogle(
  { intent, returnTo }: { intent: GoogleIntent; returnTo?: string | null },
  go: (url: string) => void = (url) => window.location.assign(url),
): Promise<void> {
  const { secret, hash } = await newBinding()
  const ticket: GoogleTicket = { bind: secret, returnTo: safeRedirect(returnTo), intent }
  try {
    sessionStorage.setItem(KEY, JSON.stringify(ticket))
    if (sessionStorage.getItem(KEY) === null) throw new StorageBlockedError()
  } catch {
    throw new StorageBlockedError()
  }
  go(`${GOOGLE_START_PATH}?b=${hash}`)
}

/** Read and remove the stored ticket (one use). Anything malformed counts as missing. */
export function takeTicket(): GoogleTicket | null {
  let raw: string | null = null
  try {
    raw = sessionStorage.getItem(KEY)
    sessionStorage.removeItem(KEY)
  } catch {
    return null
  }
  if (!raw) return null
  try {
    const t = JSON.parse(raw) as Partial<GoogleTicket>
    if (typeof t.bind !== 'string' || !B64URL_32.test(t.bind)) return null
    return {
      bind: t.bind,
      returnTo: safeRedirect(t.returnTo),
      intent: t.intent === 'signup' ? 'signup' : 'login',
    }
  } catch {
    return null
  }
}
