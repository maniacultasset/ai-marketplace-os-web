import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearSession, currentRefreshToken, getAccessToken } from '@/api/session'
import { LoginPage } from '@/features/public/login-page'
import { queryClient } from '@/lib/query-client'
import { envelope, installFetch, json, jwt, type Handler } from '@/test/fake-api'

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

const memberships = [{ tenant_id: 't1', tenant_name: 'Acme', role: 'owner' as const }]
const access = jwt()
const SIGNED_IN = {
  status: 'signed_in',
  access_token: access,
  refresh_token: 'rt-1',
  token_type: 'bearer',
  expires_in: 1800,
  memberships,
}
const ME = { user_id: 'u1', email: 'meera@acme.test', display_name: 'Meera Iyer', tenant_id: 't1', role: 'owner', memberships, is_platform_admin: false }
const challenge = (status: string, ttl = 300) => json(200, { status, challenge_token: `ch-${status}`, challenge_expires_in: ttl })
const CODES = Array.from({ length: 10 }, (_, i) => `code-${String(i).padStart(4, '0')}`)

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

async function signInWith(user: ReturnType<typeof userEvent.setup>, password = 'old-password') {
  await user.type(screen.getByLabelText('Email'), 'meera@acme.test')
  await user.type(screen.getByLabelText('Password', { exact: true }), password)
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
}

const signedInRoute = (): Handler => () => json(200, SIGNED_IN)

