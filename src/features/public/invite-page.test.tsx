import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/errors'

const TOKEN = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJ0123-_6'
const navigate = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, search, children, ...rest }: { to: string; search?: Record<string, string>; children: ReactNode }) => (
    <a href={search ? `${to}?${new URLSearchParams(search).toString()}` : to} {...rest}>
      {children}
    </a>
  ),
  useRouter: () => ({ navigate, history: { push: vi.fn() }, invalidate: vi.fn() }),
}))

const s = vi.hoisted(() => ({
  session: 'anonymous' as 'anonymous' | 'authenticated',
  me: null as null | { email: string },
}))
const signIn = vi.fn()
const switchTenant = vi.fn()
vi.mock('@/lib/auth', () => ({
  useSession: () => ({ status: s.session }),
  useMe: () => ({ data: s.me ?? undefined, isPending: s.session === 'authenticated' && !s.me }),
  signIn: (...a: unknown[]) => signIn(...a),
  switchTenant: (...a: unknown[]) => switchTenant(...a),
  logout: vi.fn(async () => undefined),
}))
const onResult = vi.fn()
vi.mock('./use-sign-in-flow', () => ({
  useSignInFlow: () => ({ step: { kind: 'credentials' }, onResult, setStep: vi.fn(), apply: vi.fn(), remember: vi.fn(), restart: vi.fn() }),
}))
vi.mock('@/features/google/google-button', () => ({ GoogleEntry: () => <div data-testid="google-entry" /> }))

const api = vi.hoisted(() => ({
  lookupOnce: vi.fn(),
  acceptInviteWithPassword: vi.fn(),
  joinInvite: vi.fn(),
  redeemResetLink: vi.fn(),
}))
vi.mock('@/features/team-account/access-api', () => api)

const { InvitePage } = await import('./invite-page')
const { ResetPasswordPage } = await import('./reset-password-page')

const preview = (account: 'new' | 'existing' | 'own_password') => ({
  tenant_name: 'Kalakar Weaves',
  role: 'reviewer',
  email: 'asha@kalakar.in',
  expires_at: '2026-11-15T10:00:00Z',
  account,
})
const apiError = (status: number, type: string, details: { loc: (string | number)[]; msg: string; type: string }[] = []) =>
  new ApiError({ type: type as never, status, message: 'm', details, correlationId: 'req-1' })

beforeEach(() => {
  s.session = 'anonymous'
  s.me = null
})
afterEach(() => {
  cleanup()
  sessionStorage.clear()
  vi.clearAllMocks()
})

const open = (path: string) => window.history.replaceState(null, '', path)

