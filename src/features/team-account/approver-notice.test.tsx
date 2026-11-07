import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, search, children, ...rest }: { to: string; search?: Record<string, string>; children: ReactNode }) => (
    <a href={search ? `${to}?${new URLSearchParams(search).toString()}` : to} {...rest}>
      {children}
    </a>
  ),
}))

const state = vi.hoisted(() => ({
  role: 'owner' as 'owner' | 'operator',
  members: [] as { user_id: string; role: string; is_active: boolean }[],
  more: false,
}))
const ME = '00000000-0000-4000-8000-000000000001'
vi.mock('@/lib/auth', () => ({ useMe: () => ({ data: { user_id: ME }, isError: false }) }))
vi.mock('@/lib/permissions', () => ({ useCan: () => (a: string) => a !== 'team:manage' || state.role === 'owner' }))
vi.mock('./use-members', () => ({
  useMembersList: () => ({ rows: state.members, isPending: false, isError: false, data: {}, hasNextPage: state.more }),
}))

const { ApproverNotice } = await import('./approver-notice')

afterEach(cleanup)

describe('ApproverNotice', () => {
  it('tells a solo owner someone else must approve, and opens the invite (no support email)', () => {
    state.role = 'owner'
    state.members = [{ user_id: ME, role: 'owner', is_active: true }]
    render(<ApproverNotice />)
    expect(screen.getByText('Someone else must approve')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Invite a teammate' }).getAttribute('href')).toBe('/team?invite=1')
    expect(screen.queryByRole('link', { name: 'support@kuinn.in' })).toBeNull()
  })

  it('says nothing when a reviewer or second owner exists', () => {
    state.role = 'owner'
    state.members = [
      { user_id: ME, role: 'owner', is_active: true },
      { user_id: 'r1', role: 'reviewer', is_active: true },
    ]
    const view = render(<ApproverNotice />)
    expect(view.container.textContent).toBe('')
  })

  it('says nothing to someone who cannot read the team (an operator always has an owner)', () => {
    state.role = 'operator'
    state.members = []
    const view = render(<ApproverNotice />)
    expect(view.container.textContent).toBe('')
  })

  it('never guesses "alone" while more member pages are unread', () => {
    state.role = 'owner'
    state.members = [{ user_id: ME, role: 'owner', is_active: true }]
    state.more = true
    const view = render(<ApproverNotice />)
    expect(view.container.textContent).toBe('')
    state.more = false
  })
})
