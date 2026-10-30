/**
 * Reading the Google return once. The binding secret leaves sessionStorage on the first read, so
 * the read is kept per URL: React may render the page twice (StrictMode) and both renders must see
 * the same ticket; `complete` is called once per handle for the same reason.
 */
import { describeError, isApiError } from '@/api/errors'
import { liveDeviceTokens } from '@/features/mfa/trusted-device'
import { completeGoogle, type GoogleCompleteOut } from './api'
import { takeTicket, type GoogleIntent, type GoogleTicket } from './start'

export type GoogleErrorReason = 'failed' | 'cancelled' | 'expired' | 'unavailable' | 'too-many' | 'other'

export type Captured = { kind: 'error'; reason: GoogleErrorReason; intent: GoogleIntent } | { kind: 'go'; handle: string; ticket: GoogleTicket }

let captured: { key: string; value: Captured } | null = null
const inflight = new Map<string, Promise<GoogleCompleteOut>>()

export function resetGoogleReturn() {
  captured = null
  inflight.clear()
}

export function captureReturn(search: { handle?: string; error?: string }): Captured {
  const key = `${search.handle ?? ''}\n${search.error ?? ''}`
  if (captured?.key === key) return captured.value
  const ticket = takeTicket()
  const intent = ticket?.intent ?? 'login'
  let value: Captured
  if (search.error) value = { kind: 'error', reason: errorReason(search.error), intent }
  else if (!search.handle || !ticket) value = { kind: 'error', reason: 'failed', intent }
  else value = { kind: 'go', handle: search.handle, ticket }
  captured = { key, value }
  return value
}

/** The callback's `?error=`: `cancelled` at Google, `unavailable` (switched off mid-flow), else a failure. */
function errorReason(error: string): GoogleErrorReason {
  if (error === 'cancelled') return 'cancelled'
  if (error === 'unavailable') return 'unavailable'
  return 'failed'
}

/** One `complete` per handle, however often the effect runs. */
export function completeOnce(handle: string, bind: string) {
  let p = inflight.get(handle)
  if (!p) {
    p = completeGoogle(handle, bind, liveDeviceTokens())
    inflight.set(handle, p)
  }
  return p
}

/** A failed Google call as a reason. A used or unbound handle reads as "timed out". */
export function reasonFor(e: unknown): { reason: GoogleErrorReason; message?: string; ref: string | null } {
  if (!isApiError(e)) return { reason: 'other', message: describeError(e), ref: null }
  const ref = e.correlationId
  if (e.status === 401 && e.type === 'OAUTH_STATE_INVALID') return { reason: 'expired', ref }
  if (e.status === 401) return { reason: 'failed', ref }
  if (e.status === 429) return { reason: 'too-many', ref }
  if (e.status === 501) return { reason: 'unavailable', ref }
  return { reason: 'other', message: describeError(e), ref }
}
