/**
 * Settings > Security > Trusted browsers (contract 2.1.0, ADR-0023): the list, Remove (another
 * browser, or this one, which signs out here), Sign out other devices, the states around them, and
 * the token this browser forgets when the trust ends on the server.
 */
import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearSession, getSession, onSessionEnd, storeTokens } from '@/api/session'
import type { SecurityOut } from '@/api/types'
import { queryClient } from '@/lib/query-client'
import { envelope, installFetch, json, jwt, type Handler } from '@/test/fake-api'
import { SecurityView } from './security-view'
import { readDeviceToken, writeDeviceToken } from './trusted-device'

vi.hoisted(() => {
  vi.stubEnv('VITE_API_ORIGIN', 'http://localhost:3000')
})

const EMAIL = 'meera@acme.test'
const TOKEN = 't'.repeat(43)
const memberships = [{ tenant_id: 't1', tenant_name: 'Acme', role: 'owner' as const }]
const me = (admin = false) => ({ user_id: 'u1', email: EMAIL, display_name: 'Meera Iyer', tenant_id: 't1', role: 'owner', memberships, is_platform_admin: admin })
const ON: SecurityOut = {
  mfa_enrolled: true,
  recovery_codes_left: 10,
  enforcement: 'all',
  mfa_grace_until: null,
  password_changed_at: '2026-10-01T10:00:00Z',
  password_expires_at: '2027-10-01T10:00:00Z',
}
const iso = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString()
const THIS = { id: 'd-this', label: 'Chrome on macOS', created_at: iso(-3), last_used_at: iso(-0.1), expires_at: iso(27), current: true }
const PHONE = { id: 'd-phone', label: 'Safari on iOS', created_at: iso(-20), last_used_at: null, expires_at: iso(10), current: false }

function setup(routes: Record<string, Handler | Handler[]> = {}, opts: { security?: Partial<SecurityOut>; admin?: boolean } = {}) {
  storeTokens({ access_token: jwt({ sid: 'fam-1' }), refresh_token: 'rt-1', expires_in: 1800, token_type: 'bearer', memberships })
  const api = installFetch({
    'GET /auth/me': () => json(200, me(opts.admin)),
    'GET /auth/security': () => json(200, { ...ON, ...opts.security }),
    'GET /auth/devices': () => json(200, { devices: [THIS, PHONE] }),
    ...routes,
  })
  const user = userEvent.setup()
  render(
    <QueryClientProvider client={queryClient}>
      <SecurityView onSetupShown={() => undefined} />
    </QueryClientProvider>,
  )
  return { ...api, user }
}

