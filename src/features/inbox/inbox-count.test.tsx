/**
 * B28 (prod 15 Nov, after a bulk draft of 34 products): the Inbox said "312 open items: 130
 * questions, 182 issues without a question" while the sidebar badge said "99+", then "50+", then
 * "74+". The badge counted the first pages of 50 until the summary answered. Now the badge and the
 * Inbox header read the one summary entry, at any volume, and re-read it after issues or tasks change.
 */
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { summary as summaryBody } from '@/test/home-summary'

type LinkArgs = { to: string; children: ReactNode }
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children }: LinkArgs) => <a href={to}>{children}</a>,
  useNavigate: () => vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ useSession: () => ({ tenantId: 'tn' }) }))
vi.mock('@/lib/permissions', () => ({ useCan: () => () => true }))
// The right pane is not under test; it reads many other endpoints.
vi.mock('@/features/home-inbox/inbox-detail', () => ({ InboxDetail: () => null }))

const PAGE = 50
const AT = '2026-11-15T09:00:00Z'
const tasks = Array.from({ length: PAGE }, (_, i) => ({
  id: `t${i}`,
  kind: 'missing_fact',
  status: 'open',
  product_id: null,
  payload: {},
  created_at: AT,
}))
// 26 issues a listed question stands for, 24 on their own: the first pages say "74+".
const issues = Array.from({ length: PAGE }, (_, i) => ({
  id: `i${i}`,
  listing_id: `l${i}`,
  human_task_id: i < 26 ? `t${i}` : null,
  status: 'open',
  severity: 'error',
  source: 'schema',
  error_code: 'MISSING_REQUIRED_FIELD',
  message: 'A field is missing.',
  marketplace: 'amazon',
  created_at: AT,
  last_seen_at: AT,
}))

const server = vi.hoisted(() => ({
  inbox: { open_items: 312, questions: 130, blocking_questions: 90, issues: 230, issues_without_question: 182 },
  summaryCalls: 0,
  /** While set, GET /home/summary waits on it (the summary has not answered yet). */
  hold: null as Promise<void> | null,
  /** Each summary read's abort signal, in call order. */
  signals: [] as (AbortSignal | undefined)[],
  /** Low volume: the open lists' only page (`has_more` false) instead of the first pages of 50. */
  small: null as { tasks: unknown[]; issues: unknown[] } | null,
}))

vi.mock('@/api/client', () => ({
  api: {
    GET: async (path: string, init?: { signal?: AbortSignal }) => {
      const page = server.small ? { next_cursor: null, has_more: false, limit: PAGE } : { next_cursor: 'c2', has_more: true, limit: PAGE }
      if (path === '/tasks') return { data: { data: server.small?.tasks ?? tasks, page }, response: new Response() }
      if (path === '/issues') return { data: { data: server.small?.issues ?? issues, page }, response: new Response() }
      if (path === '/home/summary') {
        server.summaryCalls++
        server.signals.push(init?.signal)
        // the snapshot is the server's state when the read starts, however long it then takes
        const inbox = { ...server.inbox }
        if (server.hold) await server.hold
        return { data: summaryBody({ inbox }), response: new Response() }
      }
      throw new Error(`unexpected GET ${path}`)
    },
  },
  unwrap: async (p: Promise<{ data: unknown }>) => (await p).data,
}))

const { createQueryClient } = await import('@/lib/query-client')
const { keysFor } = await import('@/lib/query-keys')
const { homeSummaryKey } = await import('./api')
const { useInboxBadgeLabel } = await import('./use-inbox-badge')
const { InboxNavBadge } = await import('./inbox-nav-badge')
const { InboxPage } = await import('@/features/home-inbox/inbox-page')
const { summaryKeyFor } = await import('@/lib/query-client')
const { HOME_BUSY_CAP_MS, summaryChangeClock, summaryRefreshMs } = await import('@/features/home-inbox/api')

function Badge() {
  return <InboxNavBadge label={useInboxBadgeLabel()} />
}

let qc: QueryClient
beforeEach(() => {
  qc = createQueryClient()
  server.summaryCalls = 0
  server.hold = null
  server.signals = []
  server.small = null
  server.inbox = { open_items: 312, questions: 130, blocking_questions: 90, issues: 230, issues_without_question: 182 }
})
afterEach(() => {
  cleanup()
  qc.clear()
})

