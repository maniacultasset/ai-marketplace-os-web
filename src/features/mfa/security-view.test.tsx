import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearSession, currentRefreshToken, getSession, onSessionEnd, storeTokens } from '@/api/session'
import type { SecurityOut } from '@/api/types'
import { queryClient } from '@/lib/query-client'
import { envelope, installFetch, json, jwt, type Handler } from '@/test/fake-api'
import { SecurityView } from './security-view'

vi.hoisted(() => {
  vi.stubEnv('VITE_API_ORIGIN', 'http://localhost:3000')
})

const memberships = [{ tenant_id: 't1', tenant_name: 'Acme', role: 'owner' as const }]
const ME = { user_id: 'u1', email: 'meera@acme.test', display_name: 'Meera Iyer', tenant_id: 't1', role: 'owner', memberships, is_platform_admin: false }
const CODES = Array.from({ length: 10 }, (_, i) => `new-${i}`)
const base: SecurityOut = {
  mfa_enrolled: false,
  recovery_codes_left: 0,
  enforcement: 'all',
  mfa_grace_until: null,
  password_changed_at: '2026-10-01T10:00:00Z',
  password_expires_at: '2027-10-01T10:00:00Z',
}

function setup(
  security: Partial<SecurityOut>,
  routes: Record<string, Handler | Handler[]> = {},
  opts: { setup?: boolean; strict?: boolean; sid?: string } = {},
) {
  storeTokens({ access_token: jwt(opts.sid ? { sid: opts.sid } : {}), refresh_token: 'rt-1', expires_in: 1800, token_type: 'bearer', memberships })
  const api = installFetch({
    'GET /auth/me': () => json(200, ME),
    'GET /auth/security': () => json(200, { ...base, ...security }),
    'POST /auth/refresh': () => json(200, { access_token: jwt({ jti: 'r' }), refresh_token: 'rt-2', expires_in: 1800, token_type: 'bearer', memberships }),
    ...routes,
  })
  const onSetupShown = vi.fn()
  const user = userEvent.setup()
  const tree = (
    <QueryClientProvider client={queryClient}>
      <SecurityView setup={opts.setup} onSetupShown={onSetupShown} />
    </QueryClientProvider>
  )
  render(opts.strict ? <StrictMode>{tree}</StrictMode> : tree)
  return { ...api, user, onSetupShown }
}

