import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Node's Request needs absolute URLs: point the client at the jsdom origin before it loads.
vi.hoisted(() => {
  vi.stubEnv('VITE_API_ORIGIN', 'http://localhost:3000')
})
import { envelope, installFetch, json, jwt } from '@/test/fake-api'
import { api, isPublicPath, unwrap } from './client'
import { ApiError } from './errors'
import { clearSession, getAccessToken, storeTokens } from './session'
import { setEnrollmentHandler, setStepUpHandler } from './step-up'

const memberships = [{ tenant_id: 't1', tenant_name: 'Acme', role: 'owner' as const }]
const signIn = (access = jwt()) => storeTokens({ access_token: access, refresh_token: 'rt-1', expires_in: 1800, token_type: 'bearer', memberships })
const member = { user_id: 'u2', email: 'op@acme.test', display_name: null, role: 'operator', is_active: true }
const patchMember = () => unwrap(api.PATCH('/members/{user_id}', { params: { path: { user_id: 'u2' } }, body: { role: 'reviewer' } }))

describe('public paths (exact match under /api/v1)', () => {
  it('lists the sign-in challenge routes, not the bearer MFA routes', () => {
    for (const p of ['/auth/login', '/auth/login/mfa', '/auth/login/mfa/enroll', '/auth/login/mfa/confirm', '/auth/password/expired', '/signup', '/signup/status'])
      expect(isPublicPath(`/api/v1${p}`), p).toBe(true)
    for (const p of ['/auth/password', '/auth/mfa/totp/enroll', '/auth/mfa/totp/confirm', '/auth/mfa/step-up', '/auth/security', '/admin/signup'])
      expect(isPublicPath(`/api/v1${p}`), p).toBe(false)
  })
})

