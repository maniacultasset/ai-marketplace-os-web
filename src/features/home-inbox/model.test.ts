import { describe, expect, it } from 'vitest'
import type { Schema } from '@/api/types'
import type { Issue, Task } from '@/features/inbox/model'
import { walkListings } from './api'
import {
  greeting,
  attemptsTimeline,
  brandProfileDone,
  currentAccount,
  fmtCount,
  inboxSearchSchema,
  inboxStatuses,
  inProgressTile,
  isCategoryIssue,
  issueChip,
  issueTimeline,
  itemKey,
  listingBucket,
  liveTile,
  marketplaceCard,
  mergeInbox,
  needsYouCaption,
  needsYouTile,
  parseItemKey,
  positionLabel,
  retriesStopped,
  setupProgress,
  setupSteps,
  summarizeListings,
  visibleItems,
} from './model'

type Listing = Schema<'ListingOut'>
type Submission = Schema<'SubmissionOut'>

const U = (n: number) => `0b1c2d3e-0000-4000-8000-${String(n).padStart(12, '0')}`

const listing = (
  n: number,
  status: Listing['status'],
  marketplace_state: Listing['marketplace_state'] = 'not_submitted',
  marketplace: Listing['marketplace'] = 'amazon',
  product = n,
): Listing => ({
  id: U(n),
  product_id: U(1000 + product),
  marketplace,
  status,
  marketplace_state,
  status_changed_at: '2026-10-05T09:31:00Z',
  created_at: '2026-10-05T09:30:00Z',
  updated_at: '2026-10-05T09:31:00Z',
})

const task = (n: number, at: string, over: Partial<Task> = {}): Task => ({
  id: U(n),
  kind: 'missing_fact',
  question: `Q${n}`,
  reason: 'Needed',
  status: 'open',
  created_at: at,
  updated_at: at,
  expected_answer: {},
  resume_from: 'generate',
  suggestions: [],
  ...over,
})

const issue = (n: number, at: string, over: Partial<Issue> = {}): Issue => ({
  id: U(n),
  listing_id: U(500),
  marketplace: 'amazon',
  status: 'open',
  severity: 'error',
  error_code: 'VALUE_NOT_ALLOWED',
  error_class: 'invalid_value',
  field_path: 'content.size',
  message: 'Size not allowed',
  source: 'amazon_adapter',
  retry_class: 'user_action',
  auto_fixable: false,
  occurrences: 1,
  first_seen_at: at,
  last_seen_at: at,
  created_at: at,
  updated_at: at,
  ...over,
})

const submission = (attempt: number, outcome: Submission['outcome'], error?: Partial<NonNullable<Submission['error']>>): Submission => ({
  id: U(9000 + attempt),
  attempt,
  outcome,
  operation: 'create',
  listing_version_id: U(800),
  requested_by_user_id: U(700),
  created_at: `2026-10-0${attempt}T10:00:00Z`,
  error: error
    ? { attempts_used: attempt, max_attempts: 3, retryable: true, schema_version: '1', status: 'failed', ...error }
    : null,
})

describe('listingBucket', () => {
  it('counts Live only when the marketplace confirms it', () => {
    expect(listingBucket({ status: 'published', marketplace_state: 'live' })).toBe('live')
    expect(listingBucket({ status: 'published', marketplace_state: 'processing' })).toBe('working')
    expect(listingBucket({ status: 'published', marketplace_state: 'pending_review' })).toBe('working')
    expect(listingBucket({ status: 'published', marketplace_state: 'partially_live' })).toBe('partly')
  })
  it('puts approvals and publishing on the person, never on the agent', () => {
    expect(listingBucket({ status: 'validated', marketplace_state: 'not_submitted' })).toBe('approve')
    expect(listingBucket({ status: 'needs_review', marketplace_state: 'not_submitted' })).toBe('approve')
    expect(listingBucket({ status: 'approved', marketplace_state: 'not_submitted' })).toBe('publish')
    expect(listingBucket({ status: 'generating', marketplace_state: 'not_submitted' })).toBe('working')
    expect(listingBucket({ status: 'publishing', marketplace_state: 'not_submitted' })).toBe('working')
  })
  it('treats rejections, blocks and failures as problems, and drafts as idle', () => {
    expect(listingBucket({ status: 'published', marketplace_state: 'rejected' })).toBe('problem')
    expect(listingBucket({ status: 'blocked', marketplace_state: 'not_submitted' })).toBe('problem')
    expect(listingBucket({ status: 'failed', marketplace_state: 'not_submitted' })).toBe('problem')
    expect(listingBucket({ status: 'created', marketplace_state: 'not_submitted' })).toBe('idle')
    expect(listingBucket({ status: 'published', marketplace_state: 'removed' })).toBe('idle')
  })
})

