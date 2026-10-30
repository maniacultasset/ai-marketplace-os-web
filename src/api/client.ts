import createClient from 'openapi-fetch'
import { asApiError, networkError, toApiError } from './errors'
import { API_BASE, API_ORIGIN, clearSession, getAccessToken, getSession, refreshOnce } from './session'
import { isStepUpRoute, notifyEnrollmentRequired, requestStepUp, stepUpModeFor } from './step-up'
import type { V1Paths } from './types'

/**
 * Ops that never carry a bearer token and whose 401 never triggers a refresh, matched exactly
 * against the path under /api/v1. `/signup/status` answers 401 for a wrong email/password, and the
 * four sign-in challenge routes (DPP-1) answer 401 for a wrong code or a dead challenge: neither may
 * end (or refresh) a session. The Google sign-in ops answer 401 for a used or unbound handle.
 * The bearer MFA routes (`/auth/mfa/*`, `/auth/password`) are not here.
 */
const PUBLIC_PATHS: ReadonlySet<string> = new Set([
  '/auth/login',
  '/auth/refresh',
  '/auth/logout',
  '/signup',
  '/signup/status',
  '/auth/login/mfa',
  '/auth/login/mfa/enroll',
  '/auth/login/mfa/confirm',
  '/auth/password/expired',
  '/auth/google/config',
  '/auth/google/complete',
  '/auth/google/link',
  '/signup/google',
])

const V1_PREFIX = new URL(API_BASE, 'http://x').pathname.replace(/\/+$/, '')

/** The request path under /api/v1 (`/members/abc`), or the full path for anything else. */
export function v1Path(url: string): string {
  const path = new URL(url, window.location.origin).pathname
  return path.startsWith(`${V1_PREFIX}/`) ? path.slice(V1_PREFIX.length) : path
}

export const isPublicPath = (url: string) => PUBLIC_PATHS.has(v1Path(url))

// ---------- connectivity (drives the "Can't reach the server" banner) ----------
let offline = false
const connListeners = new Set<() => void>()
export function setOffline(next: boolean) {
  if (offline === next) return
  offline = next
  connListeners.forEach((l) => l())
}
export const getOffline = () => offline
export function subscribeOffline(l: () => void) {
  connListeners.add(l)
  return () => connListeners.delete(l)
}

async function send(req: Request, token: string | null): Promise<Response> {
  const headers = new Headers(req.headers)
  if (!headers.has('X-Request-ID')) headers.set('X-Request-ID', crypto.randomUUID())
  if (token) headers.set('Authorization', `Bearer ${token}`)
  let res: Response
  try {
    res = await fetch(new Request(req, { headers, credentials: 'omit' }))
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e
    setOffline(true)
    throw networkError(e)
  }
  // The dev proxy answers 502/503/504 with a non-JSON body when the API is down.
  const isProxyFailure =
    res.status >= 502 && res.status <= 504 && !(res.headers.get('content-type') ?? '').includes('json')
  setOffline(isProxyFailure)
  return res
}

/** The envelope `error.type` of a 403, read from a clone so the caller can still parse the body. */
async function errorType(res: Response): Promise<string | null> {
  if (!(res.headers.get('content-type') ?? '').includes('json')) return null
  try {
    const body = (await res.clone().json()) as { error?: { type?: unknown } } | null
    return typeof body?.error?.type === 'string' ? body.error.type : null
  } catch {
    return null
  }
}

/**
 * fetch used by the typed client: attaches X-Request-ID + bearer token, and on a 401 from a
 * non-public op runs the single-flight refresh and replays the request once (same headers,
 * so the same Idempotency-Key). A second 401 ends the session.
 *
 * A 403 `MFA_STEP_UP_REQUIRED` opens the step-up dialog; after a code the request is replayed
 * once with the new access token (step-up.ts). A 403 `MFA_ENROLLMENT_REQUIRED` routes to
 * enrolment. Either way the caller gets the final response.
 */
export async function authFetch(input: Request): Promise<Response> {
  if (isPublicPath(input.url)) return send(input, null)

  // A pristine copy: each replay (refresh, step-up) sends a fresh clone of it.
  const template = input.clone()
  let token = getAccessToken()
  if (!token && getSession().status !== 'anonymous') token = await refreshOnce(null)
  let res = await send(input, token)
  /** The access token the current `res` was sent with. */
  let sent = token

  if (res.status === 401 && getSession().status !== 'anonymous') {
    const fresh = await refreshOnce(token)
    if (!fresh) return res
    sent = fresh
    res = await send(template.clone(), fresh)
    if (res.status === 401) {
      clearSession('expired', { broadcast: true })
      return res
    }
  }

  if (res.status !== 403) return res
  const path = v1Path(input.url)
  if (isStepUpRoute(path)) return res
  const type = await errorType(res)
  if (type === 'MFA_ENROLLMENT_REQUIRED') {
    notifyEnrollmentRequired()
    return res
  }
  if (type !== 'MFA_STEP_UP_REQUIRED') return res
  // The token changed while this request was in flight (a step-up done for a parallel request, or
  // another tab's): replay once with it before asking for another code.
  const now = getAccessToken()
  if (now && now !== sent) return send(template.clone(), now)
  if (!(await requestStepUp(stepUpModeFor(input.method, path)))) return res
  return send(template.clone(), getAccessToken())
}

/** Typed API client. Paths are relative to `/api/v1`: `api.GET('/auth/me')`. */
export const api = createClient<V1Paths>({ baseUrl: API_BASE, fetch: authFetch })

interface FetchResult<T> {
  data?: T
  error?: unknown
  response: Response
}

/**
 * Await an openapi-fetch call and return `data`, or throw a normalized ApiError.
 *   const me = await unwrap(api.GET('/auth/me'))
 */
export async function unwrap<T>(call: Promise<FetchResult<T>>): Promise<T> {
  let result: FetchResult<T>
  try {
    result = await call
  } catch (e) {
    throw asApiError(e)
  }
  const { data, error, response } = result
  if (!response.ok || error !== undefined) throw toApiError(response, error)
  return data as T
}

/**
 * Unprefixed probes (`/healthz`, `/readyz`): plain JSON, not the error envelope. Prefer `/readyz`:
 * Cloud Run's front end answers `/healthz` itself on `*.run.app`.
 */
export async function probe(path: '/healthz' | '/readyz'): Promise<{ ok: boolean; status: number; body: unknown }> {
  try {
    const res = await fetch(`${API_ORIGIN}${path}`, { credentials: 'omit', cache: 'no-store' })
    const body = await res.json().catch(() => null)
    // A proxy or SPA fallback can answer 200 with HTML; only the API's JSON counts as healthy.
    return { ok: res.ok && body !== null, status: res.status, body }
  } catch {
    return { ok: false, status: 0, body: null }
  }
}
