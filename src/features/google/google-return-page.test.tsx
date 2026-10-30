import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearSession, currentRefreshToken, getAccessToken } from '@/api/session'
import { queryClient } from '@/lib/query-client'
import { envelope, installFetch, json, jwt, type Handler } from '@/test/fake-api'
import { GoogleReturnPage } from './google-return-page'
import { readDeviceToken, writeDeviceToken } from '@/features/mfa/trusted-device'
import { resetGoogleReturn } from './return-state'

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

const start = vi.hoisted(() => ({ startGoogle: vi.fn(async () => undefined) }))
vi.mock('./start', async (orig) => ({ ...(await orig<typeof import('./start')>()), startGoogle: start.startGoogle }))

const BIND = 'b'.repeat(43)
const HANDLE = 'h-123'
const EMAIL = 'meera@acmenaturals.com'
const memberships = [{ tenant_id: 't1', tenant_name: 'Acme', role: 'owner' as const }]
const access = jwt()
const SIGNED_IN = { status: 'signed_in', access_token: access, refresh_token: 'rt-1', token_type: 'bearer', expires_in: 1800, memberships }
const ME = { user_id: 'u1', email: EMAIL, display_name: 'Meera Iyer', tenant_id: 't1', role: 'owner', memberships, is_platform_admin: false }
const challenge = (status: string, ttl = 300) => ({ status, challenge_token: `ch-${status}`, challenge_expires_in: ttl })
const PENDING = { request_id: 'r1', brand_name: 'Acme Naturals', status: 'pending', created_at: '2026-10-30T09:00:00Z' }
const DETAILS = {
  email: EMAIL,
  email_verified: true,
  owner_name: 'Meera Iyer',
  given_name: 'Meera',
  family_name: 'Iyer',
  suggested_brand_name: 'Acmenaturals',
  details_handle: 'dh-1',
  details_expires_in: 900,
}

const out = (o: Record<string, unknown>) => () => json(200, { email: EMAIL, login: null, signup: null, details: null, link: null, ...o })

function ticket(intent: 'login' | 'signup' = 'login', returnTo: string | null = '/products') {
  sessionStorage.setItem('gsi', JSON.stringify({ bind: BIND, returnTo, intent }))
}

function setup(routes: Record<string, Handler | Handler[]>, search: { handle?: string; error?: string } = { handle: HANDLE }, strict = false) {
  const api = installFetch({ 'GET /auth/me': () => json(200, ME), ...routes })
  const user = userEvent.setup()
  const tree = (
    <QueryClientProvider client={queryClient}>
      <GoogleReturnPage search={search} />
    </QueryClientProvider>
  )
  render(strict ? <StrictMode>{tree}</StrictMode> : tree)
  return { ...api, user }
}