describe('LoginPage: every LoginResult status', () => {
  beforeEach(() => {
    router.history.push.mockClear()
  })
  afterEach(() => {
    cleanup()
    clearSession('logout')
    queryClient.clear()
    vi.unstubAllGlobals()
  })

  it('signed_in: stores the tokens and goes to the target', async () => {
    const { user, calls } = setup({ 'POST /auth/login': signedInRoute() })
    await signInWith(user)
    await waitFor(() => expect(router.history.push).toHaveBeenCalledWith('/home'))
    expect(getAccessToken()).toBe(access)
    expect(currentRefreshToken()).toBe('rt-1')
    expect(calls.find((c) => c.path === '/auth/login')).toMatchObject({ path: '/auth/login', body: { email: 'meera@acme.test', password: 'old-password' }, auth: null })
  })

  it('a 401 (wrong password or a locked account) shows one generic message', async () => {
    const { user } = setup({ 'POST /auth/login': () => envelope(401, 'UNAUTHENTICATED') })
    await signInWith(user)
    expect(await screen.findByText('Email or password is incorrect.')).toBeTruthy()
    expect(screen.queryByText(/locked/i)).toBeNull()
  })

  it('mfa_required: a 6-digit code finishes the sign-in, and no token is stored before', async () => {
    const { user, calls } = setup({ 'POST /auth/login': () => challenge('mfa_required'), 'POST /auth/login/mfa': signedInRoute() })
    await signInWith(user)
    const input = await screen.findByLabelText('6-digit code')
    expect(getAccessToken()).toBeNull()
    expect(input.getAttribute('inputmode')).toBe('numeric')
    expect(input.getAttribute('autocomplete')).toBe('one-time-code')
    expect(document.activeElement).toBe(input)
    // Paste with a space: only digits are kept.
    await user.type(input, '123 456')
    expect((input as HTMLInputElement).value).toBe('123456')
    await user.click(screen.getByRole('button', { name: 'Verify' }))
    await waitFor(() => expect(router.history.push).toHaveBeenCalledWith('/home'))
    const mfa = calls.find((c) => c.path === '/auth/login/mfa')!
    expect(mfa.body).toEqual({ challenge_token: 'ch-mfa_required', code: '123456' })
    expect(mfa.auth).toBeNull()
  })

  it('mfa_required: "Use a recovery code" sends recovery_code instead', async () => {
    const { user, calls } = setup({ 'POST /auth/login': () => challenge('mfa_required'), 'POST /auth/login/mfa': signedInRoute() })
    await signInWith(user)
    await user.click(await screen.findByRole('button', { name: 'Use a recovery code' }))
    const input = screen.getByLabelText('Recovery code')
    expect(input.getAttribute('autocomplete')).toBe('off')
    await waitFor(() => expect(document.activeElement).toBe(input))
    await user.type(input, 'abcd-efgh-ijkl')
    await user.click(screen.getByRole('button', { name: 'Verify' }))
    await waitFor(() => expect(router.history.push).toHaveBeenCalled())
    expect(calls.find((c) => c.path === '/auth/login/mfa')!.body).toEqual({ challenge_token: 'ch-mfa_required', recovery_code: 'abcd-efgh-ijkl' })
  })

  it('mfa_required: a wrong code says so generically; the 5th miss starts over', async () => {
    const { user, calls } = setup({ 'POST /auth/login': () => challenge('mfa_required'), 'POST /auth/login/mfa': () => envelope(401, 'UNAUTHENTICATED') })
    await signInWith(user)
    for (let i = 1; i <= 4; i++) {
      await user.type(await screen.findByLabelText('6-digit code'), '000000')
      await user.click(screen.getByRole('button', { name: 'Verify' }))
      expect(await screen.findByText("That code didn't work. Check it and try again.")).toBeTruthy()
    }
    await user.type(screen.getByLabelText('6-digit code'), '000000')
    await user.click(screen.getByRole('button', { name: 'Verify' }))
    expect(await screen.findByText('Too many codes did not work. Sign in again to get a new try.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy()
    expect(calls.filter((c) => c.path === '/auth/login/mfa')).toHaveLength(5)
  })

  it('mfa_required: a short code is caught before any request', async () => {
    const { user, calls } = setup({ 'POST /auth/login': () => challenge('mfa_required') })
    await signInWith(user)
    await user.type(await screen.findByLabelText('6-digit code'), '123')
    await user.click(screen.getByRole('button', { name: 'Verify' }))
    expect(await screen.findByText('Enter the 6-digit code.')).toBeTruthy()
    expect(calls.some((c) => c.path === '/auth/login/mfa')).toBe(false)
  })

  it('the challenge expiring sends the user back to sign in', async () => {
    const { user } = setup({ 'POST /auth/login': () => challenge('mfa_required', 1) })
    await signInWith(user)
    await screen.findByLabelText('6-digit code')
    expect(await screen.findByText('That sign-in step timed out. Sign in again.', undefined, { timeout: 2500 })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy()
  })

  it('a 501 on the code step (MFA off on the server) starts over with an explanation', async () => {
    const { user } = setup({ 'POST /auth/login': () => challenge('mfa_required'), 'POST /auth/login/mfa': () => envelope(501, 'NOT_IMPLEMENTED', 'MFA is not enabled') })
    await signInWith(user)
    await user.type(await screen.findByLabelText('6-digit code'), '123456')
    await user.click(screen.getByRole('button', { name: 'Verify' }))
    expect(await screen.findByText(/Login codes are not available right now/)).toBeTruthy()
  })

  it('mfa_enrollment_required → QR + setup key → confirm → recovery codes once → password change → signed in', async () => {
    const { user, calls } = setup({
      'POST /auth/login': () => challenge('mfa_enrollment_required', 900),
      'POST /auth/login/mfa/enroll': () =>
        json(200, { otpauth_uri: 'otpauth://totp/Kuinn:meera%40acme.test?secret=JBSWY3DPEHPK3PXP&issuer=Kuinn', secret_b32: 'JBSWY3DPEHPK3PXP' }),
      'POST /auth/login/mfa/confirm': () =>
        json(200, { recovery_codes: CODES, result: { status: 'password_change_required', challenge_token: 'ch-pw', challenge_expires_in: 300 } }),
      'POST /auth/password/expired': signedInRoute(),
    })
    await signInWith(user)

    // Enrol: heading focused, QR drawn locally, the key grouped for manual entry.
    const heading = await screen.findByRole('heading', { name: 'Set up login codes' })
    await waitFor(() => expect(document.activeElement).toBe(heading))
    const qr = await screen.findByTestId('mfa-qr')
    expect(qr.getAttribute('src')).toMatch(/^data:image\/svg\+xml/)
    expect(screen.getByTestId('mfa-secret').textContent).toBe('JBSW Y3DP EHPK 3PXP')
    expect(screen.getByText(/expires after 15 minutes/)).toBeTruthy()
    // Exactly one enrol call (a second would mint another secret).
    expect(calls.filter((c) => c.path === '/auth/login/mfa/enroll')).toHaveLength(1)
    await user.type(screen.getByLabelText('6-digit code'), '654321')
    await user.click(screen.getByRole('button', { name: 'Turn on login codes' }))

    // Recovery codes: shown once, Continue gated by "I saved them".
    await screen.findByRole('heading', { name: 'Save your recovery codes' })
    const list = screen.getByRole('list', { name: 'Recovery codes' })
    expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual(CODES)
    expect(screen.getByRole('button', { name: 'Download .txt' })).toBeTruthy()
    const cont = screen.getByRole('button', { name: 'Continue' })
    expect((cont as HTMLButtonElement).disabled).toBe(true)
    await user.click(screen.getByRole('checkbox', { name: 'I saved these codes somewhere safe' }))
    expect((cont as HTMLButtonElement).disabled).toBe(false)
    await user.click(cont)

    // Forced password change with the live rules.
    await screen.findByRole('heading', { name: 'Choose a new password' })
    const pw = screen.getByLabelText('New password')
    await user.type(pw, 'meera-tulip-2026')
    const rules = screen.getByTestId('password-rules')
    expect(rules.querySelector('[data-rule="upper"]')!.hasAttribute('data-met')).toBe(false)
    expect(rules.querySelector('[data-rule="personal"]')!.hasAttribute('data-met')).toBe(false)
    await user.clear(pw)
    await user.type(pw, 'Tulip-Rain-2026')
    for (const r of ['length', 'upper', 'lower', 'digit', 'symbol', 'personal'])
      expect(rules.querySelector(`[data-rule="${r}"]`)!.hasAttribute('data-met'), r).toBe(true)
    await user.type(screen.getByLabelText('Type it again'), 'Tulip-Rain-2026')
    await user.click(screen.getByRole('button', { name: 'Save and continue' }))
    await waitFor(() => expect(router.history.push).toHaveBeenCalledWith('/home'))
    expect(calls.find((c) => c.path === '/auth/password/expired')!.body).toEqual({ challenge_token: 'ch-pw', new_password: 'Tulip-Rain-2026' })
    expect(calls.find((c) => c.path === '/auth/login/mfa/confirm')!.body).toEqual({ challenge_token: 'ch-mfa_enrollment_required', code: '654321' })
  })

  it('starts the next challenge clock when confirm answers, and warns before leaving the codes screen', async () => {
    const { user } = setup({
      'POST /auth/login': () => challenge('mfa_enrollment_required', 900),
      'POST /auth/login/mfa/enroll': () => json(200, { otpauth_uri: 'otpauth://totp/x?secret=ABCD', secret_b32: 'ABCD' }),
      // The password challenge lives 1 s from the moment confirm answers.
      'POST /auth/login/mfa/confirm': () =>
        json(200, { recovery_codes: CODES, result: { status: 'password_change_required', challenge_token: 'ch-pw', challenge_expires_in: 1 } }),
    })
    await signInWith(user)
    await user.type(await screen.findByLabelText('6-digit code'), '654321')
    await user.click(screen.getByRole('button', { name: 'Turn on login codes' }))
    await screen.findByRole('heading', { name: 'Save your recovery codes' })

    const leave = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(leave)
    expect(leave.defaultPrevented).toBe(true)

    // Read the codes for longer than the next challenge lives, then continue.
    await new Promise((r) => setTimeout(r, 1200))
    await user.click(screen.getByRole('checkbox', { name: 'I saved these codes somewhere safe' }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByText('That sign-in step timed out. Sign in again.')).toBeTruthy()
    // Off the codes screen, leaving is no longer blocked.
    const later = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(later)
    expect(later.defaultPrevented).toBe(false)
  })

  it('password_change_required: shows the server rule sentences (history) under the field', async () => {
    const { user } = setup({
      'POST /auth/login': () => challenge('password_change_required'),
      'POST /auth/password/expired': () =>
        envelope(422, 'VALIDATION_FAILED', 'The password does not meet the rules.', [
          { loc: ['body', 'new_password'], msg: 'The password must not be one of the last 10.' },
        ]),
    })
    await signInWith(user)
    await user.type(await screen.findByLabelText('New password'), 'Tulip-Rain-2026')
    await user.type(screen.getByLabelText('Type it again'), 'Tulip-Rain-2026')
    await user.click(screen.getByRole('button', { name: 'Save and continue' }))
    expect(await screen.findByText('The password must not be one of the last 10.')).toBeTruthy()
  })

  it('password_change_required: the client blocks a password that breaks a rule or does not match', async () => {
    const { user, calls } = setup({ 'POST /auth/login': () => challenge('password_change_required') })
    await signInWith(user)
    await user.type(await screen.findByLabelText('New password'), 'short')
    await user.type(screen.getByLabelText('Type it again'), 'other')
    await user.click(screen.getByRole('button', { name: 'Save and continue' }))
    expect(await screen.findByText('Meet every rule in the list.')).toBeTruthy()
    expect(screen.getByText('The two passwords do not match.')).toBeTruthy()
    expect(calls.some((c) => c.path === '/auth/password/expired')).toBe(false)
  })

  it('a 401 on the password step (dead challenge) starts over', async () => {
    const { user } = setup({ 'POST /auth/login': () => challenge('password_change_required'), 'POST /auth/password/expired': () => envelope(401, 'UNAUTHENTICATED') })
    await signInWith(user)
    await user.type(await screen.findByLabelText('New password'), 'Tulip-Rain-2026')
    await user.type(screen.getByLabelText('Type it again'), 'Tulip-Rain-2026')
    await user.click(screen.getByRole('button', { name: 'Save and continue' }))
    expect(await screen.findByText('That sign-in step timed out. Sign in again.')).toBeTruthy()
  })
})
