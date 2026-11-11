import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, search, hash, children, ...rest }: { to: string; search?: Record<string, string>; hash?: string; children: ReactNode }) => (
    <a href={`${to}${search ? `?${new URLSearchParams(search).toString()}` : ''}${hash ? `#${hash}` : ''}`} {...rest}>
      {children}
    </a>
  ),
}))

const state = vi.hoisted(() => ({
  role: 'owner' as 'owner' | 'admin' | 'operator',
  members: [] as { user_id: string; role: string; is_active: boolean }[],
  more: false,
  /** TenantOut.owner_self_approval; undefined while the brand is unread. */
  selfApproval: false as boolean | undefined,
}))
const ME = '00000000-0000-4000-8000-000000000001'
vi.mock('@/lib/auth', () => ({ useMe: () => ({ data: { user_id: ME, role: state.role }, isError: false }) }))
vi.mock('@/lib/permissions', () => ({ useCan: () => (a: string) => a !== 'team:manage' || state.role === 'owner' || state.role === 'admin' }))
vi.mock('./use-members', () => ({
  useMembersList: () => ({ rows: state.members, isPending: false, isError: false, data: {}, hasNextPage: state.more }),
}))
vi.mock('@/features/brand/api', () => ({
  useBrandProfile: () =>
    state.selfApproval === undefined
      ? { data: undefined, isPending: true, isError: false }
      : { data: { data: { owner_self_approval: state.selfApproval }, etag: '"v1"' }, isPending: false, isError: false },
}))

const { ApprovalRule, ApproverNotice, SelfApprovalNote } = await import('./approver-notice')

const solo = () => [{ user_id: ME, role: state.role, is_active: true }]

afterEach(() => {
  cleanup()
  state.role = 'owner'
  state.members = []
  state.more = false
  state.selfApproval = false
})

describe('ApproverNotice', () => {
  it('tells a solo owner two-person approval is on, with both ways forward (no support email)', () => {
    state.members = solo()
    render(<ApproverNotice />)
    expect(screen.getByText('Two-person approval is on')).toBeTruthy()
    expect(screen.getByTestId('approver-notice').textContent).toMatch(/can’t approve it.*turn on owner approval.*invite a reviewer/i)
    expect(screen.getByRole('link', { name: 'Turn on owner approval' }).getAttribute('href')).toBe('/settings#owner-approval')
    expect(screen.getByRole('link', { name: 'Invite a reviewer' }).getAttribute('href')).toBe('/team?invite=1&role=reviewer')
    expect(screen.queryByText('Someone else must approve')).toBeNull()
    expect(screen.queryByRole('link', { name: 'support@kuinn.in' })).toBeNull()
  })

  it('says nothing to a solo owner once owner approval is on', () => {
    state.members = solo()
    state.selfApproval = true
    const view = render(<ApproverNotice />)
    expect(view.container.textContent).toBe('')
  })

  it('waits for the brand read before offering the setting', () => {
    state.members = solo()
    state.selfApproval = undefined
    const view = render(<ApproverNotice />)
    expect(view.container.textContent).toBe('')
  })

  it('keeps "Someone else must approve" for anyone but an owner, even with owner approval on', () => {
    state.role = 'admin'
    state.members = solo()
    state.selfApproval = true
    render(<ApproverNotice />)
    expect(screen.getByText('Someone else must approve')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Invite a teammate' }).getAttribute('href')).toBe('/team?invite=1')
    expect(screen.queryByRole('link', { name: 'Turn on owner approval' })).toBeNull()
  })

  it('renders the state Review passes from the server (no_other_approver and owner_can_enable)', () => {
    render(<ApproverNotice state="alone" />)
    expect(screen.getByText('Someone else must approve')).toBeTruthy()
    cleanup()
    render(<ApproverNotice state="owner_alone" />)
    expect(screen.getByText('Two-person approval is on')).toBeTruthy()
    expect(screen.getByTestId('owner-approval-enable')).toBeTruthy()
    expect(screen.getByTestId('approver-invite')).toBeTruthy()
  })

  it('says nothing when a reviewer or second owner exists', () => {
    state.members = [
      { user_id: ME, role: 'owner', is_active: true },
      { user_id: 'r1', role: 'reviewer', is_active: true },
    ]
    const view = render(<ApproverNotice />)
    expect(view.container.textContent).toBe('')
  })

  it('says nothing to someone who cannot read the team (an operator always has an owner)', () => {
    state.role = 'operator'
    const view = render(<ApproverNotice />)
    expect(view.container.textContent).toBe('')
  })

  it('never guesses "alone" while more member pages are unread', () => {
    state.members = solo()
    state.more = true
    const view = render(<ApproverNotice />)
    expect(view.container.textContent).toBe('')
  })
})

describe('ApprovalRule (setup)', () => {
  const team = () => [
    { user_id: ME, role: 'owner', is_active: true },
    { user_id: 'r1', role: 'reviewer', is_active: true },
  ]

  it('explains the rule in one line, with the setting linked for an owner', () => {
    state.members = team()
    render(<ApprovalRule />)
    expect(screen.getByTestId('approval-rule').textContent).toMatch(/^Two-person approval is on: .* can turn on owner approval in Settings\.$/)
    expect(screen.getByTestId('approval-rule-link').getAttribute('href')).toBe('/settings#owner-approval')
  })

  it('names Settings without a link for anyone but an owner', () => {
    state.role = 'operator'
    render(<ApprovalRule />)
    expect(screen.getByTestId('approval-rule').textContent).toContain('turn on owner approval in Settings')
    expect(screen.queryByTestId('approval-rule-link')).toBeNull()
  })

  it('says owner approval is on only when the brand says so', () => {
    state.members = team()
    state.selfApproval = true
    render(<ApprovalRule />)
    expect(screen.getByTestId('approval-rule').textContent).toMatch(/^Owner approval is on/)
  })

  it('shows the notice instead when the rule blocks this owner', () => {
    state.members = solo()
    render(<ApprovalRule />)
    expect(screen.getByText('Two-person approval is on')).toBeTruthy()
    expect(screen.queryByTestId('approval-rule')).toBeNull()
  })
})

describe('SelfApprovalNote', () => {
  it('shows only when the server says the approval is a self-approval and Approve is offered', () => {
    render(<SelfApprovalNote selfApproval enabled />)
    expect(screen.getByTestId('self-approval-note').textContent).toBe('You’re approving your own work. This is recorded.')
    cleanup()
    for (const [selfApproval, enabled] of [
      [false, true],
      [null, true],
      [undefined, true],
      [true, false],
    ] as const) {
      const view = render(<SelfApprovalNote selfApproval={selfApproval} enabled={enabled} />)
      expect(view.container.textContent).toBe('')
      cleanup()
    }
  })
})