const app = (inbox: boolean) =>
  render(
    <QueryClientProvider client={qc}>
      <Badge />
      {inbox ? <InboxPage search={{}} onSearch={() => {}} /> : null}
    </QueryClientProvider>,
  )

const badge = () => screen.queryByTestId('inbox-nav-badge')?.textContent ?? null

describe('one Inbox count at any volume (B28)', () => {
  it('the badge and the Inbox header agree with 312 open items behind pages of 50', async () => {
    app(true)
    await waitFor(() => expect(screen.getByTestId('inbox-counts-caption').textContent).toBe('312 open items: 130 questions, 182 issues without a question'))
    expect(screen.getByTestId('inbox-open-count').textContent).toBe('312 open')
    expect(badge()).toBe('99+')
  })

  it('never shows a count from the first pages while the summary has not answered', async () => {
    let release!: () => void
    server.hold = new Promise<void>((r) => (release = r))
    app(true)
    // the lists have answered (their rows are on screen), the summary has not
    await waitFor(() => expect(screen.getAllByRole('listitem').length).toBeGreaterThan(10))
    expect(badge()).toBeNull()
    expect(screen.queryByTestId('inbox-counts-caption')).toBeNull()
    expect(screen.getByTestId('inbox-open-count').textContent).toBe('')
    expect(document.body.textContent).not.toMatch(/\b(50|74)\+/)
    await act(async () => release())
    await waitFor(() => expect(badge()).toBe('99+'))
    expect(screen.getByTestId('inbox-counts-caption').textContent).toMatch(/^312 open items/)
  })

  it('the badge reads the summary on any page, without the Inbox lists', async () => {
    server.inbox = { open_items: 74, questions: 50, blocking_questions: 20, issues: 50, issues_without_question: 24 }
    app(false)
    await waitFor(() => expect(badge()).toBe('74'))
  })

  it('a task or issue invalidation from any screen re-reads the counts (a bulk draft landing)', async () => {
    server.inbox = { open_items: 40, questions: 30, blocking_questions: 10, issues: 15, issues_without_question: 10 }
    app(false)
    await waitFor(() => expect(badge()).toBe('40'))
    const before = server.summaryCalls
    server.inbox = { open_items: 120, questions: 70, blocking_questions: 30, issues: 80, issues_without_question: 50 }
    await act(async () => {
      // two invalidations in one tick, as a listing action makes: one summary read
      void qc.invalidateQueries({ queryKey: keysFor('tn').issues.all() })
      void qc.invalidateQueries({ queryKey: keysFor('tn').tasks.all() })
    })
    await waitFor(() => expect(badge()).toBe('99+'))
    expect(server.summaryCalls).toBe(before + 1)
  })
})

describe('summary refresh and key', () => {
  it('summaryKeyFor maps issues and tasks keys to the summary key, nothing else', () => {
    const k = keysFor('tn')
    expect(summaryKeyFor(k.issues.all())).toEqual(homeSummaryKey(k))
    expect(summaryKeyFor(k.tasks.list('open'))).toEqual(homeSummaryKey(k))
    expect(summaryKeyFor(k.products.all())).toBeNull()
    expect(summaryKeyFor(k.all())).toBeNull()
    expect(summaryKeyFor(undefined)).toBeNull()
  })

  const idle = summaryBody({ listings: { ...summaryBody().listings, in_progress: 0 }, activity: [] })
  const pending = (kind: 'write' | 'send' | 'photo_check' | 'import') => ({ ...summaryBody().activity[0]!, kind, state: 'pending' as const })

  it('re-reads every 20 s only while drafts are being written, else every minute', () => {
    expect(summaryRefreshMs(undefined)).toBe(60_000)
    expect(summaryRefreshMs(idle)).toBe(60_000)
    // in_progress also counts listings sent and waiting on the marketplace (hours): not a reason
    const sentAndWaiting = { ...idle, listings: { ...idle.listings, in_progress: 34 } }
    expect(summaryRefreshMs(sentAndWaiting)).toBe(60_000)
    expect(summaryRefreshMs({ ...idle, activity: [pending('send')] })).toBe(60_000)
    expect(summaryRefreshMs({ ...idle, activity: [{ ...pending('write'), state: 'completed' }] })).toBe(60_000)
    expect(summaryRefreshMs({ ...idle, activity: [pending('write')] })).toBe(20_000)
    expect(summaryRefreshMs({ ...idle, activity: [pending('photo_check')] })).toBe(20_000)
    expect(summaryRefreshMs({ ...idle, activity: [pending('import')] })).toBe(20_000)
  })

  it('stops the fast rate after 15 minutes without a change (a job stuck pending)', () => {
    const writing = { ...idle, activity: [pending('write')] }
    expect(summaryRefreshMs(writing, HOME_BUSY_CAP_MS - 1)).toBe(20_000)
    expect(summaryRefreshMs(writing, HOME_BUSY_CAP_MS)).toBe(60_000)
  })

  it('the change clock restarts on a changed read, not on a new as_of', () => {
    const clock = summaryChangeClock()
    const entry = {}
    const writing = { ...idle, activity: [pending('write')] }
    expect(clock(entry, writing, 0)).toBe(0)
    expect(clock(entry, { ...writing, as_of: '2026-11-15T10:00:00Z' }, 600_000)).toBe(600_000)
    expect(clock(entry, writing, HOME_BUSY_CAP_MS)).toBe(HOME_BUSY_CAP_MS)
    const more = { ...writing, inbox: { ...writing.inbox, open_items: writing.inbox.open_items + 3 } }
    expect(clock(entry, more, HOME_BUSY_CAP_MS + 1)).toBe(0)
    expect(clock(entry, more, HOME_BUSY_CAP_MS + 5_001)).toBe(5_000)
    // another cache entry keeps its own clock
    expect(clock({}, more, HOME_BUSY_CAP_MS + 5_000)).toBe(0)
  })
})

