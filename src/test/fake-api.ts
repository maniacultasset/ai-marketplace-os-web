/**
 * Test helpers for code that goes through the real API client: a fake `fetch` routed by method and
 * path under /api/v1, envelope bodies, and unsigned JWTs the session store can decode.
 */
import { vi } from 'vitest'

export interface Call {
  method: string
  path: string
  body: unknown
  auth: string | null
}

export type Handler = (call: Call) => Response | Promise<Response>

/** An unsigned JWT with `sub`, `tid` and `exp` (the claims session.ts decodes). */
export function jwt(claims: { sub?: string; tid?: string; exp?: number; [k: string]: unknown } = {}): string {
  const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
  const payload = { sub: 'u1', tid: 't1', exp: Math.floor(Date.now() / 1000) + 1800, ...claims }
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.sig`
}

export const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'X-Request-ID': 'req-test', ...headers },
  })

export const envelope = (status: number, type: string, message = 'm', details: unknown[] | null = null) =>
  json(status, { error: { type, message, status, correlation_id: 'req-test', details, error_report: null } })

/**
 * Replace global fetch. `routes` maps "METHOD /path" (under /api/v1) to a handler, or to a list of
 * handlers used in order (the last one repeats). Unrouted calls answer 404.
 */
export function installFetch(routes: Record<string, Handler | Handler[]>) {
  const calls: Call[] = []
  const used: Record<string, number> = {}
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = input instanceof Request ? input : new Request(input, init)
    const url = new URL(req.url, 'http://localhost')
    const path = url.pathname.replace(/^\/api\/v1/, '')
    const text = req.method === 'GET' || req.method === 'HEAD' ? '' : await req.text()
    const call: Call = { method: req.method, path, body: text ? JSON.parse(text) : null, auth: req.headers.get('Authorization') }
    calls.push(call)
    const key = `${req.method} ${path}`
    const route = routes[key]
    if (!route) return envelope(404, 'NOT_FOUND')
    if (Array.isArray(route)) {
      const i = Math.min(used[key] ?? 0, route.length - 1)
      used[key] = (used[key] ?? 0) + 1
      return route[i]!(call)
    }
    return route(call)
  })
  vi.stubGlobal('fetch', fetchMock)
  return { calls, fetchMock }
}
