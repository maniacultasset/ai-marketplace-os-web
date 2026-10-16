/**
 * Home (p05, p06), Inbox (p15) and Issue detail (p16): pure model. No React, no network: unit tested.
 *
 * Every number here is computed from API rows the screen has loaded. Nothing is estimated:
 * when a list was cut short (`has_more`, or the listings walk hit its cap) the number is a lower
 * bound and is shown with "+" and a reason.
 *
 * Contract: GET /listings (ListingOut), GET /tasks (TaskOut), GET /issues (IssueOut),
 * GET /marketplaces/accounts (MarketplaceAccountOut), GET /tenants/me (TenantOut),
 * GET /listings/{id}/submissions (SubmissionOut).
 */
import { z } from 'zod'
import type { ChipStatus } from '@/components/la/status-chip'
import type { Schema } from '@/api/types'
import { humanizeCode, type Issue, type Task } from '@/features/inbox/model'

type Listing = Schema<'ListingOut'>
type Marketplace = Schema<'Marketplace'>
type Account = Schema<'MarketplaceAccountOut'>
type Tenant = Schema<'TenantOut'>
type Submission = Schema<'SubmissionOut'>

export const API_MARKETPLACES = ['amazon', 'flipkart'] as const satisfies readonly Marketplace[]

/* ---------------------------------------------------------------------------------------------- */
/* Counting helpers                                                                                */
/* ---------------------------------------------------------------------------------------------- */

/** A count that may be a lower bound. */
export interface Count {
  n: number
  /** True when more rows exist than were loaded, so `n` is a lower bound. */
  more: boolean
}

export const fmtCount = (c: Count) => `${c.n.toLocaleString('en-IN')}${c.more ? '+' : ''}`

export function plural(n: number, one: string, many = `${one}s`) {
  return n === 1 ? one : many
}

/* ---------------------------------------------------------------------------------------------- */
/* Home: listing buckets                                                                           */
/* ---------------------------------------------------------------------------------------------- */

/**
 * Where a listing sits for Home. One bucket per listing:
 *   live       marketplace_state live (confirmed by the marketplace; "Live means confirmed")
 *   partly     marketplace_state partially_live
 *   working    the agent or the marketplace is busy: generating, publishing, or sent and waiting
 *              on the marketplace (processing, pending_review, not yet confirmed)
 *   approve    validated or needs_review: maker-checker, a person must approve
 *   publish    approved: a person must press publish (listing:publish)
 *   problem    blocked, failed, or rejected by the marketplace (shown through Inbox issues)
 *   idle       created (not generated yet), inactive or removed
 */
export type ListingBucket = 'live' | 'partly' | 'working' | 'approve' | 'publish' | 'problem' | 'idle'

export function listingBucket(l: Pick<Listing, 'status' | 'marketplace_state'>): ListingBucket {
  const ms = l.marketplace_state
  if (ms === 'live') return 'live'
  if (ms === 'partially_live') return 'partly'
  if (ms === 'rejected') return 'problem'
  switch (l.status) {
    case 'generating':
    case 'publishing':
      return 'working'
    case 'validated':
    case 'needs_review':
      return 'approve'
    case 'approved':
      return 'publish'
    case 'blocked':
    case 'failed':
      return 'problem'
    case 'published':
      return ms === 'inactive' || ms === 'removed' ? 'idle' : 'working'
    case 'created':
      return 'idle'
  }
}

export interface MarketplaceTotals {
  listings: number
  live: number
  partly: number
  working: number
  problem: number
}

export interface ListingsSnapshot {
  /** Every listing loaded by the walk (newest first). */
  total: number
  /** False when the walk stopped at its cap with more pages left: every count is a lower bound. */
  complete: boolean
  live: number
  partly: number
  /** Distinct products with at least one live or partly live listing. */
  liveProducts: number
  working: number
  approve: number
  publish: number
  problem: number
  byMarketplace: Record<Marketplace, MarketplaceTotals>
}