describe('InvitePage', () => {
  it('asks for the whole link when the token is missing, and never calls the API', () => {
    open('/invite')
    render(<InvitePage />)
    expect(screen.getByTestId('invite-missing')).toBeTruthy()
    expect(api.lookupOnce).not.toHaveBeenCalled()
  })

  it('a cut-off token is refused without a call', () => {
    open('/invite#token=short')
    render(<InvitePage />)
    expect(screen.getByTestId('invite-invalid')).toBeTruthy()
    expect(api.lookupOnce).not.toHaveBeenCalled()
  })

  it('a used, cancelled or expired link (the one 404) reads the same, and the kept token is dropped', async () => {
    open(`/invite#token=${TOKEN}`)
    api.lookupOnce.mockRejectedValue(apiError(404, 'NOT_FOUND'))
    render(<InvitePage />)
    await screen.findByTestId('invite-invalid')
    expect(screen.getByText(/used already, cancelled, or replaced/)).toBeTruthy()
    expect(sessionStorage.getItem('mkos.invite')).toBeNull()
    expect(window.location.hash).toBe('')
  })

  it('new account: name, password and confirm, then signs in with that password', async () => {
    open(`/invite#token=${TOKEN}`)
    api.lookupOnce.mockResolvedValue(preview('new'))
    api.acceptInviteWithPassword.mockResolvedValue({ email: 'asha@kalakar.in', tenant_name: 'Kalakar Weaves' })
    signIn.mockResolvedValue({ status: 'signed_in' })
    render(<InvitePage />)
    await screen.findByTestId('invite-new-form')
    expect(screen.getByText('Join Kalakar Weaves on Kuinn')).toBeTruthy()
    expect(screen.getByTestId('invite-preview-email').textContent).toBe('asha@kalakar.in')
    expect(screen.getByTestId('google-entry')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Asha Rao' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Blue-Mango-2026!' } })
    fireEvent.change(screen.getByLabelText('Type it again'), { target: { value: 'Blue-Mango-2026!' } })
    fireEvent.click(screen.getByTestId('invite-new-submit'))
    await waitFor(() => expect(api.acceptInviteWithPassword).toHaveBeenCalledWith(TOKEN, 'Blue-Mango-2026!', 'Asha Rao'))
    await waitFor(() => expect(signIn).toHaveBeenCalledWith('asha@kalakar.in', 'Blue-Mango-2026!'))
    expect(onResult).toHaveBeenCalled()
    expect(sessionStorage.getItem('mkos.invite')).toBeNull()
  })

  it('new account: mismatched passwords never reach the API', async () => {
    open(`/invite#token=${TOKEN}`)
    api.lookupOnce.mockResolvedValue(preview('new'))
    render(<InvitePage />)
    await screen.findByTestId('invite-new-form')
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Asha Rao' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Blue-Mango-2026!' } })
    fireEvent.change(screen.getByLabelText('Type it again'), { target: { value: 'Blue-Mango-2027!' } })
    fireEvent.click(screen.getByTestId('invite-new-submit'))
    await screen.findByText('The two passwords do not match.')
    expect(api.acceptInviteWithPassword).not.toHaveBeenCalled()
  })

  it('own_password: only the current password; a wrong one says so', async () => {
    open(`/invite#token=${TOKEN}`)
    api.lookupOnce.mockResolvedValue(preview('own_password'))
    api.acceptInviteWithPassword.mockRejectedValue(apiError(401, 'UNAUTHENTICATED'))
    render(<InvitePage />)
    await screen.findByTestId('invite-own-form')
    expect(screen.queryByLabelText('Type it again')).toBeNull()
    fireEvent.change(screen.getByLabelText('Your Kuinn password'), { target: { value: 'old-pass' } })
    fireEvent.click(screen.getByTestId('invite-own-submit'))
    await screen.findByText(/That password didn’t work/)
    expect(api.acceptInviteWithPassword).toHaveBeenCalledWith(TOKEN, 'old-pass')
  })

  it('existing account, signed out: sign in, then come back here', async () => {
    open(`/invite#token=${TOKEN}`)
    api.lookupOnce.mockResolvedValue(preview('existing'))
    render(<InvitePage />)
    const link = await screen.findByTestId('invite-sign-in')
    expect(link.getAttribute('href')).toBe('/login?redirect=%2Finvite')
    // The token waits in this tab for the way back.
    expect(sessionStorage.getItem('mkos.invite')).toBe(TOKEN)
  })

  it('existing account, signed in as the invited email: Join, then switch to the brand', async () => {
    s.session = 'authenticated'
    s.me = { email: 'Asha@kalakar.in' }
    open(`/invite#token=${TOKEN}`)
    api.lookupOnce.mockResolvedValue(preview('existing'))
    api.joinInvite.mockResolvedValue({ tenant_id: 't-2', role: 'reviewer' })
    switchTenant.mockResolvedValue({})
    render(<InvitePage />)
    fireEvent.click(await screen.findByTestId('invite-join'))
    await waitFor(() => expect(switchTenant).toHaveBeenCalledWith('t-2'))
    expect(navigate).toHaveBeenCalledWith({ to: '/home' })
  })

  it('signed in as someone else: sign out first', async () => {
    s.session = 'authenticated'
    s.me = { email: 'owner@other.in' }
    open(`/invite#token=${TOKEN}`)
    api.lookupOnce.mockResolvedValue(preview('existing'))
    render(<InvitePage />)
    await screen.findByTestId('invite-wrong-account')
    expect(screen.queryByTestId('invite-join')).toBeNull()
  })
})

describe('ResetPasswordPage', () => {
  it('asks for the whole link when the token is missing', () => {
    open('/reset-password')
    render(<ResetPasswordPage />)
    expect(screen.getByTestId('reset-missing')).toBeTruthy()
  })

  it('saves the new password, then sends the person to sign in', async () => {
    open(`/reset-password#token=${TOKEN}`)
    api.redeemResetLink.mockResolvedValue(undefined)
    render(<ResetPasswordPage />)
    expect(window.location.hash).toBe('')
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'Blue-Mango-2026!' } })
    fireEvent.change(screen.getByLabelText('Type it again'), { target: { value: 'Blue-Mango-2026!' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save new password' }))
    await screen.findByTestId('reset-done')
    expect(api.redeemResetLink).toHaveBeenCalledWith(TOKEN, 'Blue-Mango-2026!')
    expect(screen.getByTestId('reset-sign-in').getAttribute('href')).toBe('/login')
    expect(sessionStorage.getItem('mkos.reset')).toBeNull()
  })

  it('a dead link (404) says so instead of a form error', async () => {
    open(`/reset-password#token=${TOKEN}`)
    api.redeemResetLink.mockRejectedValue(apiError(404, 'NOT_FOUND'))
    render(<ResetPasswordPage />)
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'Blue-Mango-2026!' } })
    fireEvent.change(screen.getByLabelText('Type it again'), { target: { value: 'Blue-Mango-2026!' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save new password' }))
    await screen.findByTestId('reset-invalid')
  })

  it('shows the server’s password rule under the field', async () => {
    open(`/reset-password#token=${TOKEN}`)
    api.redeemResetLink.mockRejectedValue(
      apiError(422, 'VALIDATION_FAILED', [{ loc: ['body', 'new_password'], msg: 'Must not be one of your last 10 passwords.', type: 'x' }]),
    )
    render(<ResetPasswordPage />)
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'Blue-Mango-2026!' } })
    fireEvent.change(screen.getByLabelText('Type it again'), { target: { value: 'Blue-Mango-2026!' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save new password' }))
    await screen.findByText('Must not be one of your last 10 passwords.')
  })
})
