import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, unwrap } from '@/api/client'
import { clearSession, currentRefreshToken, getAccessToken, storeTokens } from '@/api/session'
import { envelope, installFetch, json, jwt } from '@/test/fake-api'
import { StepUpHost } from './step-up-dialog'

vi.hoisted(() => {
  vi.stubEnv('VITE_API_ORIGIN', 'http://localhost:3000')
})

const memberships = [{ tenant_id: 't1', tenant_name: 'Acme', role: 'owner' as const }]
const member = { user_id: 'u2', email: 'op@acme.test', display_name: null, role: 'reviewer', is_active: true }
const stepped = jwt({ amr: ['pwd', 'otp'], jti: 'stepped' })
const patchMember = () => unwrap(api.PATCH('/members/{user_id}', { params: { path: { user_id: 'u2' } }, body: { role: 'reviewer' } }))
const revoke = () => unwrap(api.POST('/marketplaces/accounts/{account_id}/revoke', { params: { path: { account_id: 'a1' } } }))

describe('StepUpHost: a sensitive request answered 403 MFA_STEP_UP_REQUIRED', () => {
  beforeEach(() => {
    storeTokens({ access_token: jwt(), refresh_token: 'rt-1', expires_in: 1800, token_type: 'bearer', memberships })
    render(<StepUpHost />)
  })
  afterEach(() => {
    cleanup()
    clearSession('logout')
    vi.unstubAllGlobals()
  })

  it('asks for a code, swaps only the access token, and retries the request once', async () => {
    const user = userEvent.setup()
    const { calls } = installFetch({
      'PATCH /members/u2': [() => envelope(403, 'MFA_STEP_UP_REQUIRED'), () => json(200, member)],
      'POST /auth/mfa/step-up': [
        () => envelope(422, 'VALIDATION_FAILED', 'The code is not correct.'),
        () => json(200, { access_token: stepped, token_type: 'bearer', expires_in: 1800 }),
      ],
    })
    const result = patchMember()
    const input = await screen.findByLabelText('6-digit code')
    expect(screen.getByRole('dialog', { name: "Confirm it's you" })).toBeTruthy()
    await waitFor(() => expect(document.activeElement).toBe(input))
    expect(input.getAttribute('autocomplete')).toBe('one-time-code')
    expect(input.getAttribute('inputmode')).toBe('numeric')

    // A wrong code: the server sentence, announced under the field; the dialog stays.
    await user.type(input, '000000')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(await screen.findByText('The code is not correct.')).toBeTruthy()
    expect((input as HTMLInputElement).value).toBe('')

    await user.type(input, '123456')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(await result).toEqual(member)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'PATCH /members/u2',
      'POST /auth/mfa/step-up',
      'POST /auth/mfa/step-up',
      'PATCH /members/u2',
    ])
    expect(calls[2]!.body).toEqual({ code: '123456' })
    expect(calls[3]!.auth).toBe(`Bearer ${stepped}`)
    expect(getAccessToken()).toBe(stepped)
    expect(currentRefreshToken()).toBe('rt-1')
  })

  it('takes a recovery code where allowed', async () => {
    const user = userEvent.setup()
    const { calls } = installFetch({
      'PATCH /members/u2': [() => envelope(403, 'MFA_STEP_UP_REQUIRED'), () => json(200, member)],
      'POST /auth/mfa/step-up': () => json(200, { access_token: stepped, token_type: 'bearer', expires_in: 1800 }),
    })
    const result = patchMember()
    await user.click(await screen.findByRole('button', { name: 'Use a recovery code' }))
    await user.type(screen.getByLabelText('Recovery code'), 'abcd-efgh')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    await result
    expect(calls.find((c) => c.path === '/auth/mfa/step-up')!.body).toEqual({ recovery_code: 'abcd-efgh' })
  })

  it('offers no recovery code on a TOTP-only action (account revoke)', async () => {
    installFetch({ 'POST /marketplaces/accounts/a1/revoke': () => envelope(403, 'MFA_STEP_UP_REQUIRED') })
    const user = userEvent.setup()
    const result = revoke().catch((e: unknown) => e)
    await screen.findByLabelText('6-digit code')
    expect(screen.queryByRole('button', { name: 'Use a recovery code' })).toBeNull()
    expect(screen.getByText(/recovery codes don't work here/)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(await result).toMatchObject({ status: 403, type: 'MFA_STEP_UP_REQUIRED' })
  })

  it('switches to TOTP when a TOTP-only request joins an open dialog', async () => {
    const user = userEvent.setup()
    const { calls } = installFetch({
      'PATCH /members/u2': [() => envelope(403, 'MFA_STEP_UP_REQUIRED'), () => json(200, member)],
      'POST /marketplaces/accounts/a1/revoke': [() => envelope(403, 'MFA_STEP_UP_REQUIRED'), () => json(200, { id: 'a1' })],
      'POST /auth/mfa/step-up': () => json(200, { access_token: stepped, token_type: 'bearer', expires_in: 1800 }),
    })
    const first = patchMember()
    await user.click(await screen.findByRole('button', { name: 'Use a recovery code' }))
    await user.type(screen.getByLabelText('Recovery code'), 'abcd')
    const second = revoke()
    // The recovery option goes away and the typed recovery code is dropped.
    const input = await screen.findByLabelText('6-digit code')
    expect((input as HTMLInputElement).value).toBe('')
    expect(screen.queryByRole('button', { name: 'Use a recovery code' })).toBeNull()
    await user.type(input, '123456')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    await Promise.all([first, second])
    const stepUps = calls.filter((c) => c.path === '/auth/mfa/step-up')
    expect(stepUps.map((c) => c.body)).toEqual([{ code: '123456' }])
  })

  it('cancel fails the request as it was, without a retry', async () => {
    const { calls } = installFetch({ 'PATCH /members/u2': () => envelope(403, 'MFA_STEP_UP_REQUIRED') })
    const user = userEvent.setup()
    const result = patchMember().catch((e: unknown) => e)
    await screen.findByLabelText('6-digit code')
    await user.keyboard('{Escape}')
    expect(await result).toMatchObject({ type: 'MFA_STEP_UP_REQUIRED' })
    expect(calls.filter((c) => c.path === '/members/u2')).toHaveLength(1)
  })

  it('blocks a short code before any request, and opens fresh (empty) next time', async () => {
    const { calls } = installFetch({ 'PATCH /members/u2': () => envelope(403, 'MFA_STEP_UP_REQUIRED') })
    const user = userEvent.setup()
    const first = patchMember().catch(() => undefined)
    await user.type(await screen.findByLabelText('6-digit code'), '12')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(await screen.findByText('Enter the 6-digit code.')).toBeTruthy()
    expect(calls.some((c) => c.path === '/auth/mfa/step-up')).toBe(false)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await first
    const second = patchMember().catch(() => undefined)
    const input = await screen.findByLabelText('6-digit code')
    expect((input as HTMLInputElement).value).toBe('')
    expect(screen.queryByText('Enter the 6-digit code.')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await second
  })
})