const emptyTotals = (): MarketplaceTotals => ({ listings: 0, live: 0, partly: 0, working: 0, problem: 0 })

export function summarizeListings(listings: readonly Pick<Listing, 'status' | 'marketplace_state' | 'marketplace' | 'product_id'>[], complete: boolean): ListingsSnapshot {
  const s: ListingsSnapshot = {
    total: listings.length,
    complete,
    live: 0,
    partly: 0,
    liveProducts: 0,
    working: 0,
    approve: 0,
    publish: 0,
    problem: 0,
    byMarketplace: { amazon: emptyTotals(), flipkart: emptyTotals() },
  }
  const products = new Set<string>()
  for (const l of listings) {
    const b = listingBucket(l)
    const m = s.byMarketplace[l.marketplace]
    m.listings++
    switch (b) {
      case 'live':
        s.live++
        m.live++
        products.add(l.product_id)
        break
      case 'partly':
        s.partly++
        m.partly++
        products.add(l.product_id)
        break
      case 'working':
        s.working++
        m.working++
        break
      case 'approve':
        s.approve++
        break
      case 'publish':
        s.publish++
        break
      case 'problem':
        s.problem++
        m.problem++
        break
      case 'idle':
        break
    }
  }
  s.liveProducts = products.size
  return s
}

/* ---------------------------------------------------------------------------------------------- */
/* Home: the three tiles                                                                           */
/* ---------------------------------------------------------------------------------------------- */

export interface TileView {
  value: string
  caption: string
  /** Why the number is a lower bound or missing; shown as the tooltip on the number. */
  note?: string
}

export const SNAPSHOT_NOTE = (cap: number) =>
  `Counted from your newest ${cap.toLocaleString('en-IN')} listings. The API has no total yet, so the real number may be higher.`

export function liveTile(s: ListingsSnapshot, cap: number): TileView {
  const more = !s.complete
  const parts = [`${plural(s.live, 'listing')} across ${fmtCount({ n: s.liveProducts, more })} ${plural(s.liveProducts, 'product')}`]
  if (s.partly) parts.push(`${s.partly} partly live`)
  return {
    value: fmtCount({ n: s.live, more }),
    caption: parts.join(', '),
    note: more ? SNAPSHOT_NOTE(cap) : undefined,
  }
}

export function inProgressTile(s: ListingsSnapshot, cap: number): TileView {
  const more = !s.complete
  return {
    value: fmtCount({ n: s.working, more }),
    caption: s.working ? 'the agent or the marketplace is working. No action needed.' : 'Nothing is being prepared or sent right now.',
    note: more ? SNAPSHOT_NOTE(cap) : undefined,
  }
}

export interface NeedsYouParts {
  tasks: Count
  issues: Count
  approve: number
  publish: number
  snapshotComplete: boolean
}

/** "3 questions, 1 listing to approve, 2 issues". Empty parts are left out. */
export function needsYouCaption(p: NeedsYouParts): string {
  const out: string[] = []
  if (p.tasks.n || p.tasks.more) out.push(`${fmtCount(p.tasks)} ${plural(p.tasks.n, 'question')}`)
  if (p.approve) out.push(`${p.approve} ${plural(p.approve, 'listing')} to approve`)
  if (p.publish) out.push(`${p.publish} ${plural(p.publish, 'listing')} to publish`)
  if (p.issues.n || p.issues.more) out.push(`${fmtCount(p.issues)} ${plural(p.issues.n, 'issue')}`)
  return out.length ? out.join(', ') : 'Nothing needs you right now.'
}

export function needsYouTile(p: NeedsYouParts, cap: number): TileView {
  const n = p.tasks.n + p.issues.n + p.approve + p.publish
  const more = p.tasks.more || p.issues.more || !p.snapshotComplete
  const notes: string[] = []
  if (p.tasks.more || p.issues.more) notes.push('Only the first page of open questions and issues is counted.')
  if (!p.snapshotComplete) notes.push(SNAPSHOT_NOTE(cap))
  return { value: fmtCount({ n, more }), caption: needsYouCaption(p), note: notes.join(' ') || undefined }
}