describe('SecurityView: trusted browsers', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => {
    cleanup()
    clearSession('logout')
    queryClient.clear()
    localStorage.clear()
    vi.unstubAllGlobals()
  })

  it('lists each trusted browser with its dates, marks this one, and counts them', async () => {
    setup()
    const rows = await screen.findAllByTestId('trusted-device')
    expect(rows).toHaveLength(2)
    expect(within(rows[0]!).getByText('Chrome on macOS')).toBeTruthy()
    expect(within(rows[0]!).getByTestId('this-browser').textContent).toBe('This browser')
    expect(within(rows[0]!).getByText(/Last used .* ago/)).toBeTruthy()
    expect(within(rows[1]!).queryByTestId('this-browser')).toBeNull()
    expect(within(rows[1]!).getByText('Not used yet')).toBeTruthy()
    expect(within(rows[1]!).getByText(/Trusted until/)).toBeTruthy()
    expect(screen.getByTestId('trusted-count').textContent).toBe('2')
    expect(screen.getByText('Skip the login code for 30 days on browsers you trust.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Remove Chrome on macOS (this browser)' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Remove Safari on iOS' })).toBeTruthy()
  })

  it('says 7 days to a platform admin', async () => {
    setup({}, { admin: true })
    expect(await screen.findByText('Skip the login code for 7 days on browsers you trust.')).toBeTruthy()
  })

  it('an empty list explains how a browser gets here', async () => {
    setup({ 'GET /auth/devices': () => json(200, { devices: [] }) })
    expect(await screen.findByTestId('trusted-empty')).toBeTruthy()
    expect(screen.getByTestId('trusted-empty').textContent).toMatch(/No trusted browsers yet.*on a device you own/)
    // The empty line already says it: no "0" badge as well.
    expect(screen.queryByTestId('trusted-count')).toBeNull()
    expect(screen.getByRole('button', { name: 'Sign out other devices' })).toBeTruthy()
  })

  it('is hidden while login codes are off or not set up (nothing can be trusted)', async () => {
    setup({}, { security: { mfa_enrolled: false } })
    expect(await screen.findByTestId('login-codes-card')).toBeTruthy()
    expect(screen.queryByTestId('trusted-browsers-card')).toBeNull()
    cleanup()
    const { calls } = setup({}, { security: { enforcement: 'off', mfa_enrolled: false } })
    expect(await screen.findByTestId('password-card')).toBeTruthy()
    expect(screen.queryByTestId('trusted-browsers-card')).toBeNull()
    expect(calls.some((c) => c.path === '/auth/devices')).toBe(false)
  })

  it('is hidden on an API older than 2.1.0 (no such route)', async () => {
    const { calls } = setup({ 'GET /auth/devices': () => envelope(404, 'NOT_FOUND') })
    expect(await screen.findByTestId('login-codes-card')).toBeTruthy()
    await waitFor(() => expect(calls.some((c) => c.path === '/auth/devices')).toBe(true))
    await waitFor(() => expect(screen.queryByTestId('trusted-browsers-card')).toBeNull())
  })

  it('a failed load (after one quiet retry) can be retried by hand', { timeout: 10_000 }, async () => {
    const fail = () => envelope(500, 'INTERNAL_ERROR')
    const { user } = setup({ 'GET /auth/devices': [fail, fail, () => json(200, { devices: [PHONE] })] })
    expect(await screen.findByTestId('trusted-load-error', undefined, { timeout: 5000 })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findAllByTestId('trusted-device')).toHaveLength(1)
  })

  it('removes another browser after a confirm, and keeps this session and this browser’s token', async () => {
    await writeDeviceToken(EMAIL, TOKEN, iso(27))
    const { user, calls } = setup({
      'DELETE /auth/devices/d-phone': () => new Response(null, { status: 204 }),
      'GET /auth/devices': [() => json(200, { devices: [THIS, PHONE] }), () => json(200, { devices: [THIS] })],
    })
    await user.click(await screen.findByRole('button', { name: 'Remove Safari on iOS' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('Remove Safari on iOS?')).toBeTruthy()
    expect(within(dialog).getByText(/signed out now/)).toBeTruthy()
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(screen.getAllByTestId('trusted-device')).toHaveLength(1))
    expect(calls.filter((c) => c.method === 'DELETE').map((c) => c.path)).toEqual(['/auth/devices/d-phone'])
    expect(getSession().status).toBe('authenticated')
    expect(await readDeviceToken(EMAIL)).toBe(TOKEN)
  })

  it('Cancel removes nothing', async () => {
    const { user, calls } = setup()
    await user.click(await screen.findByRole('button', { name: 'Remove Safari on iOS' }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false)
  })

  it('removing this browser forgets its token and signs out here (the API ended this session)', async () => {
    await writeDeviceToken(EMAIL, TOKEN, iso(27))
    const ended = vi.fn()
    const off = onSessionEnd(ended)
    const { user, calls } = setup({
      'DELETE /auth/devices/d-this': () => new Response(null, { status: 204 }),
      'POST /auth/logout': () => new Response(null, { status: 204 }),
    })
    await user.click(await screen.findByRole('button', { name: 'Remove Chrome on macOS (this browser)' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('Remove this browser?')).toBeTruthy()
    expect(within(dialog).getByText(/signed out here/)).toBeTruthy()
    await user.click(within(dialog).getByRole('button', { name: 'Remove and sign out' }))
    await waitFor(() => expect(ended).toHaveBeenCalledWith('logout'))
    expect(getSession().status).toBe('anonymous')
    expect(await readDeviceToken(EMAIL)).toBeNull()
    expect(calls.find((c) => c.path === '/auth/logout')!.body).toEqual({ refresh_token: 'rt-1' })
    off()
  })

  it('this browser already gone (404) still ends this session on the server', async () => {
    await writeDeviceToken(EMAIL, TOKEN, iso(27))
    const { user, calls } = setup({
      'DELETE /auth/devices/d-this': () => envelope(404, 'NOT_FOUND'),
      'POST /auth/logout': () => new Response(null, { status: 204 }),
    })
    await user.click(await screen.findByRole('button', { name: 'Remove Chrome on macOS (this browser)' }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Remove and sign out' }))
    await waitFor(() => expect(getSession().status).toBe('anonymous'))
    expect(calls.find((c) => c.path === '/auth/logout')!.body).toEqual({ refresh_token: 'rt-1' })
    expect(await readDeviceToken(EMAIL)).toBeNull()
    expect(screen.queryByTestId('trusted-error')).toBeNull()
  })

  it('a browser already gone (404) just refreshes the list', async () => {
    const { user } = setup({
      'DELETE /auth/devices/d-phone': () => envelope(404, 'NOT_FOUND'),
      'GET /auth/devices': [() => json(200, { devices: [THIS, PHONE] }), () => json(200, { devices: [THIS] })],
    })
    await user.click(await screen.findByRole('button', { name: 'Remove Safari on iOS' }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(screen.getAllByTestId('trusted-device')).toHaveLength(1))
    expect(screen.queryByTestId('trusted-error')).toBeNull()
  })

  it('a failed remove says why and changes nothing', async () => {
    await writeDeviceToken(EMAIL, TOKEN, iso(27))
    const { user } = setup({ 'DELETE /auth/devices/d-this': () => envelope(500, 'INTERNAL_ERROR', 'Internal server error.') })
    await user.click(await screen.findByRole('button', { name: 'Remove Chrome on macOS (this browser)' }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Remove and sign out' }))
    expect(await screen.findByTestId('trusted-error')).toBeTruthy()
    expect(getSession().status).toBe('authenticated')
    expect(await readDeviceToken(EMAIL)).toBe(TOKEN)
  })

  it('Sign out other devices forgets every trusted browser, this one too, and keeps this session', async () => {
    await writeDeviceToken(EMAIL, TOKEN, iso(27))
    await writeDeviceToken('ravi@acme.test', TOKEN, iso(27))
    const { user, calls } = setup({
      'POST /auth/devices/sign-out-all': () => new Response(null, { status: 204 }),
      'GET /auth/devices': [() => json(200, { devices: [THIS, PHONE] }), () => json(200, { devices: [] })],
    })
    await user.click(await screen.findByRole('button', { name: 'Sign out other devices' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('Sign out everywhere else?')).toBeTruthy()
    expect(within(dialog).getByText(/You stay signed in here/)).toBeTruthy()
    await user.click(within(dialog).getByRole('button', { name: 'Sign out everywhere else' }))
    expect(await screen.findByTestId('trusted-empty')).toBeTruthy()
    expect(calls.filter((c) => c.path === '/auth/devices/sign-out-all')).toHaveLength(1)
    expect(getSession().status).toBe('authenticated')
    expect(await readDeviceToken(EMAIL)).toBeNull()
    // Another account's trust in this browser is that account's business.
    expect(await readDeviceToken('ravi@acme.test')).toBe(TOKEN)
  })

  it('a password change forgets this browser’s token and reloads the list', async () => {
    await writeDeviceToken(EMAIL, TOKEN, iso(27))
    const { user, calls } = setup({
      'POST /auth/password': () => new Response(null, { status: 204 }),
      'GET /auth/devices': [() => json(200, { devices: [THIS] }), () => json(200, { devices: [] })],
    })
    await user.click(await screen.findByRole('button', { name: 'Change password' }))
    await user.type(screen.getByLabelText('Current password'), 'old-password')
    await user.type(screen.getByLabelText('New password'), 'Tulip-Rain-2026')
    await user.type(screen.getByLabelText('Type it again'), 'Tulip-Rain-2026')
    await user.click(within(screen.getByTestId('change-password-form')).getByRole('button', { name: 'Change password' }))
    expect(await screen.findByTestId('trusted-empty')).toBeTruthy()
    expect(await readDeviceToken(EMAIL)).toBeNull()
    expect(calls.filter((c) => c.path === '/auth/devices').length).toBeGreaterThanOrEqual(2)
  })

  it('a new authenticator forgets this browser’s token too', async () => {
    await writeDeviceToken(EMAIL, TOKEN, iso(27))
    const { user } = setup({
      'POST /auth/mfa/totp/enroll': () => json(200, { otpauth_uri: 'otpauth://totp/x?secret=ABCD', secret_b32: 'ABCD' }),
      'POST /auth/mfa/totp/confirm': () => json(200, { recovery_codes: Array.from({ length: 10 }, (_, i) => `c-${i}`) }),
      'POST /auth/refresh': () => json(200, { access_token: jwt({ sid: 'fam-1', jti: 'r' }), refresh_token: 'rt-2', expires_in: 1800, token_type: 'bearer', memberships }),
    })
    await user.click(await screen.findByRole('button', { name: 'Replace authenticator' }))
    await user.click(await screen.findByRole('button', { name: 'Continue' }))
    await user.click(await screen.findByRole('button', { name: 'Continue' }))
    await user.type(await screen.findByLabelText('6-digit code'), '123456')
    await user.click(screen.getByRole('button', { name: 'Use this authenticator' }))
    await user.click(await screen.findByRole('checkbox', { name: 'I saved these codes somewhere safe' }))
    await user.click(screen.getByRole('button', { name: 'Done' }))
    await waitFor(async () => expect(await readDeviceToken(EMAIL)).toBeNull())
  })
})
