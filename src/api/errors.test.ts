import { describe, expect, it, vi } from 'vitest'
import { applyFieldErrors, describeError, isForbidden, isInvalidCursor, isMfaRequired, isNotImplemented, toApiError } from './errors'

const envelope = (status: number, type: string, details: unknown = null) => ({
  error: { type, message: 'm', status, correlation_id: 'req-1', details, error_report: null },
})

describe('toApiError', () => {
  it('reads the envelope, request id and Retry-After', () => {
    const res = new Response(null, { status: 429, headers: { 'X-Request-ID': 'req-1', 'Retry-After': '17' } })
    const e = toApiError(res, envelope(429, 'RATE_LIMITED'))
    expect(e.type).toBe('RATE_LIMITED')
    expect(e.status).toBe(429)
    expect(e.correlationId).toBe('req-1')
    expect(e.retryAfter).toBe(17)
  })
  it('treats non-envelope bodies (proxy pages) as NETWORK', () => {
    const e = toApiError(new Response(null, { status: 502 }), '<html>')
    expect(e.type).toBe('NETWORK')
    expect(e.status).toBe(0)
  })
  it('flags 501 and invalid cursors', () => {
    expect(isNotImplemented(toApiError(new Response(null, { status: 501 }), envelope(501, 'NOT_IMPLEMENTED')))).toBe(true)
    const cursor = toApiError(
      new Response(null, { status: 422 }),
      envelope(422, 'VALIDATION_FAILED', [{ loc: ['query', 'cursor'], msg: 'Invalid cursor.' }]),
    )
    expect(isInvalidCursor(cursor)).toBe(true)
  })
})

describe('applyFieldErrors', () => {
  it('maps body locs to fields and returns the rest', () => {
    const e = toApiError(
      new Response(null, { status: 422 }),
      envelope(422, 'VALIDATION_FAILED', [
        { loc: ['body', 'sku'], msg: 'bad sku' },
        { loc: ['body', 'listing', 'content', 'bullets', 2], msg: 'too long' },
        { loc: ['query', 'limit'], msg: 'bad limit' },
      ]),
    )
    const setError = vi.fn()
    const rest = applyFieldErrors(e, setError, { prefix: 'listing' })
    expect(setError).toHaveBeenCalledWith('sku', { type: 'server', message: 'bad sku' }, { shouldFocus: true })
    expect(setError).toHaveBeenCalledWith('content.bullets.2', { type: 'server', message: 'too long' }, { shouldFocus: false })
    expect(rest).toEqual([{ loc: ['query', 'limit'], msg: 'bad limit' }])
  })
})

describe('login-code 403s (DPP-1)', () => {
  const e403 = (type: string) => toApiError(new Response(null, { status: 403 }), envelope(403, type))
  it('are not role denials', () => {
    expect(isMfaRequired(e403('MFA_STEP_UP_REQUIRED'))).toBe(true)
    expect(isMfaRequired(e403('MFA_ENROLLMENT_REQUIRED'))).toBe(true)
    expect(isForbidden(e403('MFA_STEP_UP_REQUIRED'))).toBe(false)
    expect(isForbidden(e403('PERMISSION_DENIED'))).toBe(true)
    expect(isMfaRequired(e403('PERMISSION_DENIED'))).toBe(false)
  })
  it('say what to do instead of "no permission"', () => {
    expect(describeError(e403('MFA_STEP_UP_REQUIRED'))).toBe('Not changed: this needs a code from your authenticator app.')
    expect(describeError(e403('MFA_ENROLLMENT_REQUIRED'))).toBe('Set up login codes in Settings > Security, then try again.')
    expect(describeError(e403('PERMISSION_DENIED'))).toBe("You don't have permission for this.")
  })
})