/* ---------------------------------------------------------------------------------------------- */
/* Home: marketplace cards                                                                         */
/* ---------------------------------------------------------------------------------------------- */

export interface MarketplaceCardView {
  chip: { status: ChipStatus; label: string }
  sub: string
  /** Where the sub line links: connect / reconnect on Marketplaces. */
  action: 'connect' | 'reconnect' | null
}

/** The account that counts for a marketplace: the non-revoked one (a brand has at most one). */
export function currentAccount(accounts: readonly Account[], m: Marketplace): Account | null {
  return accounts.find((a) => a.marketplace === m && a.status !== 'revoked') ?? null
}

export function marketplaceCard(account: Pick<Account, 'status'> | null, t: MarketplaceTotals, complete: boolean): MarketplaceCardView {
  const plus = complete ? '' : '+'
  if (!account) {
    if (t.live) return { chip: { status: 'live', label: `${t.live}${plus} live` }, sub: 'Account disconnected. Connect to keep listing.', action: 'connect' }
    return { chip: { status: 'not-listed', label: 'Not connected' }, sub: 'Connect to list here', action: 'connect' }
  }
  if (account.status === 'needs_reconnect') {
    return { chip: { status: 'needs-you', label: 'Reconnect' }, sub: t.live ? `${t.live}${plus} live · access expired` : 'Access expired', action: 'reconnect' }
  }
  const sub: string[] = []
  if (t.partly) sub.push(`${t.partly} partly live`)
  if (t.working) sub.push(`${t.working} processing`)
  if (t.problem) sub.push(`${t.problem} ${plural(t.problem, 'error')}`)
  if (!t.listings) sub.push('Connected. No listings yet.')
  return {
    chip: t.live ? { status: 'live', label: `${t.live}${plus} live` } : { status: 'not-listed', label: 'None live yet' },
    sub: sub.join(' · ') || 'Nothing else in progress',
    action: null,
  }
}

/* ---------------------------------------------------------------------------------------------- */
/* Home: first run (p05)                                                                           */
/* ---------------------------------------------------------------------------------------------- */

export type SetupState = 'done' | 'next' | 'todo' | 'later'

export interface SetupStep {
  id: 'brand' | 'compliance' | 'marketplace' | 'product'
  label: string
  state: SetupState
  /** Chip word ("Done", "Next", "1 of 2", "Later"). */
  chip: string
  /** Counts toward the ring (compliance has no API yet, so it never does). */
  counted: boolean
}

export function brandProfileDone(t: Pick<Tenant, 'tone' | 'guidelines' | 'glossary'> | undefined): boolean {
  if (!t) return false
  return !!t.tone?.trim() || (t.guidelines?.length ?? 0) > 0 || Object.keys(t.glossary ?? {}).length > 0
}

export function setupSteps(input: { brandDone: boolean; activeAccounts: number; hasProducts: boolean }): SetupStep[] {
  const steps: SetupStep[] = [
    { id: 'brand', label: 'Brand profile', state: input.brandDone ? 'done' : 'todo', chip: input.brandDone ? 'Done' : 'To do', counted: true },
    { id: 'compliance', label: 'Compliance defaults', state: 'later', chip: 'Later', counted: false },
    {
      id: 'marketplace',
      label: 'Connect a marketplace',
      state: input.activeAccounts > 0 ? 'done' : 'todo',
      chip: `${input.activeAccounts} of ${API_MARKETPLACES.length}`,
      counted: true,
    },
    { id: 'product', label: 'Add your first product', state: input.hasProducts ? 'done' : 'todo', chip: input.hasProducts ? 'Done' : 'To do', counted: true },
  ]
  // The first counted step that is not done is "Next".
  const next = steps.find((s) => s.counted && s.state === 'todo')
  if (next) {
    next.state = 'next'
    next.chip = next.id === 'marketplace' ? next.chip : 'Next'
  }
  return steps
}

