import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { Issue, Task } from '@/features/inbox/model'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, params, children, ...rest }: { to: string; params?: Record<string, string>; children: ReactNode }) => (
    <a href={Object.entries(params ?? {}).reduce((h, [k, v]) => h.replace(`$${k}`, v), to)} {...rest}>
      {children}
    </a>
  ),
  useNavigate: () => () => {},
}))
vi.mock('@/lib/auth', async (orig) => ({ ...(await orig<typeof import('@/lib/auth')>()), useSession: () => ({ tenantId: 't1' }) }))
vi.mock('@/lib/permissions', async (orig) => ({ ...(await orig<typeof import('@/lib/permissions')>()), useCan: () => () => true }))
vi.mock('@/features/inbox/dismiss-issue', () => ({ DismissIssueButton: () => <button type="button">Dismiss</button> }))

const { InboxDetail } = await import('./inbox-detail')
const { keysFor } = await import('@/lib/query-keys')
const { listingDetailQuery } = await import('@/features/listings/api')
const { accountTaskHelp, isAccountReviewTask, linkedIssues } = await import('@/features/inbox/model')

afterEach(cleanup)

const TASK = '0b1c2d3e-0000-4000-8000-000000003001'
const LISTING = '0b1c2d3e-0000-4000-8000-000000000201'
const PRODUCT = '0b1c2d3e-0000-4000-8000-000000000101'

const task = (kind: Task['kind']): Task => ({
  id: TASK,
  kind,
  status: 'open',
  question: kind === 'permission_decision' ? 'Grant the marketplace permission this listing needs.' : 'Review a marketplace error the system does not know yet.',
  reason: 'The marketplace refused a publish.',
  target_path: kind === 'permission_decision' ? 'account.category_approvals.kurta' : 'account.error_review',
  resume_from: 'publish',
  expected_answer: { kind: 'acknowledge' },
  suggestions: [],
  marketplace_account_id: '0b1c2d3e-0000-4000-8000-000000000901',
  created_at: '2026-11-07T09:00:00Z',
  updated_at: '2026-11-07T09:00:00Z',
})

const issue: Issue = {
  id: '0b1c2d3e-0000-4000-8000-000000001001',
  listing_id: LISTING,
  listing_version_id: '0b1c2d3e-0000-4000-8000-000000000202',
  marketplace: 'amazon',
  status: 'open',
  severity: 'error',
  error_code: 'MARKETPLACE_UNKNOWN_ERROR',
  error_class: 'unknown',
  field_path: 'listing',
  message: 'The marketplace refused the listing.',
  plain_message: 'Amazon refused the listing for a reason Kuinn does not know yet.',
  raw_message: 'The item_type_keyword is not valid for this product type.',
  marketplace_code: '90220',
  human_task_id: TASK,
  source: 'amazon_adapter',
  retry_class: 'user_action',
  auto_fixable: false,
  occurrences: 1,
  first_seen_at: '2026-11-07T09:00:00Z',
  last_seen_at: '2026-11-07T09:00:00Z',
  created_at: '2026-11-07T09:00:00Z',
  updated_at: '2026-11-07T09:00:00Z',
}

function show(t: Task, issues: Issue[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const keys = keysFor('t1')
  qc.setQueryData([...keys.issues.all(), 'by-task', TASK], issues)
  qc.setQueryData(listingDetailQuery(keys, LISTING).queryKey, {
    etag: '"l1"',
    data: { id: LISTING, product_id: PRODUCT, marketplace: 'amazon', status: 'failed', current_version_id: 'v1', created_at: 'x', updated_at: 'x' } as never,
  })
  const item = { kind: 'task' as const, id: t.id, at: t.created_at, task: t }
  return render(
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        <InboxDetail selectedKey={`task:${TASK}`} items={[item]} pending={false} search={{}} products={{ map: new Map(), pending: false }} />
      </TooltipProvider>
    </QueryClientProvider>,
  )
}

describe('Inbox account tasks', () => {
  it('shows what the marketplace said and real actions, with no answer controls', () => {
    show(task('marketplace_error_review'), [issue])
    expect(screen.queryByTestId('answer-soon')).toBeNull()
    expect(screen.queryAllByRole('radio')).toHaveLength(0)
    const error = screen.getByTestId('account-task-error')
    expect(error.textContent).toContain('Amazon refused the listing for a reason Kuinn does not know yet.')
    expect(error.textContent).toContain('code 90220')
    expect(error.textContent).toContain('The item_type_keyword is not valid for this product type.')
    expect(screen.getByTestId('task-open-listing').getAttribute('href')).toBe(`/listings/${LISTING}/review`)
    expect(screen.getByTestId('task-edit-product').getAttribute('href')).toBe(`/products/${PRODUCT}`)
    expect(screen.getByTestId('task-open-issue').getAttribute('href')).toBe(`/issues/${issue.id}`)
    expect(screen.getByTestId('task-regenerate')).toBeTruthy()
    // The internal target path is never shown.
    expect(screen.getByTestId('task-detail').textContent).not.toContain('account.error_review')
    expect(screen.getByTestId('task-resume').textContent).toContain('Publishing to this marketplace waits')
  })

  it('a permission task says where to ask, and offers no regenerate', () => {
    show(task('permission_decision'), [{ ...issue, error_code: 'PERMISSION_DENIED' }])
    expect(screen.getByTestId('account-task-help').textContent).toContain('Amazon Seller Central')
    expect(screen.queryByTestId('task-regenerate')).toBeNull()
    expect(screen.getByTestId('task-open-listing')).toBeTruthy()
  })

  it('says so when no open error is linked any more', () => {
    show(task('marketplace_error_review'), [])
    expect(screen.getByTestId('account-task-no-issue')).toBeTruthy()
    expect(screen.queryByTestId('task-open-listing')).toBeNull()
  })
})

describe('account task model', () => {
  it('knows the account kinds, links issues by task and writes plain help', () => {
    expect(isAccountReviewTask({ kind: 'marketplace_error_review' })).toBe(true)
    expect(isAccountReviewTask({ kind: 'missing_fact' })).toBe(false)
    const older = { ...issue, id: 'a', last_seen_at: '2026-11-06T09:00:00Z' }
    expect(linkedIssues(TASK, [older, issue, { ...issue, id: 'b', human_task_id: null }]).map((i) => i.id)).toEqual([issue.id, 'a'])
    expect(accountTaskHelp('marketplace_error_review', null)).toContain('the marketplace said')
  })
})
