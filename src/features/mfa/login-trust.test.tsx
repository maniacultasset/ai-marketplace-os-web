/**
 * Trusted browsers on /login (contract 2.1.0, ADR-0023): the token goes out with the password, a
 * trusted browser skips the code, the code steps offer "Trust this browser" only when the API says
 * so, and every answer keeps or forgets the token for that account.
 */
import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearSession, getAccessToken } from '@/api/session'
import { LoginPage } from '@/features/public/login-page'
import { queryClient } from '@/lib/query-client'
import { envelope, installFetch, json, jwt, type Handler } from '@/test/fake-api'
import { readDeviceToken, writeDeviceToken } from './trusted-device'

vi.hoisted(() => {
  vi.stubEnv('VITE_API_ORIGIN', 'http://localhost:3000')
})

const router = vi.hoisted(() => ({
  history: { push: vi.fn() },
  invalidate: vi.fn(async () => undefined),
  navigate: vi.fn(async () => undefined),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...rest }: { to: string; children: ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
  useRouter: () => router,
}))

const EMAIL = 'meera@acme.test'
const OLD = 'o'.repeat(43)
const NEW = 'n'.repeat(43)
const EXPIRES = () => new Date(Date.now() + 30 * 86_400_000).toISOString()
const memberships = [{ tenant_id: 't1', tenant_name: 'Acme', role: 'owner' as const }]
const access = jwt()
const SIGNED_IN = { status: 'signed_in', access_token: access, refresh_token: 'rt-1', token_type: 'bearer', expires_in: 1800, memberships }
const ME = { user_id: 'u1', email: EMAIL, display_name: 'Meera Iyer', tenant_id: 't1', role: 'owner', memberships, is_platform_admin: false }
const CODES = Array.from({ length: 10 }, (_, i) => `code-${String(i).padStart(4, '0')}`)
const mfa = (extra: Record<string, unknown> = {}) => () => json(200, { status: 'mfa_required', challenge_token: 'ch-1', challenge_expires_in: 300, ...extra })
const signedIn = (extra: Record<string, unknown> = {}): Handler => () => json(200, { ...SIGNED_IN, ...extra })
const TRUST = /Trust this browser for/

function setup(routes: Record<string, Handler | Handler[]>) {
  const api = installFetch({ 'GET /auth/me': () => json(200, ME), ...routes })
  const user = userEvent.setup()
  render(
    <QueryClientProvider client={queryClient}>
      <LoginPage target="/home" />
    </QueryClientProvider>,
  )
  return { ...api, user }
}

async function signInWith(user: ReturnType<typeof userEvent.setup>, email = EMAIL) {
  await user.type(screen.getByLabelText('Email'), email)
  await user.type(screen.getByLabelText('Password', { exact: true }), 'old-password')
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
}

async function enterCode(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText('6-digit code'), '123456')
  await user.click(screen.getByRole('button', { name: 'Verify' }))
}