export function setupProgress(steps: readonly SetupStep[]): { done: number; total: number; line: string } {
  const counted = steps.filter((s) => s.counted)
  const done = counted.filter((s) => s.state === 'done').length
  const left = counted.length - done
  return { done, total: counted.length, line: left === 0 ? 'All done' : left === 1 ? 'One step left' : `${left} steps left` }
}

/* ---------------------------------------------------------------------------------------------- */
/* Inbox: items                                                                                    */
/* ---------------------------------------------------------------------------------------------- */

export type InboxItem = { kind: 'task'; id: string; at: string; task: Task } | { kind: 'issue'; id: string; at: string; issue: Issue }

export const itemKey = (i: Pick<InboxItem, 'kind' | 'id'>) => `${i.kind}:${i.id}`

export function parseItemKey(key: string | undefined): { kind: 'task' | 'issue'; id: string } | null {
  if (!key) return null
  const m = /^(task|issue):([0-9a-f-]{36})$/i.exec(key)
  return m ? { kind: m[1] as 'task' | 'issue', id: m[2]! } : null
}

/**
 * Questions first (they block a listing until answered), then issues with errors before warnings;
 * newest first inside each group. Stable for equal times.
 */
export function mergeInbox(tasks: readonly Task[], issues: readonly Issue[]): InboxItem[] {
  const t: InboxItem[] = tasks.map((task) => ({ kind: 'task', id: task.id, at: task.created_at, task }))
  const i: InboxItem[] = issues.map((issue) => ({ kind: 'issue', id: issue.id, at: issue.last_seen_at, issue }))
  const rank = (x: InboxItem) => (x.kind === 'task' ? 0 : x.issue.severity === 'error' ? 1 : 2)
  return [...t, ...i]
    .map((x, idx) => ({ x, idx }))
    .sort((a, b) => rank(a.x) - rank(b.x) || b.x.at.localeCompare(a.x.at) || a.idx - b.idx)
    .map(({ x }) => x)
}

export const INBOX_VIEWS = ['all', 'questions', 'issues'] as const
export type InboxView = (typeof INBOX_VIEWS)[number]

const ISSUE_STATUS = ['open', 'auto_fixed', 'resolved', 'dismissed'] as const
const TASK_STATUS = ['open', 'answered', 'applied', 'cancelled'] as const

export const inboxSearchSchema = z.object({
  view: z.enum(INBOX_VIEWS).optional().catch(undefined),
  /** Selected item, `task:<uuid>` or `issue:<uuid>`. */
  item: z
    .string()
    .regex(/^(task|issue):[0-9a-fA-F-]{36}$/)
    .optional()
    .catch(undefined),
  /** Issue status (Issues view only); backend default 'open'. */
  status: z.enum(ISSUE_STATUS).optional().catch(undefined),
  /** Task status (Questions view only); backend default 'open'. */
  tasks: z.enum(TASK_STATUS).optional().catch(undefined),
})
export type InboxSearch = z.infer<typeof inboxSearchSchema>

/** The "All" view always shows open items; the status pickers apply only to their own view. */
export function inboxStatuses(s: InboxSearch): { task: (typeof TASK_STATUS)[number]; issue: (typeof ISSUE_STATUS)[number] } {
  const view = s.view ?? 'all'
  return {
    task: view === 'questions' ? (s.tasks ?? 'open') : 'open',
    issue: view === 'issues' ? (s.status ?? 'open') : 'open',
  }
}

export function visibleItems(view: InboxView, items: readonly InboxItem[]): InboxItem[] {
  if (view === 'questions') return items.filter((i) => i.kind === 'task')
  if (view === 'issues') return items.filter((i) => i.kind === 'issue')
  return [...items]
}

