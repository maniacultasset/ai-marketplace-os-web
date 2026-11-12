import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fix, history, issue } from '@/test/issue-history-fixtures'
import { issueHistoryView, type IssueHistory } from './issue-history-model'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, params, children, ...rest }: { to: string; params?: Record<string, string>; children: ReactNode }) => {
    const path = Object.entries(params ?? {}).reduce((p, [k, v]) => p.replace(`$${k}`, v), to)
    return (
      <a href={path} {...rest}>
        {children}
      </a>
    )
  },
}))

const post = vi.hoisted(() => vi.fn())
vi.mock('@/api/client', async (orig) => ({
  ...(await orig<typeof import('@/api/client')>()),
  api: { POST: (...a: unknown[]) => post(...a) },
}))
const perm = vi.hoisted(() => ({ edit: true }))
vi.mock('@/lib/permissions', async (orig) => ({
  ...(await orig<typeof import('@/lib/permissions')>()),
  useCan: () => (p: string) => (p === 'listing:edit' ? perm.edit : true),
}))
vi.mock('@/lib/auth', async (orig) => ({ ...(await orig<typeof import('@/lib/auth')>()), useSession: () => ({ tenantId: 't1' }) }))
const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('@/lib/toast', () => ({ toast: toasts, toastError: vi.fn() }))

const { IssuesAndFixesCard } = await import('./issues-and-fixes')

afterEach(cleanup)

const card = (h: IssueHistory, opts: { marketplace?: string; linkFields?: boolean } = {}) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <div style={{ width: 320 }}>
        <IssuesAndFixesCard view={issueHistoryView(h, opts.marketplace ?? 'amazon')} marketplace={opts.marketplace ?? 'amazon'} listingId="L1" linkFields={opts.linkFields} />
      </div>
    </QueryClientProvider>,
  )

describe('IssuesAndFixesCard', () => {
  it('shows the three groups with plain causes, actions and a field link', () => {
    card(
      history({
        issues: [
          issue({ id: 'a', handler: 'you', field: 'attributes.fabric_type', cause: 'Amazon needs a percentage for each fabric.', action: 'Add the percentage.' }),
          issue({ id: 'b', handler: 'marketplace', group: 'account_permission', cause: 'Amazon has not approved your account to use this brand name.', action: 'Apply in Seller Central.' }),
          issue({ id: 'c', handler: 'kuinn', lane: 'auto_repair' }),
        ],
        fixes: [fix({ issue_id: 'c', outcome: 'sent' })],
      }),
    )
    const fixed = screen.getByTestId('issues-fixed')
    expect(within(fixed).getByTestId('fix-values').textContent).toContain('navy blue')
    expect(within(fixed).getByTestId('fix-values').textContent).toContain('Navy Blue')
    expect(within(fixed).getByTestId('fix-outcome').textContent).toBe('Sent, waiting for Amazon')
    expect(within(fixed).getByTestId('fix-reason').textContent).toMatch(/its own list/)
    expect(within(fixed).queryAllByTestId('issue-line')).toHaveLength(0) // the fixed row shows once

    const you = screen.getByTestId('issues-needs-you')
    expect(within(you).getByTestId('issue-cause').textContent).toBe('Amazon needs a percentage for each fabric.')
    expect(within(you).getByTestId('issue-action').textContent).toBe('Add the percentage.')
    expect(within(you).getByTestId('issue-field-link').getAttribute('href')).toBe('/listings/L1/review')

    const mp = screen.getByTestId('issues-marketplace')
    expect(within(mp).getByRole('heading').textContent).toContain("On Amazon's side")
    expect(within(mp).getByText('Account approval')).toBeTruthy()
    expect(within(mp).getByTestId('issue-action').textContent).toBe('Apply in Seller Central.')
    expect(screen.queryByTestId('issues-team')).toBeNull()
    expect(within(fixed).getByRole('heading').textContent).toContain("Kuinn's fixes")
    expect(screen.queryByTestId('issues-fixing')).toBeNull()
    expect(screen.getByTestId('issues-summary').textContent).toBe("1 needs you · 1 on Amazon's side · 1 Kuinn fix not confirmed yet.")
  })

  it('keeps the marketplace code and words behind a toggle', async () => {
    card(history({ issues: [issue({ marketplace_code: '18280', marketplace_message: 'fabric_type must include a percentage.' })] }))
    const details = screen.getByTestId('issue-details')
    expect(details.closest('[data-state]')?.getAttribute('data-state')).toBe('closed')
    await userEvent.click(screen.getByTestId('issue-details-toggle'))
    expect(details.closest('[data-state]')?.getAttribute('data-state')).toBe('open')
    expect(details.textContent).toContain('18280')
    expect(details.textContent).toContain('fabric_type must include a percentage.')
    expect(details.textContent).toContain('navy blue')
  })

  it('on the review the field is not a link', () => {
    card(history({ issues: [issue()] }), { linkFields: false })
    expect(screen.queryByTestId('issue-field-link')).toBeNull()
  })

  it('shows 3 lines, then the rest on demand', async () => {
    card(history({ issues: Array.from({ length: 5 }, (_, n) => issue({ id: `i${n}` })) }))
    const you = screen.getByTestId('issues-needs-you')
    expect(within(you).getAllByTestId('issue-line')).toHaveLength(3)
    await userEvent.click(screen.getByTestId('issues-needs-you-more'))
    expect(within(you).getAllByTestId('issue-line')).toHaveLength(5)
  })

  it("names Kuinn's own work and its team's checks without calling them fixed", () => {
    card(
      history({
        issues: [issue({ id: 'k', handler: 'kuinn', lane: 'retry' }), issue({ id: 's', handler: 'staff', group: 'unknown', cause: 'Kuinn does not know this marketplace message yet.' })],
      }),
      { marketplace: 'flipkart' },
    )
    const fixing = screen.getByTestId('issues-fixing')
    expect(within(fixing).getByRole('heading').textContent).toContain('Kuinn is fixing')
    expect(within(fixing).getByText('Kuinn is working on this.')).toBeTruthy()
    expect(screen.queryByTestId('issues-fixed')).toBeNull() // open work is never listed as a fix
    expect(within(screen.getByTestId('issues-team')).getByText('Not known yet')).toBeTruthy()
  })

  it('a refused fix says so on its line and in the summary', () => {
    card(history({ issues: [issue({ id: 'c', handler: 'kuinn', lane: 'auto_repair' })], fixes: [fix({ issue_id: 'c', outcome: 'refused' })] }))
    const fixed = screen.getByTestId('issues-fixed')
    expect(within(fixed).getByTestId('fix-outcome').textContent).toBe('Amazon refused it again')
    expect(screen.queryByTestId('issues-fixing')).toBeNull()
    expect(screen.getByTestId('issues-summary').textContent).toBe('1 Kuinn fix refused.')
  })

  it('history is closed until asked, oldest try first', async () => {
    card(
      history({
        issues: [issue({ id: 'i1' })],
        attempts: [
          { kind: 'submission', number: 1, version: 1, at: '2026-11-11T10:00:00Z', actor: 'user', outcome: 'rejected', issue_ids: ['i1'], fix_ids: [] },
          { kind: 'precheck', number: 0, version: 1, at: '2026-11-11T09:00:00Z', actor: 'system', outcome: 'clean', issue_ids: [], fix_ids: [] },
        ],
      }),
    )
    const toggle = screen.getByTestId('issues-history-toggle')
    expect(toggle.textContent).toContain('2 tries')
    await userEvent.click(toggle)
    const steps = within(screen.getByTestId('issues-history')).getAllByTestId('issues-history-step')
    expect(steps.map((s) => s.textContent?.split('Version')[0])).toEqual(['Pre-checkPassed', 'Sent 1Refused'])
    expect(steps[1]!.textContent).toContain('(90244)')
  })
})

