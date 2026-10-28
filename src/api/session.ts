/**
 * Token + session store.
 *
 * - access token: memory only (this module), with decoded `exp`/`tid`/`sub` (never `roles`).
 * - refresh token: localStorage `mkos.rt` (bearer-only API; rotation + reuse detection server side).
 * - refreshOnce(): single-flight within the tab (shared promise) AND across tabs (Web Locks
 *   `mkos-refresh`). A concurrent reuse of one refresh token revokes the whole family on the
 *   backend, so no two refreshes may ever present the same token.
 * - BroadcastChannel `mkos-auth` shares new access tokens and login/logout/switch events.
 */
import { networkError, toApiError } from './errors'
import type { TokenResponse } from './types'

/**
 * Where the backend lives. Empty (the default) means same origin: the API is served next to the
 * app, or the dev server proxies to it. Set VITE_API_ORIGIN (e.g. https://api.example.com) when
 * the API is on another origin; that origin must list this app in its ALLOWED_ORIGINS.
 */
export const API_ORIGIN = ((import.meta.env.VITE_API_ORIGIN as string | undefined) ?? '').replace(/\/+$/, '')
export const API_BASE = `${API_ORIGIN}/api/v1`
const RT_KEY = 'mkos.rt'
const LOCK_NAME = 'mkos-refresh'
const CHANNEL_NAME = 'mkos-auth'

export type SessionStatus = 'unknown' | 'authenticated' | 'anonymous' | 'unreachable'
export type EndReason = 'logout' | 'expired' | 'remote-logout'

export interface SessionState {
  status: SessionStatus
  tenantId: string | null
  userId: string | null
  /** Why the last session ended; read by the login page to explain the redirect. */
  endReason: EndReason | null
}

interface Access {
  token: string
  exp: number // epoch ms
  tid: string
  sub: string
}

type BroadcastMsg =
  | { type: 'tokens'; access_token: string }
  | { type: 'login'; access_token: string }
  | { type: 'logout' }
  | { type: 'switch'; tenant_id: string }

let access: Access | null = null
let state: SessionState = { status: 'unknown', tenantId: null, userId: null, endReason: null }
const listeners = new Set<() => void>()
const endListeners = new Set<(reason: EndReason) => void>()
let refreshTimer: ReturnType<typeof setTimeout> | null = null
let inflight: Promise<string | null> | null = null
let refreshCount = 0

// ---------- storage ----------
function readRt(): string | null {
  try {
    return localStorage.getItem(RT_KEY)
  } catch {
    return null
  }
}
function writeRt(rt: string | null) {
  try {
    if (rt) localStorage.setItem(RT_KEY, rt)
    else localStorage.removeItem(RT_KEY)
  } catch {
    /* storage blocked: session lasts for this tab only */
  }
}

// ---------- jwt ----------
function decodeJwt(token: string): Access | null {
  try {
    const part = token.split('.')[1]
    if (!part) return null
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '='))
    const claims = JSON.parse(json) as { exp?: number; tid?: string; sub?: string }
    if (!claims.exp || !claims.tid || !claims.sub) return null
    return { token, exp: claims.exp * 1000, tid: claims.tid, sub: claims.sub }
  } catch {
    return null
  }
}

// ---------- state ----------
function setState(next: Partial<SessionState>) {
  state = { ...state, ...next }
  listeners.forEach((l) => l())
}

export function subscribeSession(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
export const getSession = () => state
export const getAccessToken = () => access?.token ?? null
export const hasRefreshToken = () => readRt() !== null

/** Called when the session ends for any reason (cache clear + redirect live in the app layer). */
export function onSessionEnd(fn: (reason: EndReason) => void) {
  endListeners.add(fn)
  return () => endListeners.delete(fn)
}

function adoptAccess(token: string): boolean {
  const decoded = decodeJwt(token)
  if (!decoded) return false
  access = decoded
  scheduleProactiveRefresh()
  setState({ status: 'authenticated', tenantId: decoded.tid, userId: decoded.sub, endReason: null })
  return true
}

function scheduleProactiveRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer)
  if (!access) return
  // expires_in - 60 s, through the same single-flight.
  const delay = Math.max(5_000, access.exp - Date.now() - 60_000)
  refreshTimer = setTimeout(() => {
    void refreshOnce(access?.token ?? null).catch(() => undefined)
  }, delay)
}

/** Store a TokenResponse from login / refresh / switch. */
export function storeTokens(t: TokenResponse) {
  writeRt(t.refresh_token)
  adoptAccess(t.access_token)
}

/**
 * Swap in the access token of a step-up (POST /auth/mfa/step-up). `StepUpOut` has no refresh
 * token, so this never goes through `storeTokens` (which would wipe the stored one). Only a token
 * for the same user and tenant is taken; other tabs adopt it through the usual broadcast.
 */
export function adoptStepUpToken(token: string): boolean {
  const decoded = decodeJwt(token)
  if (!decoded || decoded.sub !== state.userId || decoded.tid !== state.tenantId) return false
  adoptAccess(token)
  post({ type: 'tokens', access_token: token })
  return true
}