/** "Question 2 of 5" / "Issue 1 of 3": position among items of the same kind in the visible list. */
export function positionLabel(items: readonly InboxItem[], key: string): string | null {
  const it = items.find((i) => itemKey(i) === key)
  if (!it) return null
  const same = items.filter((i) => i.kind === it.kind)
  const n = same.findIndex((i) => i.id === it.id) + 1
  return `${it.kind === 'task' ? 'Question' : 'Issue'} ${n} of ${same.length}`
}

/* ---------------------------------------------------------------------------------------------- */
/* Issues: presentation                                                                            */
/* ---------------------------------------------------------------------------------------------- */

/** Short title for an issue row: the humanized error code ("Value not allowed"). */
export const issueTitle = (i: Pick<Issue, 'error_code'>) => humanizeCode(i.error_code)

export function issueChip(i: Pick<Issue, 'status' | 'severity'>): { status: ChipStatus; label: string } {
  switch (i.status) {
    case 'auto_fixed':
      return { status: 'live', label: 'Auto-fixed' }
    case 'resolved':
      return { status: 'live', label: 'Resolved' }
    case 'dismissed':
      return { status: 'not-listed', label: 'Dismissed' }
    case 'open':
      return i.severity === 'error' ? { status: 'needs-you', label: 'Needs you' } : { status: 'needs-you', label: 'Warning' }
  }
}

export const RETRY_CLASS_TEXT: Record<Issue['retry_class'], string> = {
  auto_retry: 'Temporary. The same submission can be retried as is.',
  ai_correct: 'Content needs a correction, then a new approval.',
  user_action: 'Needs a person. Retrying alone will not fix it.',
  system_failure: 'Our system failed. Nothing is wrong with your listing.',
}

/** "Unknown error, not auto-fixable" (p16 "Class"). */
export function issueClassLine(i: Pick<Issue, 'error_class' | 'auto_fixable'>): string {
  return `${humanizeCode(i.error_class)}, ${i.auto_fixable ? 'marked auto-fixable' : 'not auto-fixable'}`
}

export function issueAffects(i: Pick<Issue, 'listing_item_id' | 'field_path'>): string {
  return `${i.listing_item_id ? 'One variant' : 'The whole listing'} · ${i.field_path}`
}

export interface TimelineEntry {
  tone: 'ok' | 'bad' | 'need' | 'now' | 'neutral'
  title: string
  at: string | null
  detail?: string
}

/** One issue's own history, from its fields only (first seen, repeats, how it closed). */
export function issueTimeline(i: Issue, resolutionLabel: (r: NonNullable<Issue['resolution']>) => string): TimelineEntry[] {
  const out: TimelineEntry[] = [
    {
      tone: i.severity === 'error' ? 'bad' : 'need',
      title: 'Found',
      at: i.first_seen_at,
      detail: i.value_submitted ? `Sent "${i.value_submitted}"` : undefined,
    },
  ]
  if (i.occurrences > 1) out.push({ tone: 'need', title: `Seen ${i.occurrences} times`, at: i.last_seen_at, detail: 'Latest check' })
  if (i.status !== 'open') {
    out.push({
      tone: i.status === 'dismissed' ? 'neutral' : 'ok',
      title: i.resolution ? resolutionLabel(i.resolution) : i.status === 'dismissed' ? 'Dismissed' : 'Closed',
      at: i.resolved_at ?? null,
      detail: i.action_taken ?? undefined,
    })
  }
  return out
}

/** The issue is about the marketplace category or product type (p16 "Choose category"). */
export function isCategoryIssue(i: Pick<Issue, 'field_path' | 'error_code'>): boolean {
  return /categor|product_type|item_type/i.test(i.field_path) || /CATEGORY|PRODUCT_TYPE/.test(i.error_code)
}

/* ---------------------------------------------------------------------------------------------- */
/* Issue detail: submission attempts and the anti-loop banner                                      */
/* ---------------------------------------------------------------------------------------------- */