describe('fresh counts right after a mutation (B28 review)', () => {
  it('an invalidation cancels a timer read already in flight and reads again', async () => {
    server.inbox = { open_items: 40, questions: 30, blocking_questions: 10, issues: 15, issues_without_question: 10 }
    app(false)
    await waitFor(() => expect(badge()).toBe('40'))
    // a timer read starts before the mutation and is slow to answer
    let release!: () => void
    server.hold = new Promise<void>((r) => (release = r))
    const stale = server.summaryCalls
    void qc.refetchQueries({ queryKey: homeSummaryKey(keysFor('tn')), exact: true })
    await waitFor(() => expect(server.summaryCalls).toBe(stale + 1))
    const timerSignal = server.signals.at(-1)
    // the mutation lands, then its invalidations (one tick)
    server.hold = null
    server.inbox = { open_items: 120, questions: 70, blocking_questions: 30, issues: 80, issues_without_question: 50 }
    await act(async () => {
      void qc.invalidateQueries({ queryKey: keysFor('tn').issues.all() })
      void qc.invalidateQueries({ queryKey: keysFor('tn').tasks.all() })
    })
    await waitFor(() => expect(badge()).toBe('99+'))
    expect(server.summaryCalls).toBe(stale + 2)
    expect(timerSignal?.aborted).toBe(true)
    // the old read answering late changes nothing
    await act(async () => release())
    expect(badge()).toBe('99+')
  })

  it('at low volume the Inbox counts its complete lists when they are newer than the summary', async () => {
    const task = (id: string) => ({ ...tasks[0]!, id })
    const alone = { ...issues[30]!, id: 'ia' }
    server.small = { tasks: [task('t0'), task('t1')], issues: [alone] }
    server.inbox = { open_items: 3, questions: 2, blocking_questions: 1, issues: 1, issues_without_question: 1 }
    app(true)
    const caption = () => screen.getByTestId('inbox-counts-caption').textContent
    await waitFor(() => expect(caption()).toBe('3 open items: 2 questions, 1 issue without a question'))
    // a question is answered: the lists come back first, the summary is slow
    let release!: () => void
    server.hold = new Promise<void>((r) => (release = r))
    server.small = { tasks: [task('t1')], issues: [alone] }
    server.inbox = { open_items: 2, questions: 1, blocking_questions: 0, issues: 1, issues_without_question: 1 }
    await act(async () => {
      void qc.invalidateQueries({ queryKey: keysFor('tn').tasks.all() })
    })
    await waitFor(() => expect(caption()).toBe('2 open items: 1 question, 1 issue without a question'))
    expect(screen.getByTestId('inbox-open-count').textContent).toBe('2 open')
    await act(async () => release())
    await waitFor(() => expect(badge()).toBe('2'))
    expect(caption()).toBe('2 open items: 1 question, 1 issue without a question')
  })
})