describe('summarizeListings and tiles', () => {
  const rows = [
    listing(1, 'published', 'live', 'amazon', 1),
    listing(2, 'published', 'live', 'flipkart', 1), // same product, other marketplace
    listing(3, 'published', 'live', 'amazon', 2),
    listing(4, 'generating'),
    listing(5, 'published', 'processing', 'flipkart'),
    listing(6, 'validated'),
    listing(7, 'approved'),
    listing(8, 'failed', 'not_submitted', 'flipkart'),
    listing(9, 'created'),
  ]
  const s = summarizeListings(rows, true)

  it('counts every bucket and distinct live products', () => {
    expect(s).toMatchObject({ total: 9, live: 3, liveProducts: 2, working: 2, approve: 1, publish: 1, problem: 1, complete: true })
    expect(s.byMarketplace.amazon).toEqual({ listings: 6, live: 2, partly: 0, working: 1, problem: 0 })
    expect(s.byMarketplace.flipkart).toEqual({ listings: 3, live: 1, partly: 0, working: 1, problem: 1 })
  })

  it('live tile names listings and products, with no "+" when the walk was complete', () => {
    expect(liveTile(s, 1000)).toMatchObject({ value: '3', caption: 'listings across 2 products' })
  })

  it('marks every number as a lower bound when the walk hit its cap', () => {
    const capped = summarizeListings(rows, false)
    expect(liveTile(capped, 1000).value).toBe('3+')
    expect(liveTile(capped, 1000).note).toMatch(/newest 1,000 listings/)
    expect(inProgressTile(capped, 1000).value).toBe('2+')
  })

  it('in-progress caption says when nothing is happening', () => {
    expect(inProgressTile(summarizeListings([], true), 1000)).toMatchObject({ value: '0', caption: expect.stringMatching(/Nothing/) })
  })
})

describe('needs you', () => {
  const base = { tasks: { n: 3, more: false }, issues: { n: 1, more: false }, approve: 2, publish: 0, snapshotComplete: true }
  it('adds questions, issues and listings waiting on a person', () => {
    expect(needsYouTile(base, 1000)).toEqual({ value: '6', caption: '3 questions, 2 listings to approve, 1 issue', note: undefined })
  })
  it('shows "+" and says why when the first page was not everything', () => {
    const t = needsYouTile({ ...base, tasks: { n: 50, more: true } }, 1000)
    expect(t.value).toBe('53+')
    expect(t.note).toMatch(/first page/)
    expect(t.caption).toBe('50+ questions, 2 listings to approve, 1 issue')
  })
  it('is calm at zero', () => {
    expect(needsYouCaption({ tasks: { n: 0, more: false }, issues: { n: 0, more: false }, approve: 0, publish: 0, snapshotComplete: true })).toBe(
      'Nothing needs you right now.',
    )
  })
})

