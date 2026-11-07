import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { Issue } from '@/features/inbox/model'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...rest }: { to: string; children: ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}))
// Every right, so a hidden control is hidden by the issue's state, not by the role.
vi.mock('@/lib/permissions', () => ({ useCan: () => () => true }))
vi.mock('@/features/inbox/dismiss-issue', () => ({ DismissIssueButton: () => <button type="button">Dismiss</button> }))

const { InboxDetail } = await import('./inbox-detail')

afterEach(cleanup)

const ID = '0b1c2d3e-0000-4000-8000-000000001001'
const base: Issue = {
  id: ID,
  listing_id: '0b1c2d3e-0000-4000-8000-000000000201',
  listing_version_id: '0b1c2d3e-0000-4000-8000-000000000202',
  marketplace: 'amazon',
  status: 'open',
  severity: 'warning',
  error_code: 'FIELD_TOO_LONG',
  error_class: 'content_error',
  field_path: 'content.title',
  message: 'Title is 212 characters; the limit is 200.',
  suggestion: 'Shorten the title.',
  source: 'rules_engine',
  retry_class: 'user_action',
  auto_fixable: true,
  occurrences: 1,
  first_seen_at: '2026-11-07T09:00:00Z',
  last_seen_at: '2026-11-07T09:00:00Z',
  created_at: '2026-11-07T09:00:00Z',
  updated_at: '2026-11-07T09:00:01Z',
}

function show(issue: Issue) {
  const item = { kind: 'issue' as const, id: issue.id, at: issue.last_seen_at, issue }
  return render(
    <TooltipProvider>
      <InboxDetail selectedKey={`issue:${ID}`} items={[item]} pending={false} search={{}} products={{ map: new Map(), pending: false }} />
    </TooltipProvider>,
  )
}

describe('Inbox issue pane', () => {
  it('shows an auto-fixed issue as resolved, with what Kuinn changed', () => {
    show({
      ...base,
      status: 'auto_fixed',
      resolution: 'deterministic_fix',
      resolved_at: '2026-11-07T09:00:01Z',
      action_taken: 'Shortened the title at a word boundary from 212 to 198 characters to fit the 200-character limit.',
    })
    const pane = screen.getByTestId('issue-pane')
    expect(pane.textContent).toContain('Auto-fixed')
    expect(pane.textContent).not.toContain('Needs you')
    expect(screen.getByTestId('issue-fix-change').textContent).toContain('Shortened the title at a word boundary')
    expect(pane.textContent).toContain('Nothing is needed from you.')
    expect(pane.textContent).toContain('Nothing. Kuinn fixed this on its own.')
    // No work is offered for a fixed issue.
    expect(pane.textContent).not.toContain('Suggested fix')
    expect(pane.textContent).not.toContain('Needs a person')
    expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull()
    expect(pane.textContent).not.toContain('Rewritten by the agent')
  })

  it('labels an AI rewrite of the field', () => {
    show({ ...base, status: 'auto_fixed', resolution: 'ai_correction', resolved_at: '2026-11-07T09:00:01Z', action_taken: 'Rewrote the title to fit.' })
    expect(screen.getByTestId('issue-fix-trail').textContent).toContain('Rewritten by the agent')
  })

  it('keeps an open warning as work for a person', () => {
    show(base)
    const pane = screen.getByTestId('issue-pane')
    expect(screen.queryByTestId('issue-fix-trail')).toBeNull()
    expect(pane.textContent).toContain('Suggested fix')
    expect(pane.textContent).toContain('Needs a person')
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeTruthy()
  })
})