const OUTCOME_TEXT: Record<Submission['outcome'], { tone: TimelineEntry['tone']; text: string }> = {
  pending: { tone: 'now', text: 'Sent. Waiting for the marketplace.' },
  accepted: { tone: 'ok', text: 'Accepted by the marketplace.' },
  partially_accepted: { tone: 'need', text: 'Partly accepted. Some fields were refused.' },
  rejected: { tone: 'bad', text: 'Rejected by the marketplace.' },
  error: { tone: 'bad', text: 'The submission failed.' },
  live: { tone: 'ok', text: 'Confirmed live.' },
  superseded: { tone: 'neutral', text: 'Replaced by a newer submission.' },
}

/**
 * `attempt` restarts at 1 for every approved listing version (at most 3 per version), so order by
 * time, never by attempt number. Ties fall back to the attempt number.
 */
const byTime = (a: Submission, b: Submission) => a.created_at.localeCompare(b.created_at) || a.attempt - b.attempt

/** Approved versions in the order they were first sent: version id -> 1, 2, 3… */
function versionOrder(subs: readonly Submission[]): Map<string, number> {
  const order = new Map<string, number>()
  for (const s of [...subs].sort(byTime)) if (!order.has(s.listing_version_id)) order.set(s.listing_version_id, order.size + 1)
  return order
}

/**
 * Oldest first, like the p16 timeline. When the listing was approved more than once, each attempt
 * names the approval it belongs to ("Approval 2 · attempt 1"), because attempt numbers restart.
 */
export function attemptsTimeline(subs: readonly Submission[]): TimelineEntry[] {
  const versions = versionOrder(subs)
  const many = versions.size > 1
  return [...subs].sort(byTime).map((s) => {
    const o = OUTCOME_TEXT[s.outcome]
    const code = s.error_code ?? s.error?.error_code
    return {
      tone: o.tone,
      title: many ? `Approval ${versions.get(s.listing_version_id)} · attempt ${s.attempt}` : `Attempt ${s.attempt}`,
      at: s.responded_at ?? s.sent_at ?? s.created_at,
      detail: code ? `${o.text} ${humanizeCode(code)}.` : o.text,
    }
  })
}

/** Why the anti-loop rule stopped resubmitting. */
export type RetriesStopped =
  /** The approved version used every attempt it is allowed (the same error kept coming back). */
  | { reason: 'exhausted'; attempts: number; max: number }
  /** The error report marked the error as one a retry cannot fix, so it was not resent. */
  | { reason: 'not_retryable'; attempts: number; max: number }

function submissionCodes(s: Submission): Set<string> {
  const codes = new Set<string>()
  if (s.error_code) codes.add(s.error_code)
  if (s.error?.error_code) codes.add(s.error.error_code)
  for (const e of s.error?.errors ?? []) codes.add(e.error_code)
  return codes
}

/**
 * The anti-loop rule made visible (p16), for this issue only. Shown when all of these hold:
 *   - the issue is still open (a resolved, auto-fixed or dismissed issue needs no banner)
 *   - the newest submission (by time) failed and belongs to the issue's version, when known
 *   - that submission reported this issue's error code
 *   - its error report says the attempts are used up, or the error is not retryable
 * Null otherwise.
 */
export function retriesStopped(
  subs: readonly Submission[],
  issue: Pick<Issue, 'status' | 'error_code' | 'listing_version_id'>,
): RetriesStopped | null {
  if (issue.status !== 'open') return null
  const latest = [...subs].sort(byTime).at(-1)
  const err = latest?.error
  if (!latest || !err) return null
  if (latest.outcome !== 'rejected' && latest.outcome !== 'error') return null
  if (issue.listing_version_id && issue.listing_version_id !== latest.listing_version_id) return null
  if (!submissionCodes(latest).has(issue.error_code)) return null
  const attempts = Math.max(latest.attempt, err.attempts_used)
  if (attempts >= err.max_attempts) return { reason: 'exhausted', attempts, max: err.max_attempts }
  if (!err.retryable) return { reason: 'not_retryable', attempts, max: err.max_attempts }
  return null
}