describe('authFetch', () => {
  let offs: (() => void)[] = []
  beforeEach(() => signIn())
  afterEach(() => {
    offs.forEach((f) => f())
    offs = []
    clearSession('logout')
    vi.unstubAllGlobals()
  })

  it('sends no bearer and never refreshes on a 401 from a challenge route', async () => {
    const { calls } = installFetch({ 'POST /auth/login/mfa': () => envelope(401, 'UNAUTHENTICATED') })
    await expect(unwrap(api.POST('/auth/login/mfa', { body: { challenge_token: 'c', code: '123456' } }))).rejects.toMatchObject({ status: 401 })
    expect(calls.map((c) => c.path)).toEqual(['/auth/login/mfa'])
    expect(calls[0]!.auth).toBeNull()
    expect(getAccessToken()).not.toBeNull()
  })

  it('on MFA_STEP_UP_REQUIRED asks for a code, then replays the request once with the new token', async () => {
    const stepped = jwt({ amr: ['pwd', 'otp'] })
    const handler = vi.fn(async () => {
      // What the dialog does on success: swap the access token in.
      const { adoptStepUpToken } = await import('./session')
      return adoptStepUpToken(stepped)
    })
    offs.push(setStepUpHandler(handler))
    const { calls } = installFetch({
      'PATCH /members/u2': [() => envelope(403, 'MFA_STEP_UP_REQUIRED'), () => json(200, { ...member, role: 'reviewer' })],
    })
    const out = await patchMember()
    expect(out.role).toBe('reviewer')
    expect(handler).toHaveBeenCalledWith('any')
    expect(calls).toHaveLength(2)
    expect(calls[1]!.auth).toBe(`Bearer ${stepped}`)
    // The same body is replayed.
    expect(calls[1]!.body).toEqual({ role: 'reviewer' })
  })

  it('asks for a TOTP code only on an otp op', async () => {
    const handler = vi.fn(async () => false)
    offs.push(setStepUpHandler(handler))
    installFetch({ 'POST /marketplaces/accounts/a1/revoke': () => envelope(403, 'MFA_STEP_UP_REQUIRED') })
    await expect(unwrap(api.POST('/marketplaces/accounts/{account_id}/revoke', { params: { path: { account_id: 'a1' } } }))).rejects.toBeInstanceOf(ApiError)
    expect(handler).toHaveBeenCalledWith('otp')
  })

  it('returns the 403 when the step-up is cancelled', async () => {
    offs.push(setStepUpHandler(async () => false))
    const { calls } = installFetch({ 'PATCH /members/u2': () => envelope(403, 'MFA_STEP_UP_REQUIRED') })
    await expect(patchMember()).rejects.toMatchObject({ status: 403, type: 'MFA_STEP_UP_REQUIRED' })
    expect(calls).toHaveLength(1)
  })

  it('replays only once: a second step-up 403 is returned, not looped', async () => {
    const handler = vi.fn(async () => true)
    offs.push(setStepUpHandler(handler))
    const { calls } = installFetch({ 'PATCH /members/u2': () => envelope(403, 'MFA_STEP_UP_REQUIRED') })
    await expect(patchMember()).rejects.toMatchObject({ type: 'MFA_STEP_UP_REQUIRED' })
    expect(handler).toHaveBeenCalledTimes(1)
    expect(calls).toHaveLength(2)
  })

  it('leaves a role 403 alone', async () => {
    const handler = vi.fn(async () => true)
    offs.push(setStepUpHandler(handler))
    installFetch({ 'PATCH /members/u2': () => envelope(403, 'PERMISSION_DENIED') })
    await expect(patchMember()).rejects.toMatchObject({ type: 'PERMISSION_DENIED' })
    expect(handler).not.toHaveBeenCalled()
  })

  it('routes to enrolment on MFA_ENROLLMENT_REQUIRED', async () => {
    const toEnrol = vi.fn()
    offs.push(setEnrollmentHandler(toEnrol))
    installFetch({ 'POST /marketplaces/connect': () => envelope(403, 'MFA_ENROLLMENT_REQUIRED') })
    await expect(unwrap(api.POST('/marketplaces/connect', { body: { marketplace: 'amazon' } }))).rejects.toMatchObject({ type: 'MFA_ENROLLMENT_REQUIRED' })
    expect(toEnrol).toHaveBeenCalledTimes(1)
  })

  it('never opens the dialog for the step-up route itself', async () => {
    const handler = vi.fn(async () => true)
    offs.push(setStepUpHandler(handler))
    installFetch({ 'POST /auth/mfa/step-up': () => envelope(403, 'MFA_STEP_UP_REQUIRED') })
    await expect(unwrap(api.POST('/auth/mfa/step-up', { body: { code: '123456' } }))).rejects.toBeInstanceOf(ApiError)
    expect(handler).not.toHaveBeenCalled()
  })

  it('still refreshes and replays on a 401 before the step-up check', async () => {
    const fresh = jwt({ jti: 'fresh' })
    const { calls } = installFetch({
      'GET /auth/security': [() => envelope(401, 'UNAUTHENTICATED'), () => json(200, { mfa_enrolled: true, recovery_codes_left: 10, enforcement: 'all' })],
      'POST /auth/refresh': () => json(200, { access_token: fresh, refresh_token: 'rt-2', expires_in: 1800, token_type: 'bearer', memberships }),
    })
    const out = await unwrap(api.GET('/auth/security'))
    expect(out.mfa_enrolled).toBe(true)
    expect(calls.map((c) => c.path)).toEqual(['/auth/security', '/auth/refresh', '/auth/security'])
    expect(calls[2]!.auth).toBe(`Bearer ${fresh}`)
  })
})

describe('adoptStepUpToken', () => {
  afterEach(() => clearSession('logout'))
  it('swaps the access token and keeps the stored refresh token', async () => {
    const { adoptStepUpToken, currentRefreshToken } = await import('./session')
    signIn()
    const stepped = jwt({ amr: ['pwd', 'otp'] })
    expect(adoptStepUpToken(stepped)).toBe(true)
    expect(getAccessToken()).toBe(stepped)
    expect(currentRefreshToken()).toBe('rt-1')
  })
  it('refuses a token for another user or tenant', async () => {
    const { adoptStepUpToken } = await import('./session')
    signIn()
    const before = getAccessToken()
    expect(adoptStepUpToken(jwt({ sub: 'someone-else' }))).toBe(false)
    expect(adoptStepUpToken(jwt({ tid: 't2' }))).toBe(false)
    expect(getAccessToken()).toBe(before)
  })
})
