/**
 * G1 (prod bulk test 15 Nov, 34 KTEST products): the Inbox listed "Add the manufacturer on the
 * product." 34 times. With the groups switch on, identical items show as one card; a group of one
 * is the item itself; the header and tab counts stay the summary's (B16, B28). Off, or for a
 * closed status, the Inbox lists exactly as before.
 */
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { summary as summaryBody } from '@/test/home-summary'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...rest }: { to: string; children: ReactNode; 'data-testid'?: string; 'data-item'?: string }) => (
    <a data-testid={rest['data-testid']} data-item={rest['data-item']}>
      {children}
    </a>
  ),
  useNavigate: () => vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ useSession: () => ({ tenantId: 'tn' }) }))
vi.mock('@/lib/permissions', () => ({ useCan: () => () => true }))
vi.mock('@/features/home-inbox/inbox-detail', () => ({ InboxDetail: () => null }))

const AT = '2026-11-15T09:00:00Z'
const U = (n: number) => `0b1c2d3e-0000-4000-8000-${String(n).padStart(12, '0')}`
const task = (i: number, over: Record<string, unknown> = {}) => ({
  id: U(1000 + i),
  kind: 'missing_fact',
  status: 'open',
  product_id: U(100 + i),
  target_path: 'facts.manufacturer',
  question: 'Add the manufacturer on the product.',
  expected_answer: { kind: 'text' },
  suggestions: [],
  blocking: true,
  resume_from: 'generate',
  created_at: AT,
  updated_at: AT,
  ...over,
})
const member = (i: number) => ({ task_id: U(1000 + i), product_id: U(100 + i), sku: `KTEST-${i}`, title: `Kurta ${i}`, listing_ids: [U(200 + i)], has_value: false, at: AT })

const server = vi.hoisted(() => ({
  enabled: true,
  groupsCalls: [] as string[],
  inbox: { open_items: 35, questions: 35, blocking_questions: 35, issues: 0, issues_without_question: 0 },
}))

function groupsBody(view: string) {
  const manufacturer = {
    key: 't|missing_fact|facts.manufacturer|cae91fb30742',
    item_kind: 'task',
    scope: 'brand',
    count: 34,
    products: 34,
    listings: 68,
    blocking: true,
    at: AT,
    field: 'manufacturer',
    task_kind: 'missing_fact',
    answer: { kind: 'text' },
    categories: ['kurta_sets'],
    brand_value_set: false,
    sample_task: task(1),
    members: Array.from({ length: 34 }, (_, i) => member(i + 1)),
    members_more: false,
  }
  const single = {
    ...manufacturer,
    key: 't|missing_fact|facts.gender|503f4d45ede0',
    scope: 'product_fact',
    count: 1,
    products: 1,
    listings: 2,
    field: 'gender',
    sample_task: task(99, { target_path: 'facts.gender', question: 'Add the gender on the product.' }),
    members: [member(99)],
  }
  return server.enabled
    ? { enabled: true, as_of: AT, view, total_items: 35, groups: [manufacturer, single], more: false }
    : { enabled: false, as_of: AT, view, total_items: 0, groups: [], more: false }
}

vi.mock('@/api/client', () => ({
  api: {
    GET: async (path: string, init?: { params?: { query?: { view?: string } } }) => {
      const page = { next_cursor: null, has_more: false, limit: 50 }
      if (path === '/tasks') return { data: { data: Array.from({ length: 34 }, (_, i) => task(i + 1)).concat([task(99, { target_path: 'facts.gender', question: 'Add the gender on the product.' })]), page }, response: new Response() }
      if (path === '/issues') return { data: { data: [], page }, response: new Response() }
      if (path === '/home/summary') return { data: summaryBody({ inbox: { ...server.inbox } }), response: new Response() }
      if (path === '/inbox/groups') {
        const view = init?.params?.query?.view ?? 'all'
        server.groupsCalls.push(view)
        return { data: groupsBody(view), response: new Response() }
      }
      if (path === '/products/{product_id}') return { data: { sku: 'KTEST-X', title: 'Kurta', image_details: [], images: [] }, response: new Response() }
      throw new Error(`unexpected GET ${path}`)
    },
  },
  unwrap: async (p: Promise<{ data: unknown }>) => (await p).data,
}))

const { createQueryClient } = await import('@/lib/query-client')
const { InboxPage } = await import('./inbox-page')

let qc: QueryClient
beforeEach(() => {
  qc = createQueryClient()
  server.enabled = true
  server.groupsCalls = []
})
afterEach(() => {
  cleanup()
  qc.clear()
})

const app = (search = {}) =>
  render(
    <QueryClientProvider client={qc}>
      <InboxPage search={search} onSearch={() => {}} />
    </QueryClientProvider>,
  )

describe('Inbox groups (G1)', () => {
  it('switch on: one card for 34 products, a group of one as its item, the counts unchanged', async () => {
    app()
    const card = await screen.findByTestId('inbox-group')
    expect(card.querySelector('[data-testid="inbox-group-title"]')!.textContent).toBe('34 products need a manufacturer')
    expect(card.querySelector('[data-testid="inbox-group-meta"]')!.textContent).toBe('Blocks 68 listings')
    expect(card.getAttribute('data-item')).toBe('group:t|missing_fact|facts.manufacturer|cae91fb30742')
    const items = screen.getAllByTestId('inbox-item')
    expect(items).toHaveLength(1)
    expect(items[0]!.textContent).toContain('Add the gender on the product.')
    expect(items[0]!.getAttribute('data-item')).toBe(`task:${U(1099)}`)
    // The header counts the items (35), never the cards (2).
    await waitFor(() => expect(screen.getByTestId('inbox-open-count').textContent).toBe('35 open'))
  })

  it('switch off: the Inbox lists every item as before', async () => {
    server.enabled = false
    app()
    await waitFor(() => expect(screen.getAllByTestId('inbox-item')).toHaveLength(35))
    expect(screen.queryByTestId('inbox-group')).toBeNull()
    expect(screen.getByTestId('inbox-open-count').textContent).toBe('35 open')
  })

  it('a closed status filter keeps the old list and never reads the groups', async () => {
    app({ view: 'questions', tasks: 'answered' })
    await waitFor(() => expect(screen.getAllByTestId('inbox-item')).toHaveLength(35))
    expect(screen.queryByTestId('inbox-group')).toBeNull()
    expect(server.groupsCalls).toEqual([])
  })

  it('reads the groups of the shown view', async () => {
    app({ view: 'questions' })
    await screen.findByTestId('inbox-group')
    expect(server.groupsCalls).toEqual(['questions'])
  })
})