describe('marketplace cards', () => {
  const totals = { listings: 4, live: 2, partly: 0, working: 1, problem: 1 }
  const acct = (status: Schema<'MarketplaceAccountOut'>['status'], marketplace: 'amazon' | 'flipkart' = 'amazon') => ({
    id: U(status.length),
    marketplace,
    status,
    seller_id: 'S1',
    created_at: '2026-10-01T00:00:00Z',
  })
  it('picks the non-revoked account', () => {
    expect(currentAccount([acct('revoked'), acct('active')], 'amazon')?.status).toBe('active')
    expect(currentAccount([acct('revoked')], 'amazon')).toBeNull()
    expect(currentAccount([acct('active', 'flipkart')], 'amazon')).toBeNull()
  })
  it('connected: live count and what is in flight', () => {
    expect(marketplaceCard({ status: 'active' }, totals, true)).toEqual({
      chip: { status: 'live', label: '2 live' },
      sub: '1 processing · 1 error',
      action: null,
    })
  })
  it('not connected and reconnect point to Marketplaces', () => {
    expect(marketplaceCard(null, { ...totals, live: 0 }, true)).toMatchObject({ chip: { label: 'Not connected' }, action: 'connect' })
    expect(marketplaceCard({ status: 'needs_reconnect' }, totals, false)).toMatchObject({
      chip: { status: 'needs-you', label: 'Reconnect' },
      sub: '2+ live · access expired',
      action: 'reconnect',
    })
  })
  it('never shows a green chip with zero live listings', () => {
    expect(marketplaceCard({ status: 'active' }, { listings: 0, live: 0, partly: 0, working: 0, problem: 0 }, true).chip).toEqual({
      status: 'not-listed',
      label: 'None live yet',
    })
  })
})

describe('first run', () => {
  it('brand profile is done once any voice field is saved', () => {
    expect(brandProfileDone(undefined)).toBe(false)
    expect(brandProfileDone({ tone: ' ', guidelines: [], glossary: {} })).toBe(false)
    expect(brandProfileDone({ tone: 'Warm', guidelines: [], glossary: {} })).toBe(true)
    expect(brandProfileDone({ tone: null, guidelines: ['No slang'] })).toBe(true)
  })
  it('compliance is "Later" and never counted; the first open step is Next', () => {
    const steps = setupSteps({ brandDone: true, activeAccounts: 1, hasProducts: false })
    expect(steps.map((s) => [s.id, s.state, s.chip])).toEqual([
      ['brand', 'done', 'Done'],
      ['compliance', 'later', 'Later'],
      ['marketplace', 'done', '1 of 2'],
      ['product', 'next', 'Next'],
    ])
    expect(setupProgress(steps)).toEqual({ done: 2, total: 3, line: 'One step left' })
  })
  it('marketplace step keeps its count when it is next', () => {
    const steps = setupSteps({ brandDone: true, activeAccounts: 0, hasProducts: false })
    expect(steps[2]).toMatchObject({ state: 'next', chip: '0 of 2' })
    expect(setupProgress(steps).line).toBe('2 steps left')
  })
})

describe('inbox items', () => {
  const t1 = task(1, '2026-10-05T10:00:00Z')
  const t2 = task(2, '2026-10-05T12:00:00Z')
  const warn = issue(3, '2026-10-05T13:00:00Z', { severity: 'warning' })
  const err = issue(4, '2026-10-05T09:00:00Z')

  it('questions first, then errors, then warnings; newest first inside each', () => {
    expect(mergeInbox([t1, t2], [warn, err]).map(itemKey)).toEqual([`task:${U(2)}`, `task:${U(1)}`, `issue:${U(4)}`, `issue:${U(3)}`])
  })
  it('views filter by kind, and positions count within the kind', () => {
    const items = mergeInbox([t1, t2], [warn, err])
    expect(visibleItems('questions', items)).toHaveLength(2)
    expect(visibleItems('issues', items).every((i) => i.kind === 'issue')).toBe(true)
    expect(positionLabel(items, `task:${U(1)}`)).toBe('Question 2 of 2')
    expect(positionLabel(items, `issue:${U(3)}`)).toBe('Issue 2 of 2')
    expect(positionLabel(items, 'task:nope')).toBeNull()
  })
  it('item keys round-trip and reject junk', () => {
    expect(parseItemKey(`issue:${U(4)}`)).toEqual({ kind: 'issue', id: U(4) })
    expect(parseItemKey('issue:12')).toBeNull()
    expect(parseItemKey(undefined)).toBeNull()
  })
  it('URL search falls back on junk, and status pickers apply only to their view', () => {
    expect(inboxSearchSchema.parse({ view: 'bogus', item: 'x', status: 'nope' })).toEqual({})
    expect(inboxStatuses({ status: 'resolved', tasks: 'answered' })).toEqual({ task: 'open', issue: 'open' })
    expect(inboxStatuses({ view: 'issues', status: 'resolved' })).toEqual({ task: 'open', issue: 'resolved' })
    expect(inboxStatuses({ view: 'questions', tasks: 'answered' })).toEqual({ task: 'answered', issue: 'open' })
  })
})