describe('SecurityView', () => {
  afterEach(() => {
    cleanup()
    clearSession('logout')
    queryClient.clear()
    vi.unstubAllGlobals()
  })

  it('under enforcement "off" explains and offers no MFA action (the routes answer 501)', async () => {
    setup({ enforcement: 'off' })
    expect(await screen.findByText('Not switched on yet')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Set up authenticator' })).toBeNull()
    // The password card works in both modes.
    expect(screen.getByRole('button', { name: 'Change password' })).toBeTruthy()
    expect(screen.getByText('1 Oct 2026')).toBeTruthy()
    expect(screen.getByText('1 Oct 2027')).toBeTruthy()
  })

  it('sets up the authenticator under StrictMode: current password → QR → code → recovery codes → done', async () => {
    const { user, calls } = setup(
      { mfa_grace_until: '2999-11-20T00:00:00+05:30' },
      {
        'POST /auth/mfa/totp/enroll': [
          () => envelope(422, 'VALIDATION_FAILED', 'The current password is not correct.'),
          () => json(200, { otpauth_uri: 'otpauth://totp/Kuinn:meera?secret=JBSWY3DPEHPK3PXP', secret_b32: 'JBSWY3DPEHPK3PXP' }),
        ],
        'POST /auth/mfa/totp/confirm': () => json(200, { recovery_codes: CODES }),
      },
      { strict: true, sid: 'fam-1' },
    )
    expect(await screen.findByText(/Set up login codes by 20 Nov 2999/)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Set up authenticator' }))
    const pw = await screen.findByLabelText('Current password')
    await user.type(pw, 'wrong')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByText('The current password is not correct.')).toBeTruthy()
    await user.clear(pw)
    await user.type(pw, 'right-password')
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    // The password confirms on step 1 and enrols once; the setup moves on to the scan.
    expect(await screen.findByTestId('mfa-qr')).toBeTruthy()
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Scan the QR code' })))
    expect(screen.queryByTestId('mfa-secret')).toBeNull()
    await user.click(screen.getByRole('button', { name: "Can't scan? Show setup key" }))
    expect(screen.getByTestId('mfa-secret').textContent).toBe('JBSW Y3DP EHPK 3PXP')
    // Back shows the password as confirmed and Continue goes on without a second enrol.
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(await screen.findByText('Password confirmed')).toBeTruthy()
    expect(screen.queryByLabelText('Current password')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.click(await screen.findByRole('button', { name: 'Continue' }))
    await user.type(await screen.findByLabelText('6-digit code'), '123456')
    await user.click(screen.getByRole('button', { name: 'Turn on login codes' }))

    const list = await screen.findByRole('list', { name: 'Recovery codes' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(10)
    await user.click(screen.getByRole('checkbox', { name: 'I saved these codes somewhere safe' }))
    await user.click(screen.getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(screen.queryByTestId('totp-setup')).toBeNull())

    const enrolls = calls.filter((c) => c.path === '/auth/mfa/totp/enroll')
    expect(enrolls.map((c) => c.body)).toEqual([{ current_password: 'wrong' }, { current_password: 'right-password' }])
    expect(calls.find((c) => c.path === '/auth/mfa/totp/confirm')!.body).toEqual({ code: '123456' })
    // The session rotates once so this tab's token carries the fresh code.
    await waitFor(() => expect(calls.some((c) => c.path === '/auth/refresh')).toBe(true))
  })

  it('opens the setup at once when routed by MFA_ENROLLMENT_REQUIRED', async () => {
    const { onSetupShown } = setup({}, {}, { setup: true })
    expect(await screen.findByLabelText('Current password')).toBeTruthy()
    expect(onSetupShown).toHaveBeenCalled()
  })

  it('enrolled: warns at 3 codes or fewer and makes new recovery codes after a confirm', async () => {
    const { user, calls } = setup({ mfa_enrolled: true, recovery_codes_left: 2 }, { 'POST /auth/mfa/recovery-codes': () => json(200, { recovery_codes: CODES }) })
    expect(await screen.findByText('Only 2 recovery codes left')).toBeTruthy()
    expect(screen.getByTestId('codes-left').textContent).toBe('2 of 10')
    await user.click(screen.getByRole('button', { name: 'New recovery codes' }))
    await user.click(await screen.findByRole('button', { name: 'Make new codes' }))
    expect(await screen.findByRole('list', { name: 'Recovery codes' })).toBeTruthy()
    expect(calls.filter((c) => c.path === '/auth/mfa/recovery-codes')).toHaveLength(1)
  })

  it('replacing the authenticator enrols without a password (the API asks for a step-up)', async () => {
    const { user, calls } = setup(
      { mfa_enrolled: true, recovery_codes_left: 10 },
      { 'POST /auth/mfa/totp/enroll': () => json(200, { otpauth_uri: 'otpauth://totp/x?secret=ABCD', secret_b32: 'ABCD' }) },
    )
    await user.click(await screen.findByRole('button', { name: 'Replace authenticator' }))
    // Enrols as the panel opens, while step 1 shows; Continue only moves on.
    expect(await screen.findByText(/old authenticator keeps working/)).toBeTruthy()
    await waitFor(() => expect(calls.filter((c) => c.path === '/auth/mfa/totp/enroll')).toHaveLength(1))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByTestId('mfa-qr')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByRole('button', { name: 'Use this authenticator' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(await screen.findByTestId('mfa-qr')).toBeTruthy()
    expect(calls.filter((c) => c.path === '/auth/mfa/totp/enroll')).toHaveLength(1)
    expect(calls.find((c) => c.path === '/auth/mfa/totp/enroll')!.body).toEqual({})
  })

  it('a cancelled step-up while replacing shows why nothing changed', async () => {
    const { user } = setup({ mfa_enrolled: true, recovery_codes_left: 10 }, { 'POST /auth/mfa/totp/enroll': () => envelope(403, 'MFA_STEP_UP_REQUIRED') })
    await user.click(await screen.findByRole('button', { name: 'Replace authenticator' }))
    expect(await screen.findByText('Not changed: this needs a code from your authenticator app.')).toBeTruthy()
  })

  it('changes the password (MFA on, sid kept): stays signed in; the once-a-day refusal is shown as the API words it', async () => {
    const { user, calls } = setup(
      { enforcement: 'all', mfa_enrolled: true, recovery_codes_left: 10 },
      {
        'POST /auth/password': [
          () => envelope(422, 'VALIDATION_FAILED', 'The password can be changed once a day. Try again tomorrow.'),
          () => new Response(null, { status: 204 }),
        ],
      },
      { sid: 'fam-1' },
    )
    expect(await screen.findByText(/signs you out on your other devices/)).toBeTruthy()
    await user.click(await screen.findByRole('button', { name: 'Change password' }))
    await user.type(screen.getByLabelText('Current password'), 'old-password')
    await user.type(screen.getByLabelText('New password'), 'Tulip-Rain-2026')
    // The name rule uses the display name too.
    expect(screen.getByTestId('password-rules').querySelector('[data-rule="personal"]')!.hasAttribute('data-met')).toBe(true)
    await user.type(screen.getByLabelText('Type it again'), 'Tulip-Rain-2026')
    await user.click(screen.getByRole('button', { name: 'Change password' }))
    expect(await screen.findByText('The password can be changed once a day. Try again tomorrow.')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Change password' }))
    await waitFor(() => expect(screen.queryByTestId('change-password-form')).toBeNull())
    expect(calls.filter((c) => c.path === '/auth/password').map((c) => c.body)).toEqual([
      { current_password: 'old-password', new_password: 'Tulip-Rain-2026' },
      { current_password: 'old-password', new_password: 'Tulip-Rain-2026' },
    ])
  })

  it('changes the password (MFA off, no sid): the backend revoked this session too, so it ends here', async () => {
    const ended = vi.fn()
    const off = onSessionEnd(ended)
    const { user, calls } = setup({ enforcement: 'off' }, { 'POST /auth/password': () => new Response(null, { status: 204 }) })
    expect(await screen.findByText(/signs you out everywhere, here too/)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Change password' }))
    await user.type(screen.getByLabelText('Current password'), 'old-password')
    await user.type(screen.getByLabelText('New password'), 'Tulip-Rain-2026')
    await user.type(screen.getByLabelText('Type it again'), 'Tulip-Rain-2026')
    await user.click(screen.getByRole('button', { name: 'Change password' }))
    await waitFor(() => expect(ended).toHaveBeenCalledWith('password-changed'))
    expect(getSession()).toMatchObject({ status: 'anonymous', endReason: 'password-changed' })
    // The revoked refresh token is dropped, never presented again (that would read as reuse).
    expect(currentRefreshToken()).toBeNull()
    expect(calls.some((c) => c.path === '/auth/refresh')).toBe(false)
    off()
  })
})
