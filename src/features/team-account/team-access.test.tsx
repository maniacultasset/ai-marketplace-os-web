import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/errors'
import { TooltipProvider } from '@/components/ui/tooltip'

const s = vi.hoisted(() => ({ role: 'owner' as 'owner' | 'admin' }))
vi.mock('@/lib/auth', () => ({
  useSession: () => ({ status: 'authenticated', tenantId: 't1' }),
  useMe: () => ({ data: { user_id: 'me', email: 'owner@kalakar.in', role: s.role } }),
}))
const api = vi.hoisted(() => ({ createInvite: vi.fn(), revokeInvite: vi.fn(), issueResetLink: vi.fn() }))
vi.mock('./access-api', () => api)

const { InviteDialog } = await import('./invite-dialog')
const { ResetLinkDialog } = await import('./reset-link-dialog')
const { PendingInvites } = await import('./pending-invites')

const wrap = (ui: ReactNode) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <TooltipProvider>{ui}</TooltipProvider>
    </QueryClientProvider>,
  )
const apiError = (status: number, type: string) => new ApiError({ type: type as never, status, message: 'm', correlationId: 'req-1' })
const invite = (over: Record<string, unknown> = {}) => ({
  id: 'i1',
  email: 'asha@kalakar.in',
  role: 'reviewer' as const,
  status: 'pending' as const,
  expires_at: '2026-11-15T10:00:00Z',
  created_at: '2026-11-08T10:00:00Z',
  ...over,
})
const URL = 'https://app.kuinn.in/invite#token=abcdefghijklmnopqrstuvwxyzABCDEFGHIJ0123-_6'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  s.role = 'owner'
})

describe('InviteDialog', () => {
  it('makes a link and shows it once, with Copy and the send-it-yourself note', async () => {
    api.createInvite.mockResolvedValue({ invite: invite({ email: 'asha@kalakar.in' }), invite_url: URL })
    wrap(<InviteDialog open onClose={vi.fn()} members={[]} pending={[]} />)
    fireEvent.change(screen.getByTestId('invite-email'), { target: { value: ' Asha@Kalakar.in ' } })
    fireEvent.click(screen.getByTestId('invite-submit'))
    await screen.findByText('Invite ready')
    expect(api.createInvite).toHaveBeenCalledWith('asha@kalakar.in', 'operator')
    expect((screen.getByTestId('invite-link-url') as HTMLInputElement).value).toBe(URL)
    expect(screen.getByText(/Kuinn does not email it/)).toBeTruthy()
    expect(screen.getByTestId('invite-link-copy')).toBeTruthy()
  })

  it('says "already on your team" before sending', async () => {
    wrap(<InviteDialog open onClose={vi.fn()} members={[{ user_id: 'u2', email: 'asha@kalakar.in', display_name: null, role: 'reviewer', is_active: true }]} pending={[]} />)
    fireEvent.change(screen.getByTestId('invite-email'), { target: { value: 'asha@kalakar.in' } })
    fireEvent.click(screen.getByTestId('invite-submit'))
    await screen.findByText('This person is already on your team.')
    expect(api.createInvite).not.toHaveBeenCalled()
  })

  it('warns that a new invite replaces an open one for the same email', () => {
    wrap(<InviteDialog open onClose={vi.fn()} members={[]} pending={[invite()]} />)
    fireEvent.change(screen.getByTestId('invite-email'), { target: { value: 'asha@kalakar.in' } })
    expect(screen.getByText(/A new one replaces the old link/)).toBeTruthy()
  })

  it('tells an admin only an owner can invite an owner', () => {
    s.role = 'admin'
    wrap(<InviteDialog open onClose={vi.fn()} members={[]} pending={[]} />)
    expect(screen.getByText('Only an owner can invite an owner.')).toBeTruthy()
  })
})

describe('ResetLinkDialog', () => {
  const member = { user_id: 'u2', email: 'asha@kalakar.in', display_name: 'Asha Rao', role: 'reviewer' as const, is_active: true }

  it('makes a one-time link after the confirm', async () => {
    api.issueResetLink.mockResolvedValue({ reset_url: 'https://app.kuinn.in/reset-password#token=x', expires_at: '2026-11-09T10:00:00Z' })
    wrap(<ResetLinkDialog member={member} open onClose={vi.fn()} />)
    expect(screen.getByText('Make a reset link for Asha Rao?')).toBeTruthy()
    fireEvent.click(screen.getByTestId('reset-make'))
    await screen.findByText('Reset link ready')
    expect(api.issueResetLink).toHaveBeenCalledWith('u2')
    expect((screen.getByTestId('reset-link-url') as HTMLInputElement).value).toMatch(/reset-password#token=/)
    expect(screen.getByText(/24 hours/)).toBeTruthy()
  })

  it('an ineligible member (403) is a job for Kuinn support, with no second try', async () => {
    api.issueResetLink.mockRejectedValue(apiError(403, 'PERMISSION_DENIED'))
    wrap(<ResetLinkDialog member={member} open onClose={vi.fn()} />)
    fireEvent.click(screen.getByTestId('reset-make'))
    await screen.findByTestId('reset-refusal')
    expect(screen.getByRole('link', { name: 'support@kuinn.in' })).toBeTruthy()
    expect((screen.getByTestId('reset-make') as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('PendingInvites', () => {
  const list = (rows: ReturnType<typeof invite>[]) => ({ rows, isPending: false, isError: false, hasNextPage: false, refetch: vi.fn() })

  it('lists who, as what and until when; cancel asks first', async () => {
    api.revokeInvite.mockResolvedValue(invite({ status: 'revoked' }))
    wrap(<PendingInvites list={list([invite()])} />)
    expect(screen.getByTestId('invite-email').textContent).toBe('asha@kalakar.in')
    expect(screen.getByText(/Link works until 15 Nov, 15:30/)).toBeTruthy()
    fireEvent.click(screen.getByTestId('invite-revoke'))
    fireEvent.click(await screen.findByTestId('invite-revoke-confirm'))
    await waitFor(() => expect(api.revokeInvite).toHaveBeenCalledWith('i1'))
  })

  it('an admin cannot cancel an owner invite', () => {
    s.role = 'admin'
    wrap(<PendingInvites list={list([invite({ role: 'owner' })])} />)
    expect((screen.getByTestId('invite-revoke') as HTMLButtonElement).disabled).toBe(true)
  })

  it('says when nothing is open', () => {
    wrap(<PendingInvites list={list([])} />)
    expect(screen.getByTestId('invites-empty').textContent).toBe('No open invites.')
  })
})