describe('issues', () => {
  it('chips carry a word for each state', () => {
    expect(issueChip({ status: 'open', severity: 'error' })).toEqual({ status: 'needs-you', label: 'Needs you' })
    expect(issueChip({ status: 'open', severity: 'warning' }).label).toBe('Warning')
    expect(issueChip({ status: 'auto_fixed', severity: 'error' })).toEqual({ status: 'live', label: 'Auto-fixed' })
    expect(issueChip({ status: 'dismissed', severity: 'warning' }).status).toBe('not-listed')
  })
  it('timeline: found, repeats, and how it closed', () => {
    const i = issue(5, '2026-10-05T09:00:00Z', {
      occurrences: 3,
      last_seen_at: '2026-10-06T09:00:00Z',
      status: 'auto_fixed',
      resolution: 'deterministic_fix',
      resolved_at: '2026-10-06T09:05:00Z',
      action_taken: 'Mapped "XXL" to "2XL"',
      value_submitted: 'XXL',
    })
    expect(issueTimeline(i, () => 'Fixed automatically')).toEqual([
      { tone: 'bad', title: 'Found', at: '2026-10-05T09:00:00Z', detail: 'Sent "XXL"' },
      { tone: 'need', title: 'Seen 3 times', at: '2026-10-06T09:00:00Z', detail: 'Latest check' },
      { tone: 'ok', title: 'Fixed automatically', at: '2026-10-06T09:05:00Z', detail: 'Mapped "XXL" to "2XL"' },
    ])
  })
})

describe('submission attempts', () => {
  const V1 = U(801)
  const V2 = U(802)
  /** Attempt `attempt` of version `v`, sent on day `day`. */
  const sub = (v: string, attempt: number, day: number, outcome: Submission['outcome'], error?: Partial<NonNullable<Submission['error']>>): Submission => ({
    ...submission(attempt, outcome, error),
    id: U(9100 + day),
    listing_version_id: v,
    created_at: `2026-10-${String(day).padStart(2, '0')}T10:00:00Z`,
  })
  const openIssue = (over: Partial<Issue> = {}) => issue(1, '2026-10-01T09:00:00Z', { listing_version_id: V1, ...over })
  const failed = (extra: Partial<NonNullable<Submission['error']>> = {}) => ({ error_code: 'VALUE_NOT_ALLOWED' as const, ...extra })

  it('oldest first, with the outcome in words', () => {
    const t = attemptsTimeline([submission(2, 'accepted'), submission(1, 'rejected', { error_code: 'VALUE_NOT_ALLOWED' })])
    expect(t.map((e) => e.title)).toEqual(['Attempt 1', 'Attempt 2'])
    expect(t[0]).toMatchObject({ tone: 'bad', detail: 'Rejected by the marketplace. Value not allowed.' })
    expect(t[1]).toMatchObject({ tone: 'ok' })
  })
  it('orders by time across approvals, since attempt numbers restart per version', () => {
    const subs = [
      sub(V2, 1, 10, 'accepted'),
      sub(V1, 3, 3, 'rejected', failed()),
      sub(V1, 1, 1, 'rejected', failed()),
      sub(V1, 2, 2, 'rejected', failed()),
    ]
    expect(attemptsTimeline(subs).map((e) => e.title)).toEqual([
      'Approval 1 · attempt 1',
      'Approval 1 · attempt 2',
      'Approval 1 · attempt 3',
      'Approval 2 · attempt 1',
    ])
  })
  it('retries stopped: the newest failed attempt of the issue’s version used every attempt', () => {
    expect(retriesStopped([], openIssue())).toBeNull()
    expect(retriesStopped([sub(V1, 1, 1, 'rejected', failed({ retryable: true, attempts_used: 1 }))], openIssue())).toBeNull()
    const three = [sub(V1, 1, 1, 'rejected', failed()), sub(V1, 2, 2, 'rejected', failed()), sub(V1, 3, 3, 'rejected', failed({ attempts_used: 3 }))]
    expect(retriesStopped(three, openIssue())).toEqual({ reason: 'exhausted', attempts: 3, max: 3 })
    expect(retriesStopped([sub(V1, 1, 1, 'rejected', failed({ retryable: false })), sub(V1, 2, 2, 'accepted')], openIssue())).toBeNull()
  })
  it('a newer approval that was accepted or is pending clears the banner', () => {
    const v1 = [sub(V1, 1, 1, 'rejected', failed()), sub(V1, 2, 2, 'rejected', failed()), sub(V1, 3, 3, 'rejected', failed({ retryable: false }))]
    expect(retriesStopped([...v1, sub(V2, 1, 10, 'accepted')], openIssue())).toBeNull()
    expect(retriesStopped([...v1, sub(V2, 1, 10, 'pending')], openIssue({ listing_version_id: null }))).toBeNull()
  })
  it('only for an open issue whose error the newest submission reported', () => {
    const three = [sub(V1, 3, 3, 'rejected', failed({ attempts_used: 3 }))]
    expect(retriesStopped(three, openIssue({ status: 'resolved' }))).toBeNull()
    expect(retriesStopped(three, openIssue({ status: 'auto_fixed' }))).toBeNull()
    expect(retriesStopped(three, openIssue({ status: 'dismissed' }))).toBeNull()
    expect(retriesStopped(three, openIssue({ error_code: 'FIELD_TOO_LONG' }))).toBeNull()
    expect(retriesStopped(three, openIssue({ listing_version_id: V2 }))).toBeNull()
  })
  it('not retryable on the first attempt is not "stopped after retries"', () => {
    expect(retriesStopped([sub(V1, 1, 1, 'error', failed({ retryable: false }))], openIssue())).toEqual({
      reason: 'not_retryable',
      attempts: 1,
      max: 3,
    })
  })
})

