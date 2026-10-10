import type { FieldPath, FieldValues, UseFormSetError } from 'react-hook-form'
import type { ErrorCode, ErrorDetail, ErrorReport } from './types'

/** `NETWORK` is synthesized client-side (status 0) when the server could not be reached or replied with a non-envelope body. */
export type ApiErrorType = ErrorCode | 'NETWORK'

/**
 * Normalized error for every failed API call. Branch on `type`, never on `message`.
 * `correlationId` equals the response `X-Request-ID` and is what support asks for.
 */
export class ApiError extends Error {
  readonly type: ApiErrorType
  readonly status: number
  readonly details: ErrorDetail[]
  readonly errorReport: ErrorReport | null
  readonly correlationId: string | null
  /** Seconds from the `Retry-After` header (429), or null when absent. */
  readonly retryAfter: number | null

  constructor(init: {
    type: ApiErrorType
    status: number
    message: string
    details?: ErrorDetail[] | null
    errorReport?: ErrorReport | null
    correlationId?: string | null
    retryAfter?: number | null
  }) {
    super(init.message)
    this.name = 'ApiError'
    this.type = init.type
    this.status = init.status
    this.details = init.details ?? []
    this.errorReport = init.errorReport ?? null
    this.correlationId = init.correlationId ?? null
    this.retryAfter = init.retryAfter ?? null
  }

  get isNetwork() {
    return this.status === 0
  }
}

interface Envelope {
  error: {
    type: ErrorCode
    message: string
    status: number
    correlation_id: string
    details?: ErrorDetail[] | null
    error_report?: ErrorReport | null
  }
}

function isEnvelope(body: unknown): body is Envelope {
  if (!body || typeof body !== 'object' || !('error' in body)) return false
  const e = (body as { error: unknown }).error
  return !!e && typeof e === 'object' && 'type' in e && 'status' in e
}

function parseRetryAfter(res: Response): number | null {
  const raw = res.headers.get('Retry-After')
  if (!raw) return null
  const n = Number(raw)
  if (Number.isFinite(n) && n >= 0) return Math.ceil(n)
  const date = Date.parse(raw)
  return Number.isNaN(date) ? null : Math.max(0, Math.ceil((date - Date.now()) / 1000))
}

/** Build an ApiError from a non-2xx response and its (already parsed) body. */
export function toApiError(res: Response, body: unknown): ApiError {
  const correlationId = res.headers.get('X-Request-ID')
  const retryAfter = parseRetryAfter(res)
  if (isEnvelope(body)) {
    const e = body.error
    return new ApiError({
      type: e.type,
      status: e.status ?? res.status,
      message: e.message,
      details: e.details,
      errorReport: e.error_report,
      correlationId: e.correlation_id ?? correlationId,
      retryAfter,
    })
  }
  // Proxy error page / HTML / empty body: the API itself did not answer.
  return new ApiError({
    type: 'NETWORK',
    status: 0,
    message: `Can't reach the server (HTTP ${res.status}).`,
    correlationId,
    retryAfter,
  })
}

export function networkError(cause?: unknown): ApiError {
  const err = new ApiError({ type: 'NETWORK', status: 0, message: "Can't reach the server." })
  if (cause) (err as { cause?: unknown }).cause = cause
  return err
}

export function asApiError(e: unknown): ApiError {
  if (e instanceof ApiError) return e
  if (e instanceof DOMException && e.name === 'AbortError') throw e
  return networkError(e)
}

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError

/** 501 NOT_IMPLEMENTED: render <NotAvailableYet/>, never a red error. */
export const isNotImplemented = (e: unknown) =>
  isApiError(e) && (e.status === 501 || e.type === 'NOT_IMPLEMENTED')

export const isNotFound = (e: unknown) => isApiError(e) && e.status === 404
export const isForbidden = (e: unknown) => isApiError(e) && e.status === 403
export const isRateLimited = (e: unknown) => isApiError(e) && e.status === 429
export const isNetworkError = (e: unknown) => isApiError(e) && e.status === 0
/** 422 whose loc is ["query","cursor"]: reset pagination to the first page. */
export const isInvalidCursor = (e: unknown) =>
  isApiError(e) &&
  e.status === 422 &&
  e.details.some((d) => d.loc[0] === 'query' && d.loc[1] === 'cursor')

/** Human sentence for a toast / error state. Branches on type/status only. */
export function describeError(e: unknown): string {
  if (!isApiError(e)) return 'Something went wrong. Reload the page and try again.'
  const err = e
  switch (err.status) {
    case 0:
      return "Can't reach the server. Check your connection and try again."
    case 400:
      return 'The request could not be sent.'
    case 401:
      return 'Your session ended. Sign in again.'
    case 403:
      return "You don't have permission for this."
    case 404:
      return 'This item was not found. It may have been removed.'
    case 409:
      return 'This conflicts with the current state. Refresh and try again.'
    case 413:
      return 'File or draft too large.'
    case 422:
      return err.details[0]?.msg ?? 'Some values are not valid.'
    case 429:
      return `Too many requests. Retry in ${err.retryAfter ?? 60} s.`
    case 501:
      return 'This feature is not available yet.'
    default:
      return err.status >= 500 ? 'Something went wrong on our side.' : err.message
  }
}

/**
 * Map a 422 VALIDATION_FAILED onto react-hook-form fields:
 * for each detail whose loc[0] is "body", set the error at loc.slice(1).join(".").
 * `prefix` strips a wrapper (e.g. "listing" for {"listing": {...}} bodies).
 * Returns the details it could NOT map (query/path/header, or unknown fields) so callers can toast them.
 */
export function applyFieldErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  opts: { prefix?: string; fields?: readonly string[] } = {},
): ErrorDetail[] {
  if (!isApiError(error) || error.status !== 422) return []
  const unmapped: ErrorDetail[] = []
  let first = true
  for (const d of error.details) {
    if (d.loc[0] !== 'body' || d.loc.length < 2) {
      unmapped.push(d)
      continue
    }
    let path = d.loc.slice(1).map(String)
    if (opts.prefix && path[0] === opts.prefix) path = path.slice(1)
    const name = path.join('.')
    if (!name || (opts.fields && !opts.fields.some((f) => name === f || name.startsWith(`${f}.`)))) {
      unmapped.push(d)
      continue
    }
    setError(name as FieldPath<T>, { type: 'server', message: d.msg }, { shouldFocus: first })
    first = false
  }
  return unmapped
}