/** Drop everything locally. `broadcast` tells other tabs to do the same. */
export function clearSession(reason: EndReason, opts: { broadcast?: boolean } = {}) {
  const wasAuthed = state.status === 'authenticated'
  access = null
  if (refreshTimer) clearTimeout(refreshTimer)
  refreshTimer = null
  if (reason !== 'remote-logout') writeRt(null)
  setState({ status: 'anonymous', tenantId: null, userId: null, endReason: reason })
  if (opts.broadcast) post({ type: 'logout' })
  if (wasAuthed) endListeners.forEach((fn) => fn(reason))
}

// ---------- cross-tab ----------
const channel: BroadcastChannel | null =
  typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL_NAME) : null

function post(msg: BroadcastMsg) {
  try {
    channel?.postMessage(msg)
  } catch {
    /* ignore */
  }
}
export const broadcast = post

channel?.addEventListener('message', (ev: MessageEvent<BroadcastMsg>) => {
  const msg = ev.data
  switch (msg.type) {
    case 'tokens':
      // Another tab rotated the family; adopt its access token if it is for our tenant.
      if (state.status === 'authenticated') {
        const d = decodeJwt(msg.access_token)
        if (d && d.tid === state.tenantId && d.sub === state.userId) adoptAccess(msg.access_token)
      }
      break
    case 'login':
      if (state.status !== 'authenticated') adoptAccess(msg.access_token)
      break
    case 'logout':
      if (state.status === 'authenticated') clearSession('remote-logout')
      break
    case 'switch':
      // Deep links are tenant-scoped; reload at the root under the new tenant.
      if (state.status === 'authenticated' && msg.tenant_id !== state.tenantId) window.location.assign('/')
      break
  }
})

// ---------- refresh ----------
async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined
  if (locks?.request) return locks.request(LOCK_NAME, { mode: 'exclusive' }, fn) as Promise<T>
  return fn()
}

function waitForAccessChange(stale: string | null, ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    if (access && access.token !== stale) return resolve(true)
    const t = setTimeout(() => {
      off()
      resolve(false)
    }, ms)
    const off = subscribeSession(() => {
      if (access && access.token !== stale) {
        clearTimeout(t)
        off()
        resolve(true)
      }
    })
  })
}

/**
 * Get a fresh access token. `staleAccess` is the token that just failed (or is about to expire);
 * if memory already holds a different, unexpired one (another caller/tab refreshed), it is reused.
 * Resolves null when the session is over (cleared + end listeners fired). Throws ApiError on
 * transient failures (network, 429) without clearing the session.
 */
export function refreshOnce(staleAccess: string | null): Promise<string | null> {
  if (access && access.token !== staleAccess && access.exp - Date.now() > 10_000) {
    return Promise.resolve(access.token)
  }
  if (inflight) return inflight
  const startedWithRt = readRt()
  inflight = withLock(async () => {
    const rt = readRt()
    if (!rt) {
      if (state.status === 'authenticated') clearSession('expired')
      return null
    }
    if (startedWithRt && rt !== startedWithRt) {
      // Another tab rotated while we waited for the lock: adopt its broadcast access token.
      if (await waitForAccessChange(staleAccess, 750)) return access!.token
      // No broadcast received: `rt` is the newest token and unused, so rotating it is safe.
    }
    let res: Response
    try {
      refreshCount += 1
      res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Request-ID': crypto.randomUUID() },
        body: JSON.stringify({ refresh_token: rt }),
        credentials: 'omit',
      })
    } catch (e) {
      throw networkError(e)
    }
    if (res.ok) {
      const t = (await res.json()) as TokenResponse
      storeTokens(t)
      post({ type: 'tokens', access_token: t.access_token })
      return t.access_token
    }
    const body = await res.json().catch(() => null)
    const err = toApiError(res, body)
    if (res.status === 401 || res.status === 422) {
      clearSession('expired', { broadcast: true })
      return null
    }
    throw err
  }).finally(() => {
    inflight = null
  })
  return inflight
}

let restorePromise: Promise<SessionStatus> | null = null

/** Boot: if `mkos.rt` exists, refresh to obtain an access token. Idempotent per page load. */
export function restoreSession(): Promise<SessionStatus> {
  if (state.status === 'authenticated' || state.status === 'anonymous') {
    return Promise.resolve(state.status)
  }
  if (restorePromise) return restorePromise
  restorePromise = (async () => {
    if (!readRt()) {
      setState({ status: 'anonymous' })
      return state.status
    }
    try {
      const token = await refreshOnce(null)
      if (!token) setState({ status: 'anonymous' })
    } catch {
      // Network failure or 429 on boot: keep the refresh token, let the user retry.
      setState({ status: 'unreachable' })
    }
    return state.status
  })().finally(() => {
    restorePromise = null
  })
  return restorePromise
}

/** Retry after an "unreachable" boot. */
export function retryRestore() {
  if (state.status === 'unreachable') setState({ status: 'unknown' })
  return restoreSession()
}

/** The refresh token currently stored (used by logout / tenant switch). */
export const currentRefreshToken = readRt

// ---------- dev/test hooks ----------
if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as { __mkosTest: unknown }).__mkosTest = {
    corruptAccess() {
      if (access) access = { ...access, token: `${access.token}x` }
    },
    refreshCount: () => refreshCount,
    session: () => state,
  }
}