describe('suggested fixes (client item 20)', () => {
  const suggested = () =>
    history({
      issues: [issue({ id: 'i1', handler: 'you', lane: 'seller', field: 'attributes.color' })],
      fixes: [fix({ id: 's1', issue_id: 'i1', suggested: true, before: 'navy blue', after: 'Navy Blue' })],
    })

  it('shows each suggestion with before and after, and applies them on the seller’s go', async () => {
    post.mockResolvedValue({ data: { released: 1, job_id: 'j1' }, response: new Response(null, { status: 200 }) })
    card(suggested())
    const group = screen.getByTestId('issues-suggested')
    expect(within(group).getByText('Kuinn suggests')).toBeTruthy()
    expect(within(group).getByTestId('fix-values').textContent).toContain('Navy Blue')
    expect(within(group).getByTestId('fix-outcome').textContent).toBe('Waits for you')
    expect(screen.queryByTestId('issues-needs-you')).toBeNull()
    expect(screen.queryByTestId('issues-fixed')).toBeNull()
    await userEvent.click(within(group).getByRole('button', { name: 'Apply fix' }))
    await waitFor(() => expect(post).toHaveBeenCalledWith('/listings/{listing_id}/fixes/apply', { params: { path: { listing_id: 'L1' } } }))
    await waitFor(() => expect(toasts.success).toHaveBeenCalledWith('Fix applied', expect.anything()))
  })

  it('offers "Apply fix" for a suggested content fix that has no value to show yet', async () => {
    post.mockResolvedValue({ data: { released: 0, job_id: 'j2' }, response: new Response(null, { status: 200 }) })
    card(history({ issues: [issue({ id: 'i9', field: 'content.title', handler: 'you', lane: 'seller', suggested: true })] }))
    const group = screen.getByTestId('issues-suggested')
    expect(within(group).getByText(/Kuinn rewrites this text when you apply/)).toBeTruthy()
    expect(screen.queryByTestId('issues-needs-you')).toBeNull()
    expect(screen.queryByTestId('issues-team')).toBeNull()
    await userEvent.click(within(group).getByRole('button', { name: 'Apply fix' }))
    await waitFor(() => expect(post).toHaveBeenCalledWith('/listings/{listing_id}/fixes/apply', { params: { path: { listing_id: 'L1' } } }))
  })

  it('tells a role that cannot edit listings who can apply them', () => {
    perm.edit = false
    card(suggested())
    expect(screen.queryByTestId('apply-fixes')).toBeNull()
    expect(screen.getByText('An owner or operator can apply these fixes.')).toBeTruthy()
    perm.edit = true
  })
})
