/** G1: the right pane opens a group, and a member of a group with a way back to it. */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { Issue } from '@/features/inbox/model'
import type { InboxGroup } from '@/features/inbox-groups/model'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, search, ...rest }: { to: string; children: ReactNode; search?: { item?: string } }) => (
    <a href={`${to}?item=${search?.item ?? ''}`} {...rest}>
      {children}
    </a>
  ),
}))
vi.mock('@/lib/auth', async (orig) => ({ ...(await orig<object>()), useSession: () => ({ tenantId: 't1' }) }))
vi.mock('@/lib/permissions', async (orig) => ({ ...(await orig<object>()), useCan: () => () => true }))
vi.mock('@/features/inbox/dismiss-issue', () => ({ DismissIssueButton: () => <button type="button">Dismiss</button> }))
vi.mock('@/features/listings/api', async (orig) => ({ ...(await orig<object>()), useListing: () => ({ data: undefined }) }))
vi.mock('@/features/listing-flow/api', async (orig) => ({ ...(await orig<object>()), useListingResolution: () => ({ data: undefined }) }))
vi.mock('@/features/team-account/approver', async (orig) => ({ ...(await orig<object>()), useOwnerMayApproveOwn: () => false }))
vi.mock('@/features/inbox-groups/group-detail', () => ({
  GroupDetail: ({ group }: { group: InboxGroup }) => <div data-testid="group-detail-stub">{group.key}</div>,
}))
vi.mock('@/api/client', async (orig) => ({ ...(await orig<object>()), api: { GET: () => Promise.reject(new Error('no reads in this test')) } }))

const { InboxDetail } = await import('./inbox-detail')

afterEach(cleanup)

const AT = '2026-11-15T09:00:00Z'
const U = (n: number) => `0b1c2d3e-0000-4000-8000-${String(n).padStart(12, '0')}`
const issue = (i: number): Issue =>
  ({
    id: U(3000 + i),
    listing_id: U(200 + i),
    listing_version_id: U(400 + i),
    product_id: U(100 + i),
    marketplace: 'amazon',
    status: 'open',
    severity: 'error',
    error_code: 'REQUIRED_FIELD_MISSING',
    error_class: 'content_error',
    field_path: 'attributes.color',
    message: 'Colour is missing.',
    source: 'rules_engine',
    retry_class: 'user_action',
    auto_fixable: false,
    occurrences: 1,
    first_seen_at: AT,
    last_seen_at: AT,
    created_at: AT,
    updated_at: AT,
  }) as Issue

const group: InboxGroup = {
  key: 'i|REQUIRED_FIELD_MISSING|attributes.color|amazon|error',
  item_kind: 'issue',
  scope: 'per_item',
  count: 2,
  products: 2,
  listings: 2,
  blocking: true,
  at: AT,
  field: 'attributes.color',
  error_code: 'REQUIRED_FIELD_MISSING',
  marketplace: 'amazon',
  categories: [],
  brand_value_set: false,
  members: [1, 2].map((i) => ({ issue_id: U(3000 + i), product_id: U(100 + i), sku: `KTEST-${i}`, title: `Kurta ${i}`, listing_ids: [U(200 + i)], has_value: false, at: AT })),
  members_more: false,
}

function show(selectedKey: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const loaded = [issue(1)].map((x) => ({ kind: 'issue' as const, id: x.id, at: x.last_seen_at, issue: x }))
  const members = new Map(group.members.map((m) => [`issue:${m.issue_id}`, { group, member: m }]))
  return render(
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        <InboxDetail
          selectedKey={selectedKey}
          items={[]}
          pending={false}
          search={{}}
          products={{ map: new Map(), pending: false }}
          grouped={{ groups: [group], members, loaded }}
        />
      </TooltipProvider>
    </QueryClientProvider>,
  )
}

describe('Inbox detail, grouped', () => {
  it('a group key opens the group pane', () => {
    show(`group:${group.key}`)
    expect(screen.getByTestId('group-detail-stub').textContent).toBe(group.key)
  })
  it('a member opens as its own issue, with a way back to the group', () => {
    show(`issue:${U(3001)}`)
    expect(screen.getByTestId('issue-pane').getAttribute('data-issue-id')).toBe(U(3001))
    const back = screen.getByTestId('member-back')
    expect(back.textContent).toBe('2 listings: Required field missing')
    expect(back.getAttribute('href')).toBe(`/inbox?item=group:${group.key}`)
  })
  it('a group no longer listed says it is done', () => {
    show('group:t|gone|x|y')
    expect(screen.getByTestId('inbox-detail-missing').textContent).toContain('Nothing left in this group')
  })
})