describe('LoginPage: trusted browsers', () => {
  beforeEach(() => {
    router.history.push.mockClear()
    localStorage.clear()
    // The Radix checkbox measures itself; jsdom has no ResizeObserver.
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  })
  afterEach(() => {
    cleanup()
    clearSession('logout')
    queryClient.clear()
    localStorage.clear()
    vi.unstubAllGlobals()
  })

  it('sends no device token from a browser that holds none', async () => {
    const { user, calls } = setup({ 'POST /auth/login': signedIn() })
    await signInWith(user)
    await waitFor(() => expect(router.history.push).toHaveBeenCalledWith('/home'))
    expect(calls.find((c) => c.path === '/auth/login')!.body).toEqual({ email: EMAIL, password: 'old-password' })
  })

  it('a trusted browser sends its token with the password, skips the code and keeps the rotated token', async () => {
    await writeDeviceToken(EMAIL, OLD, EXPIRES())
    const { user, calls } = setup({ 'POST /auth/login': signedIn({ device_token: NEW, device_expires_at: EXPIRES() }) })
    await signInWith(user, 'Meera@Acme.test')
    await waitFor(() => expect(router.history.push).toHaveBeenCalledWith('/home'))
    expect(calls.find((c) => c.path === '/auth/login')!.body).toEqual({ email: 'Meera@Acme.test', password: 'old-password', device_token: OLD })
    expect(screen.queryByLabelText('6-digit code')).toBeNull()
    expect(getAccessToken()).toBe(access)
    expect(await readDeviceToken(EMAIL)).toBe(NEW)
  })

  it('never sends one account’s token for another', async () => {
    await writeDeviceToken('ravi@acme.test', OLD, EXPIRES())
    const { user, calls } = setup({ 'POST /auth/login': signedIn() })
    await signInWith(user)
    await waitFor(() => expect(router.history.push).toHaveBeenCalled())
    expect(calls.find((c) => c.path === '/auth/login')!.body).not.toHaveProperty('device_token')
  })

  it('a token the API no longer accepts is forgotten, and the code step says why it asks', async () => {
    await writeDeviceToken(EMAIL, OLD, EXPIRES())
    const { user } = setup({ 'POST /auth/login': mfa({ device_token_invalid: true, device_trust_days: 30 }), 'POST /auth/login/mfa': signedIn() })
    await signInWith(user)
    expect(await screen.findByText('This browser is no longer trusted, so enter a code this time.')).toBeTruthy()
    expect(await readDeviceToken(EMAIL)).toBeNull()
  })

  it('a wrong password with a token stored changes nothing about the trust', async () => {
    await writeDeviceToken(EMAIL, OLD, EXPIRES())
    const { user } = setup({ 'POST /auth/login': () => envelope(401, 'UNAUTHENTICATED') })
    await signInWith(user)
    expect(await screen.findByText('Email or password is incorrect.')).toBeTruthy()
    expect(await readDeviceToken(EMAIL)).toBe(OLD)
  })

  it('the code step offers trust for the API’s days, checked by default, and keeps the token it earns', async () => {
    const { user, calls } = setup({
      'POST /auth/login': mfa({ device_trust_days: 30 }),
      'POST /auth/login/mfa': signedIn({ device_token: NEW, device_expires_at: EXPIRES() }),
    })
    await signInWith(user)
    const box = await screen.findByRole('checkbox', { name: TRUST })
    expect(screen.getByText('Trust this browser for 30 days')).toBeTruthy()
    expect(box.getAttribute('aria-checked')).toBe('true')
    expect(screen.getByText(/Untick on a shared or public computer/)).toBeTruthy()
    await enterCode(user)
    await waitFor(() => expect(router.history.push).toHaveBeenCalledWith('/home'))
    expect(calls.find((c) => c.path === '/auth/login/mfa')!.body).toEqual({ challenge_token: 'ch-1', code: '123456', trust_device: true })
    expect(await readDeviceToken(EMAIL)).toBe(NEW)
  })

  it('a platform admin is offered 7 days; unticking sends trust_device false and stores nothing', async () => {
    const { user, calls } = setup({ 'POST /auth/login': mfa({ device_trust_days: 7 }), 'POST /auth/login/mfa': signedIn() })
    await signInWith(user)
    expect(await screen.findByText('Trust this browser for 7 days')).toBeTruthy()
    await user.click(screen.getByRole('checkbox', { name: TRUST }))
    expect(screen.getByRole('checkbox', { name: TRUST }).getAttribute('aria-checked')).toBe('false')
    await enterCode(user)
    await waitFor(() => expect(router.history.push).toHaveBeenCalled())
    expect(calls.find((c) => c.path === '/auth/login/mfa')!.body).toEqual({ challenge_token: 'ch-1', code: '123456', trust_device: false })
    expect(Object.keys(localStorage).filter((k) => k.startsWith('kuinn.dt.'))).toEqual([])
  })

  it('a recovery code never trusts the browser: the box hides and the field is not sent', async () => {
    const { user, calls } = setup({ 'POST /auth/login': mfa({ device_trust_days: 30 }), 'POST /auth/login/mfa': signedIn() })
    await signInWith(user)
    await screen.findByRole('checkbox', { name: TRUST })
    await user.click(screen.getByRole('button', { name: 'Use a recovery code' }))
    expect(screen.queryByRole('checkbox', { name: TRUST })).toBeNull()
    await user.type(screen.getByLabelText('Recovery code'), 'abcd-efgh')
    await user.click(screen.getByRole('button', { name: 'Verify' }))
    await waitFor(() => expect(router.history.push).toHaveBeenCalled())
    expect(calls.find((c) => c.path === '/auth/login/mfa')!.body).toEqual({ challenge_token: 'ch-1', recovery_code: 'abcd-efgh' })
  })

  it('an API that does not offer trust (older than 2.1.0) gets no box and no new field', async () => {
    const { user, calls } = setup({ 'POST /auth/login': mfa(), 'POST /auth/login/mfa': signedIn() })
    await signInWith(user)
    await screen.findByLabelText('6-digit code')
    expect(screen.queryByRole('checkbox', { name: TRUST })).toBeNull()
    await enterCode(user)
    await waitFor(() => expect(router.history.push).toHaveBeenCalled())
    expect(calls.find((c) => c.path === '/auth/login/mfa')!.body).toEqual({ challenge_token: 'ch-1', code: '123456' })
  })

  it('a code step that leads to a password change keeps the token from the final answer', async () => {
    const { user, calls } = setup({
      'POST /auth/login': mfa({ device_trust_days: 30 }),
      'POST /auth/login/mfa': () => json(200, { status: 'password_change_required', challenge_token: 'ch-pw', challenge_expires_in: 300 }),
      'POST /auth/password/expired': signedIn({ device_token: NEW, device_expires_at: EXPIRES() }),
    })
    await signInWith(user)
    await enterCode(user)
    await user.type(await screen.findByLabelText('New password'), 'Tulip-Rain-2026')
    await user.type(screen.getByLabelText('Type it again'), 'Tulip-Rain-2026')
    await user.click(screen.getByRole('button', { name: 'Save and continue' }))
    await waitFor(() => expect(router.history.push).toHaveBeenCalledWith('/home'))
    expect(calls.find((c) => c.path === '/auth/login/mfa')!.body).toMatchObject({ trust_device: true })
    expect(await readDeviceToken(EMAIL)).toBe(NEW)
  })

  it('forced enrolment offers trust on its code step and keeps the token from the confirm answer', async () => {
    const { user, calls } = setup({
      'POST /auth/login': () => json(200, { status: 'mfa_enrollment_required', challenge_token: 'ch-e', challenge_expires_in: 900, device_trust_days: 30 }),
      'POST /auth/login/mfa/enroll': () => json(200, { otpauth_uri: 'otpauth://totp/x?secret=ABCD', secret_b32: 'ABCD' }),
      'POST /auth/login/mfa/confirm': () => json(200, { recovery_codes: CODES, result: { ...SIGNED_IN, device_token: NEW, device_expires_at: EXPIRES() } }),
    })
    await signInWith(user)
    await user.click(await screen.findByRole('button', { name: 'Continue' }))
    await screen.findByTestId('mfa-qr')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await screen.findByRole('heading', { name: 'Enter the 6-digit code' })
    expect(screen.getByRole('checkbox', { name: TRUST }).getAttribute('aria-checked')).toBe('true')
    await user.type(screen.getByLabelText('6-digit code'), '654321')
    await user.click(screen.getByRole('button', { name: 'Turn on login codes' }))
    await screen.findByRole('heading', { name: 'Save your recovery codes' })
    expect(calls.find((c) => c.path === '/auth/login/mfa/confirm')!.body).toEqual({ challenge_token: 'ch-e', code: '654321', trust_device: true })
    // Kept as the answer arrives, before the codes are even saved.
    await waitFor(async () => expect(await readDeviceToken(EMAIL)).toBe(NEW))
  })
})