describe('isCategoryIssue', () => {
  it('matches category and product-type fields', () => {
    expect(isCategoryIssue({ field_path: 'item_type_keyword', error_code: 'VALUE_NOT_ALLOWED' })).toBe(true)
    expect(isCategoryIssue({ field_path: 'content.size', error_code: 'VALUE_NOT_ALLOWED' })).toBe(false)
  })
})

describe('walkListings', () => {
  const page = (data: Listing[], next: string | null) => ({ data, page: { has_more: !!next, next_cursor: next } })
  it('follows cursors until the end', async () => {
    const pages: Record<string, ReturnType<typeof page>> = { start: page([listing(1, 'created')], 'c2'), c2: page([listing(2, 'created')], null) }
    const seen: (string | undefined)[] = []
    const r = await walkListings(async (c) => {
      seen.push(c)
      return pages[c ?? 'start']!
    })
    expect(seen).toEqual([undefined, 'c2'])
    expect(r).toMatchObject({ complete: true })
    expect(r.rows).toHaveLength(2)
  })
  it('stops at the cap and reports the walk as incomplete', async () => {
    let calls = 0
    const r = await walkListings(async () => {
      calls++
      return page([listing(calls, 'created')], `c${calls + 1}`)
    }, 3)
    expect(calls).toBe(3)
    expect(r.complete).toBe(false)
  })
})

it('fmtCount uses Indian grouping and "+" for lower bounds', () => {
  expect(fmtCount({ n: 1200, more: true })).toBe('1,200+')
  expect(fmtCount({ n: 4, more: false })).toBe('4')
})

describe('greeting', () => {
  it('greets by first name and the local hour', () => {
    expect(greeting('Priya Raman', 9)).toBe('Good morning, Priya')
    expect(greeting('Priya', 13)).toBe('Good afternoon, Priya')
    expect(greeting('  Priya  Raman ', 20)).toBe('Good evening, Priya')
  })
  it('falls back to Home without a name', () => {
    expect(greeting(null, 9)).toBe('Home')
    expect(greeting('   ', 9)).toBe('Home')
  })
})