describe('/auth/google', () => {
  beforeEach(() => {
    router.history.push.mockClear()
    router.navigate.mockClear()
    start.startGoogle.mockClear()
    resetGoogleReturn()
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  })
  afterEach(() => {
    cleanup()
    clearSession('logout')
    queryClient.clear()
    sessionStorage.clear()
    vi.unstubAllGlobals()
  })

  it('strips the handle from the address bar and sends it once with the stored binding (StrictMode)', async () => {
    ticket()
    const { calls } = setup({ 'POST /auth/google/complete': out({ outcome: 'sign_in', login: SIGNED_IN }) }, { handle: HANDLE }, true)
    await waitFor(() => expect(router.history.push).toHaveBeenCalledWith('/products'))
    expect(router.navigate).toHaveBeenCalledWith({ to: '/auth/google', search: {}, replace: true })
    const complete = calls.filter((c) => c.path === '/auth/google/complete')
    expect(complete).toHaveLength(1)
    expect(complete[0]).toMatchObject({ body: { handle: HANDLE, binding: BIND }, auth: null })
    expect(sessionStorage.getItem('gsi')).toBeNull()
    expect(getAccessToken()).toBe(access)
    expect(currentRefreshToken()).toBe('rt-1')
  })

  it('no stored secret (another tab or browser): the one generic failure, and no call', async () => {
    const { calls } = setup({})
    expect(await screen.findByRole('heading', { name: 'Couldn’t sign you in with Google' })).toBeTruthy()
    expect(screen.getByText('Try again, or sign in with your email and password.')).toBeTruthy()
    expect(calls.some((c) => c.path === '/auth/google/complete')).toBe(false)
    // Not a dead end for a Google-only account: Google again, or email.
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeTruthy()
    expect(screen.getByTestId('google-error-login').getAttribute('href')).toBe('/login')
  })

  it('?error=cancelled: says nothing was shared and offers Google again', async () => {
    ticket('signup')
    const { user } = setup({}, { error: 'cancelled' })
    expect(await screen.findByRole('heading', { name: 'Google sign-in was cancelled' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Sign up with Google' }))
    expect(start.startGoogle).toHaveBeenCalledWith({ intent: 'signup', returnTo: null })
    expect(sessionStorage.getItem('gsi')).toBeNull()
  })

  it('?error=failed: the generic failure', async () => {
    setup({}, { error: 'failed' })
    expect(await screen.findByRole('heading', { name: 'Couldn’t sign you in with Google' })).toBeTruthy()
  })

  it('?error=unavailable (switched off mid-flow): "not available", no Google button', async () => {
    setup({}, { error: 'unavailable' })
    expect(await screen.findByRole('heading', { name: 'Google sign-in isn’t available right now' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Google/ })).toBeNull()
  })

  it('an error after "Sign up with Google" points back to sign-up', async () => {
    ticket('signup')
    setup({}, { error: 'failed' })
    expect(await screen.findByRole('heading', { name: 'Couldn’t sign you in with Google' })).toBeTruthy()
    expect(screen.getByText('Try again, or sign up with your email.')).toBeTruthy()
    const email = screen.getByTestId('google-error-login')
    expect(email.textContent).toBe('Sign up with email')
    expect(email.getAttribute('href')).toBe('/signup')
  })

  it.each([
    ['a used or unbound handle (401 OAUTH_STATE_INVALID)', () => envelope(401, 'OAUTH_STATE_INVALID'), 'That Google sign-in timed out'],
    ['a refusal (401: Workspace, admin, locked, inactive)', () => envelope(401, 'UNAUTHENTICATED'), 'Couldn’t sign you in with Google'],
    ['the flag off (501)', () => envelope(501, 'NOT_IMPLEMENTED'), 'Google sign-in isn’t available right now'],
    ['the rate limit (429)', () => envelope(429, 'RATE_LIMITED'), 'Too many attempts'],
  ])('%s', async (_, handler, title) => {
    ticket()
    setup({ 'POST /auth/google/complete': handler })
    expect(await screen.findByRole('heading', { name: title })).toBeTruthy()
    expect(getAccessToken()).toBeNull()
  })

  it('an unsafe stored return path falls back to /home', async () => {
    sessionStorage.setItem('gsi', JSON.stringify({ bind: BIND, returnTo: '//evil.example', intent: 'login' }))
    setup({ 'POST /auth/google/complete': out({ outcome: 'sign_in', login: SIGNED_IN }) })
    await waitFor(() => expect(router.history.push).toHaveBeenCalledWith('/home'))
  })

  it('sign_in + mfa_required: the same code step as a password sign-in, then tokens', async () => {
    ticket()
    const { user, calls } = setup({
      'POST /auth/google/complete': out({ outcome: 'sign_in', login: challenge('mfa_required') }),
      'POST /auth/login/mfa': () => json(200, SIGNED_IN),
    })
    const input = await screen.findByLabelText('6-digit code')
    expect(screen.getByText(EMAIL)).toBeTruthy()
    expect(getAccessToken()).toBeNull()
    await user.type(input, '123456')
    await user.click(screen.getByRole('button', { name: 'Verify' }))
    await waitFor(() => expect(router.history.push).toHaveBeenCalledWith('/products'))
    expect(calls.find((c) => c.path === '/auth/login/mfa')?.body).toEqual({ challenge_token: 'ch-mfa_required', code: '123456' })
  })

  it('sign_in + mfa_enrollment_required: forced enrolment', async () => {
    ticket()
    setup({ 'POST /auth/google/complete': out({ outcome: 'sign_in', login: challenge('mfa_enrollment_required', 900) }) })
    expect(await screen.findByRole('heading', { name: 'Set up login codes' })).toBeTruthy()
    expect(screen.getByRole('list', { name: 'Setup steps' })).toBeTruthy()
  })

  it('sign_in + password_change_required: the new password step', async () => {
    ticket()
    setup({ 'POST /auth/google/complete': out({ outcome: 'sign_in', login: challenge('password_change_required') }) })
    expect(await screen.findByRole('heading', { name: 'Choose a new password' })).toBeTruthy()
  })

  it('a step that runs out sends the person back to /login with the reason', async () => {
    ticket()
    setup({ 'POST /auth/google/complete': out({ outcome: 'sign_in', login: challenge('mfa_required', 0) }) })
    await waitFor(() => expect(router.navigate).toHaveBeenCalledWith({ to: '/login', search: { restart: 'expired' }, replace: true }))
  })

  it('a malformed sign_in answer is the generic failure', async () => {
    ticket()
    setup({ 'POST /auth/google/complete': out({ outcome: 'sign_in', login: null }) })
    expect(await screen.findByRole('heading', { name: 'Couldn’t sign you in with Google' })).toBeTruthy()
  })

  it('pending: the request status card, checked again through Google', async () => {
    ticket()
    const { user } = setup({ 'POST /auth/google/complete': out({ outcome: 'pending', signup: PENDING }) })
    expect(await screen.findByTestId('google-pending')).toBeTruthy()
    expect(screen.getByTestId('signup-status-badge').textContent).toBe('Waiting for review')
    expect(screen.getByText('Acme Naturals')).toBeTruthy()
    expect(screen.getByText(EMAIL)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Continue with Google' }))
    expect(start.startGoogle).toHaveBeenCalledWith({ intent: 'login', returnTo: null })
  })

  it('needs_details from "Continue with Google": "No Kuinn account yet", then the prefilled form', async () => {
    ticket('login')
    const { user } = setup({ 'POST /auth/google/complete': out({ outcome: 'needs_details', details: DETAILS }) })
    expect(await screen.findByRole('heading', { name: 'No Kuinn account yet' })).toBeTruthy()
    expect(screen.getByText(EMAIL)).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
    await user.click(screen.getByTestId('google-no-account-continue'))
    expect(await screen.findByTestId('google-details')).toBeTruthy()
  })

  it('needs_details from "Sign up with Google": the prefilled form at once; sends only what Google cannot know', async () => {
    ticket('signup')
    const { user, calls } = setup({
      'POST /auth/google/complete': out({ outcome: 'needs_details', details: DETAILS }),
      'POST /signup/google': () => json(202, PENDING),
    })
    await screen.findByTestId('google-details')
    expect(screen.getByRole('heading', { name: 'Create your account' })).toBeTruthy()
    // The email is shown as text, not a field: Google verified it and it cannot change.
    expect(screen.getByTestId('google-email').textContent).toBe(EMAIL)
    expect(screen.queryByLabelText('Email')).toBeNull()
    expect(screen.getByText('Verified by Google')).toBeTruthy()
    const brandInput = screen.getByLabelText('Brand name') as HTMLInputElement
    expect(brandInput.value).toBe('Acmenaturals')
    // Focus on the guessed brand name, text selected, ready to retype.
    expect(document.activeElement).toBe(brandInput)
    expect([brandInput.selectionStart, brandInput.selectionEnd]).toEqual([0, 'Acmenaturals'.length])
    expect(screen.getByText('Suggested from your email domain. Change it if needed.')).toBeTruthy()
    expect((screen.getByLabelText('Your name') as HTMLInputElement).value).toBe('Meera Iyer')
    expect(screen.getByLabelText(/Website/).getAttribute('placeholder')).toBe('yourbrand.com')
    expect(screen.queryByLabelText('Password')).toBeNull()

    // Consent is required.
    await user.click(screen.getByTestId('google-details-submit'))
    expect(await screen.findByText(/Agree to the terms/)).toBeTruthy()
    expect(calls.some((c) => c.path === '/signup/google')).toBe(false)

    const brand = screen.getByLabelText('Brand name')
    await user.clear(brand)
    await user.type(brand, 'Acme  Naturals')
    await user.type(screen.getByLabelText(/Phone/), '+91 98765 43210')
    await user.click(screen.getByTestId('google-agree'))
    await user.click(screen.getByTestId('google-details-submit'))
    expect(await screen.findByTestId('google-sent')).toBeTruthy()
    expect(calls.find((c) => c.path === '/signup/google')).toMatchObject({
      auth: null,
      body: { details_handle: 'dh-1', binding: BIND, brand_name: 'Acme Naturals', owner_name: 'Meera Iyer', phone: '+91 98765 43210' },
    })
    expect(screen.getByText(/Request sent\./)).toBeTruthy()
  })

  it('no brand suggestion from the API (a personal mailbox): empty brand name; name from given + family', async () => {
    ticket('signup')
    setup({
      'POST /auth/google/complete': out({
        email: 'meera@gmail.com',
        outcome: 'needs_details',
        details: { ...DETAILS, email: 'meera@gmail.com', suggested_brand_name: null, owner_name: null },
      }),
    })
    await screen.findByTestId('google-details')
    expect((screen.getByLabelText('Brand name') as HTMLInputElement).value).toBe('')
    expect(screen.queryByText(/Suggested from your email domain/)).toBeNull()
    expect((screen.getByLabelText('Your name') as HTMLInputElement).value).toBe('Meera Iyer')
  })

  it('a details form that timed out (401 OAUTH_STATE_INVALID) says so', async () => {
    ticket('signup')
    const { user } = setup({
      'POST /auth/google/complete': out({ outcome: 'needs_details', details: DETAILS }),
      'POST /signup/google': () => envelope(401, 'OAUTH_STATE_INVALID'),
    })
    await screen.findByTestId('google-details')
    await user.click(screen.getByTestId('google-agree'))
    await user.click(screen.getByTestId('google-details-submit'))
    expect(await screen.findByRole('heading', { name: 'That Google sign-in timed out' })).toBeTruthy()
  })

  it('details 422 field errors land on their fields', async () => {
    ticket('signup')
    const { user } = setup({
      'POST /auth/google/complete': out({ outcome: 'needs_details', details: DETAILS }),
      'POST /signup/google': () =>
        envelope(422, 'VALIDATION_FAILED', 'm', [{ loc: ['body', 'brand_name'], msg: 'That brand name is taken.', type: 'value_error' }]),
    })
    await screen.findByTestId('google-details')
    await user.click(screen.getByTestId('google-agree'))
    await user.click(screen.getByTestId('google-details-submit'))
    expect(await screen.findByText('That brand name is taken.')).toBeTruthy()
  })

  it('link_required: the Kuinn password once, then the usual code step', async () => {
    ticket()
    const { user, calls } = setup({
      'POST /auth/google/complete': out({ outcome: 'link_required', link: { email: EMAIL, link_handle: 'lh-1', link_expires_in: 600 } }),
      'POST /auth/google/link': [() => envelope(401, 'UNAUTHENTICATED'), () => json(200, challenge('mfa_required'))],
    })
    expect(await screen.findByRole('heading', { name: 'Link Google to your account' })).toBeTruthy()
    await user.click(screen.getByTestId('google-link-submit'))
    expect(await screen.findByText('Enter your password.')).toBeTruthy()
    const pw = screen.getByLabelText('Kuinn password')
    await user.type(pw, 'wrong-password')
    await user.click(screen.getByTestId('google-link-submit'))
    expect(await screen.findByText('That password didn’t work. Check it and try again.')).toBeTruthy()
    await user.clear(pw)
    await user.type(pw, 'right-password')
    await user.click(screen.getByTestId('google-link-submit'))
    expect(await screen.findByLabelText('6-digit code')).toBeTruthy()
    const link = calls.filter((c) => c.path === '/auth/google/link')
    expect(link[1]).toMatchObject({ auth: null, body: { link_handle: 'lh-1', binding: BIND, password: 'right-password' } })
    expect(getAccessToken()).toBeNull()
  })
})

describe('/auth/google: trusted browsers (contract 2.1.0)', () => {
  const A = 'a'.repeat(43)
  const B = 'c'.repeat(43)
  const ROTATED = 'r'.repeat(43)
  const until = () => new Date(Date.now() + 30 * 86_400_000).toISOString()

  beforeEach(() => {
    router.history.push.mockClear()
    resetGoogleReturn()
    localStorage.clear()
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  })
  afterEach(() => {
    cleanup()
    clearSession('logout')
    queryClient.clear()
    sessionStorage.clear()
    localStorage.clear()
    vi.unstubAllGlobals()
  })

  it('sends no device_tokens when this browser trusts no account', async () => {
    ticket()
    const { calls } = setup({ 'POST /auth/google/complete': out({ outcome: 'sign_in', login: SIGNED_IN }) })
    await waitFor(() => expect(router.history.push).toHaveBeenCalled())
    expect(calls.find((c) => c.path === '/auth/google/complete')!.body).toEqual({ handle: HANDLE, binding: BIND })
  })

  it('sends every live token (the account is unknown yet), skips the code and keeps the rotated one for the answer’s email', async () => {
    await writeDeviceToken('ravi@acme.test', A, until())
    await writeDeviceToken(EMAIL, B, until())
    ticket()
    const { calls } = setup({
      'POST /auth/google/complete': out({ outcome: 'sign_in', login: { ...SIGNED_IN, device_token: ROTATED, device_expires_at: until() } }),
    })
    await waitFor(() => expect(router.history.push).toHaveBeenCalledWith('/products'))
    const body = calls.find((c) => c.path === '/auth/google/complete')!.body as { device_tokens: string[] }
    expect([...body.device_tokens].sort()).toEqual([A, B])
    expect(await readDeviceToken(EMAIL)).toBe(ROTATED)
    // The other account's trust is untouched.
    expect(await readDeviceToken('ravi@acme.test')).toBe(A)
  })

  it('forgets a token the API no longer accepts, then the code step offers trust again', async () => {
    await writeDeviceToken(EMAIL, B, until())
    ticket()
    const { calls, user } = setup({
      'POST /auth/google/complete': out({ outcome: 'sign_in', login: { ...challenge('mfa_required'), device_token_invalid: true, device_trust_days: 30 } }),
      'POST /auth/login/mfa': () => json(200, { ...SIGNED_IN, device_token: ROTATED, device_expires_at: until() }),
    })
    expect(await screen.findByText('This browser is no longer trusted, so enter a code this time.')).toBeTruthy()
    expect(await readDeviceToken(EMAIL)).toBeNull()
    expect(screen.getByRole('checkbox', { name: /Trust this browser for 30 days/ }).getAttribute('aria-checked')).toBe('true')
    await user.type(screen.getByLabelText('6-digit code'), '123456')
    await user.click(screen.getByRole('button', { name: 'Verify' }))
    await waitFor(() => expect(router.history.push).toHaveBeenCalledWith('/products'))
    expect(calls.find((c) => c.path === '/auth/login/mfa')!.body).toEqual({ challenge_token: 'ch-mfa_required', code: '123456', trust_device: true })
    expect(await readDeviceToken(EMAIL)).toBe(ROTATED)
  })
})
