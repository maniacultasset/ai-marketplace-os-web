import createClient from 'openapi-fetch'
import { asApiError, networkError, toApiError } from './errors'
import { API_BASE, API_ORIGIN, clearSession, getAccessToken, getSession, refreshOnce } from './session'
import type { V1Paths } from './types'

/**
 * Ops that never carry a bearer token and whose 401 never triggers a refresh. `/signup/status`
 * answers 401 for a wrong email/password, which must not end (or refresh) a session.
 */
const PUBLIC_PATHS = ['/auth/login', '/auth/refresh', '/auth/logout', '/api/v1/signup', '/signup/status']

function isPublic(url: string) {
  const path = new URL(url, window.location.origin).pathname
  return PUBLIC_PATHS.some((p) => path.endsWith(p))
}

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

/**
 * fetch used by the typed client: attaches X-Request-ID + bearer token, and on a 401 from a
 * non-public op runs the single-flight refresh and replays the request once (same headers,
 * so the same Idempotency-Key). A second 401 ends the session.
 */
export async function authFetch(input: Request): Promise<Response> {
  if (isPublic(input.url)) return send(input, null)

  let token = getAccessToken()
  if (!token && getSession().status !== 'anonymous') token = await refreshOnce(null)
  const replay = input.clone()
  const first = await send(input, token)
  if (first.status !== 401 || getSession().status === 'anonymous') return first

  const fresh = await refreshOnce(token)
  if (!fresh) return first
  const second = await send(replay, fresh)
  if (second.status === 401) clearSession('expired', { broadcast: true })
  return second
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
