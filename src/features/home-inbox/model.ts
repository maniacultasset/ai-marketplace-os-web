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
import { humanizeCode, isAutoFix, TASK_KIND_LABEL, type Issue, type Task } from '@/features/inbox/model'
import { NO_TRAIL_TEXT, onVersion, versionRef } from '@/features/listing-flow/auto-fix-model'
import { causeLabel, fixState, laneView, type FixContext, type LaneView } from '@/features/listing-flow/lanes'
import { fieldLabel, isAgentText, sentenceCase } from '@/features/listing-flow/format'

export { sentenceCase }
import { isBlockingTask, isPhotoQuestion, type LinkedIssue } from '@/features/photo-facts/answer-spec'
import { statusReasonLabel } from '@/features/listings/model'
import { needsYourInfoLabel } from '@/lib/listing-chip'

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
 *   approve    validated or needs_review: maker-checker, a person must approve (not while the
 *              server's display state is needs_you: open blocking issues come first)
 *   publish    approved: a person must press publish (listing:publish)
 *   problem    blocked, failed, or rejected by the marketplace (shown through Inbox issues)
 *   idle       created (not generated yet), inactive or removed
 */
export type ListingBucket = 'live' | 'partly' | 'working' | 'approve' | 'publish' | 'problem' | 'idle'

export function listingBucket(l: Pick<Listing, 'status' | 'marketplace_state'> & Partial<Pick<Listing, 'display_state'>>): ListingBucket {
  const ms = l.marketplace_state
  if (ms === 'live') return 'live'
  if (ms === 'partially_live') return 'partly'
  if (ms === 'rejected') return 'problem'
  // Open blocking issues: nothing to approve yet. The issues themselves are counted (Inbox).
  if (l.display_state === 'needs_you' && l.status !== 'published') return 'problem'
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
  /** The newest listing in the problem bucket, so the card can name it and link to it. */
  firstProblem?: ProblemRef
}

/** One listing that needs fixing: its product (the link) and what is wrong, in plain words. */
export interface ProblemRef {
  productId: string
  label: string
}

/** Prod QA 9 Nov, item 22: "1 error" named nothing. The words for a problem-bucket listing. */
export function problemLabel(l: Pick<Listing, 'status' | 'marketplace_state'> & Partial<Pick<Listing, 'display_state' | 'needs_you_count' | 'status_reason'>>): string {
  if (l.marketplace_state === 'rejected') return 'Rejected by the marketplace'
  if (l.display_state === 'needs_you') return needsYourInfoLabel(l)
  return statusReasonLabel(l.status_reason) ?? (l.status === 'failed' ? 'The last step failed' : 'Needs attention')
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
  /** Of `publish`, the approved listings on Amazon (they wait while Amazon publishing is paused). */
  publishAmazon: number
  problem: number
  byMarketplace: Record<Marketplace, MarketplaceTotals>
}

const emptyTotals = (): MarketplaceTotals => ({ listings: 0, live: 0, partly: 0, working: 0, problem: 0 })

export function summarizeListings(listings: readonly (Pick<Listing, 'status' | 'marketplace_state' | 'marketplace' | 'product_id'> & Partial<Pick<Listing, 'display_state' | 'needs_you_count' | 'status_reason'>>)[], complete: boolean): ListingsSnapshot {
  const s: ListingsSnapshot = {
    total: listings.length,
    complete,
    live: 0,
    partly: 0,
    liveProducts: 0,
    working: 0,
    approve: 0,
    publish: 0,
    publishAmazon: 0,
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
        if (l.marketplace === 'amazon') s.publishAmazon++
        break
      case 'problem':
        s.problem++
        m.problem++
        m.firstProblem ??= { productId: l.product_id, label: problemLabel(l) }
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
  /** A second, quieter line: work that helps but holds nothing back. */
  aside?: string
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

/**
 * Approved listings a person can publish now, and the Amazon ones that wait while Amazon publishing
 * is switched off (useAmazonPublishing). Those are not work: nobody can send them, so they are
 * never "to publish". Amazon approvals also wait for the tenant read, so "ready to publish" is
 * never said and then taken back.
 */
export function publishCounts(
  s: Pick<ListingsSnapshot, 'publish' | 'publishAmazon'>,
  amazon: { paused: boolean; known: boolean },
  canPublish: boolean,
): { publish: number; paused: number } {
  const amazonOpen = amazon.known && !amazon.paused ? s.publishAmazon : 0
  return { publish: canPublish ? s.publish - s.publishAmazon + amazonOpen : 0, paused: amazon.paused ? s.publishAmazon : 0 }
}

/** "2 listings approved · publishing paused". */
export const pausedText = (n: number) => `${n} ${plural(n, 'listing')} approved · publishing paused`

export interface NeedsYouParts {
  /** Open questions that hold a listing back. */
  tasks: Count
  issues: Count
  approve: number
  publish: number
  snapshotComplete: boolean
  /** Open photo questions: answering improves a listing, and none of them blocks one. */
  improve?: Count
  /** Approved Amazon listings waiting while Amazon publishing is paused: said, never counted. */
  paused?: number
}

/**
 * Open questions from the first page, split by whether they hold a listing back. A photo question
 * never blocks by itself (SI3), unless the API says so. When more pages exist, both parts are lower
 * bounds: the unloaded rows could be either.
 */
export function splitTasks(tasks: readonly Task[], more: boolean, issues: readonly LinkedIssue[] = []): { blocking: Count; improve: Count } {
  const blocking = tasks.filter((t) => isBlockingTask(t, issues)).length
  return { blocking: { n: blocking, more }, improve: { n: tasks.length - blocking, more } }
}

/** The second line of a question row: a photo question says what answering does. */
export function taskMeta(task: Task, issues: readonly LinkedIssue[] = []): string {
  return isPhotoQuestion(task) && !isBlockingTask(task, issues) ? 'Answer to improve the listing' : TASK_KIND_LABEL[task.kind]
}

/**
 * Issues that are their own thing to do. An issue whose `human_task_id` is an open question is
 * the same problem as that question (backend listing_issues.link_task): it is counted and listed
 * through the question, and the question's detail shows it.
 */
export function standaloneIssues<I extends Pick<Issue, 'human_task_id'>>(issues: readonly I[], openTasks: readonly Pick<Task, 'id'>[]): I[] {
  const open = new Set(openTasks.map((t) => t.id))
  return issues.filter((i) => !i.human_task_id || !open.has(i.human_task_id))
}

/** "3 questions, 1 listing to approve, 2 issues". Empty parts are left out. */
export function needsYouCaption(p: NeedsYouParts): string {
  const out: string[] = []
  // Only questions seen on the loaded page: "0+ questions" would say nothing true.
  if (p.tasks.n) out.push(`${fmtCount(p.tasks)} ${plural(p.tasks.n, 'question')}`)
  if (p.approve) out.push(`${p.approve} ${plural(p.approve, 'listing')} to approve`)
  if (p.publish) out.push(`${p.publish} ${plural(p.publish, 'listing')} to publish`)
  if (p.issues.n || p.issues.more) out.push(`${fmtCount(p.issues)} ${plural(p.issues.n, 'issue')}`)
  if (out.length) return out.join(', ')
  return p.improve?.n ? 'Nothing blocks your listings.' : 'Nothing needs you right now.'
}

/** "2 photo questions. Answer to improve the listing." Undefined when there are none. */
export function improveAside(improve: Count | undefined): string | undefined {
  if (!improve?.n) return undefined
  return `${fmtCount(improve)} photo ${plural(improve.n, 'question')}. Answer to improve the listing.`
}

/** The number counts what holds a listing back; photo questions sit on the quieter line. */
export function needsYouTile(p: NeedsYouParts, cap: number): TileView {
  const n = p.tasks.n + p.issues.n + p.approve + p.publish
  const more = p.tasks.more || p.issues.more || !p.snapshotComplete
  const notes: string[] = []
  if (p.tasks.more || p.issues.more) notes.push('Only the first page of open questions and issues is counted.')
  if (!p.snapshotComplete) notes.push(SNAPSHOT_NOTE(cap))
  const aside = [improveAside(p.improve), p.paused ? `${pausedText(p.paused)}.` : undefined].filter(Boolean).join(' ')
  return { value: fmtCount({ n, more }), caption: needsYouCaption(p), note: notes.join(' ') || undefined, aside: aside || undefined }
}

/* ---------------------------------------------------------------------------------------------- */
/* Home: marketplace cards                                                                         */
/* ---------------------------------------------------------------------------------------------- */

export interface MarketplaceCardView {
  chip: { status: ChipStatus; label: string }
  sub: string
  /** The one listing to fix, named and linked (prod QA 9 Nov, item 22). */
  problem?: ProblemRef & { text: string }
  /** Where the sub line links: connect / reconnect on Marketplaces. */
  action: 'connect' | 'reconnect' | null
}

/** The account that counts for a marketplace: the non-revoked one (a brand has at most one). */
export function currentAccount(accounts: readonly Account[], m: Marketplace): Account | null {
  return accounts.find((a) => a.marketplace === m && a.status !== 'revoked') ?? null
}

/**
 * `soon`: publishing to this marketplace is not open yet (marketplaces/meta `comingSoon`), so a
 * brand with no account there sees "Coming soon" and no connect link (prod QA 9 Nov, item 3).
 */
export function marketplaceCard(
  account: Pick<Account, 'status'> | null,
  t: MarketplaceTotals,
  complete: boolean,
  soon: { reason: string } | null = null,
): MarketplaceCardView {
  const plus = complete ? '' : '+'
  if (!account && soon && !t.live) return { chip: { status: 'not-listed', label: 'Coming soon' }, sub: soon.reason, action: null }
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
  // One listing to fix: name it (the card links it); more: the count (the Inbox lists them)
  const one = t.problem === 1 && t.firstProblem ? t.firstProblem : null
  if (t.problem && !one) sub.push(`${t.problem} to fix`)
  if (!t.listings) sub.push('Connected. No listings yet.')
  return {
    chip: t.live ? { status: 'live', label: `${t.live}${plus} live` } : { status: 'not-listed', label: 'None live yet' },
    sub: sub.join(' · ') || (one ? '' : 'Nothing else in progress'),
    action: null,
    ...(one ? { problem: { ...one, text: `1 to fix: ${one.label}` } } : {}),
  }
}

/* ---------------------------------------------------------------------------------------------- */
/* Home: first run (p05)                                                                           */
/* ---------------------------------------------------------------------------------------------- */

export type SetupState = 'done' | 'next' | 'todo'

export interface SetupStep {
  id: 'brand' | 'manufacturer' | 'marketplace' | 'approver' | 'product'
  label: string
  state: SetupState
  /** Chip word ("Done", "Next", "1 of 2", "To do"). */
  chip: string
}

export function brandProfileDone(t: Pick<Tenant, 'tone' | 'guidelines' | 'glossary'> | undefined): boolean {
  if (!t) return false
  return !!t.tone?.trim() || (t.guidelines?.length ?? 0) > 0 || Object.keys(t.glossary ?? {}).length > 0
}

/**
 * The first-run checklist, every step from a real read: brand voice (GET /tenants/me), the brand
 * manufacturer (GET /brand-profile), a connected marketplace (GET /marketplaces/accounts), a second
 * person who can approve (GET /members, maker-checker) and the first product (GET /products).
 */
export function setupSteps(input: {
  brandDone: boolean
  manufacturerDone: boolean
  activeAccounts: number
  approverDone: boolean
  hasProducts: boolean
}): SetupStep[] {
  const yesNo = (done: boolean) => ({ state: (done ? 'done' : 'todo') as SetupState, chip: done ? 'Done' : 'To do' })
  const steps: SetupStep[] = [
    { id: 'brand', label: 'Brand profile', ...yesNo(input.brandDone) },
    { id: 'manufacturer', label: 'Brand manufacturer', ...yesNo(input.manufacturerDone) },
    {
      id: 'marketplace',
      label: 'Connect a marketplace',
      state: input.activeAccounts > 0 ? 'done' : 'todo',
      chip: `${input.activeAccounts} of ${API_MARKETPLACES.length}`,
    },
    { id: 'approver', label: 'Add a teammate who approves', ...yesNo(input.approverDone) },
    { id: 'product', label: 'Add your first product', ...yesNo(input.hasProducts) },
  ]
  // The first step that is not done is "Next".
  const next = steps.find((s) => s.state === 'todo')
  if (next) {
    next.state = 'next'
    next.chip = next.id === 'marketplace' ? next.chip : 'Next'
  }
  return steps
}

export function setupProgress(steps: readonly SetupStep[]): { done: number; total: number; line: string } {
  const done = steps.filter((s) => s.state === 'done').length
  const left = steps.length - done
  return { done, total: steps.length, line: left === 0 ? 'All done' : left === 1 ? 'One step left' : `${left} steps left` }
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
 * Questions that block a listing first, then errors, then photo questions (they only improve a
 * listing), then warnings; newest first inside each group. Stable for equal times.
 */
export function mergeInbox(tasks: readonly Task[], issues: readonly Issue[], linked: readonly LinkedIssue[] = issues): InboxItem[] {
  const t: InboxItem[] = tasks.map((task) => ({ kind: 'task', id: task.id, at: task.created_at, task }))
  // An issue linked to a listed question shows once, as that question.
  const i: InboxItem[] = standaloneIssues(issues, tasks).map((issue) => ({ kind: 'issue', id: issue.id, at: issue.last_seen_at, issue }))
  const rank = (x: InboxItem) => (x.kind === 'task' ? (isBlockingTask(x.task, linked) ? 0 : 2) : x.issue.severity === 'error' ? 1 : 3)
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

type LaneFields = Partial<Pick<Issue, 'resolution' | 'lane' | 'marketplace' | 'resolved_at'>>

/**
 * Who settles an issue (SI11 lanes): open issues by their lane, closed ones only when Kuinn fixed
 * them. Null when the API sent no lane (an older backend) or a person closed it: today's label stays.
 * A closed fix is "Fixed for you" only with `ctx` (the listing's attempts) proving it (lanes.ts).
 */
export function issueLane(i: Pick<Issue, 'status'> & LaneFields, ctx?: FixContext | null): LaneView | null {
  if (!i.lane) return null
  const fixed = isAutoFix({ status: i.status, resolution: i.resolution })
  if (i.status !== 'open' && !fixed) return null
  return laneView(i.lane, { closed: fixed, marketplace: i.marketplace ?? 'amazon', fix: fixed ? fixState(i.lane, i.resolved_at, ctx) : undefined, ownApproval: ctx?.ownApproval })
}

/** "A product fact", "The listing text": why it failed, when the API says. */
export function issueCause(i: Partial<Pick<Issue, 'cause' | 'marketplace'>>): string | null {
  return causeLabel(i.cause, i.marketplace ?? 'amazon')
}

export function issueChip(i: Pick<Issue, 'status' | 'severity'> & LaneFields, ctx?: FixContext | null): { status: ChipStatus; label: string } {
  const lane = issueLane(i, ctx)
  if (lane) return lane.chip
  switch (i.status) {
    case 'auto_fixed':
      return { status: 'live', label: 'Auto-fixed' }
    case 'resolved':
      // An AI rewrite of the field is a fix Kuinn made; it can only close as `resolved`.
      return { status: 'live', label: i.resolution === 'ai_correction' ? 'Auto-fixed' : 'Resolved' }
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

/**
 * "Next step" for an issue. Only an open issue asks anything of a person; a closed one says
 * plainly that nothing is left, so an auto-fixed issue never reads as "needs you".
 */
export function issueNextStep(i: Pick<Issue, 'status' | 'retry_class'> & LaneFields, ctx?: FixContext | null): string {
  const lane = issueLane(i, ctx)
  if (lane) return lane.next
  if (isAutoFix({ status: i.status, resolution: i.resolution })) return 'Nothing. Kuinn fixed this on its own.'
  switch (i.status) {
    case 'open':
      return RETRY_CLASS_TEXT[i.retry_class]
    case 'auto_fixed':
      return 'Nothing. Kuinn fixed this on its own.'
    case 'resolved':
      return 'Nothing. This is resolved.'
    case 'dismissed':
      return 'Nothing. The warning was accepted.'
  }
}

/** What Kuinn changed for an auto-fixed issue, or null when the issue was not auto-fixed. */
export function issueFixTrail(
  i: Pick<Issue, 'status' | 'action_taken' | 'resolution' | 'resolved_at' | 'last_seen_at'>,
): { change: string; at: string; rewritten: boolean } | null {
  if (!isAutoFix(i)) return null
  return {
    change: i.action_taken?.trim() || NO_TRAIL_TEXT,
    at: i.resolved_at ?? i.last_seen_at,
    rewritten: i.resolution === 'ai_correction',
  }
}

/** The Inbox "Auto-fixed" list: code fixes plus the resolved rows an AI rewrite closed. */
export function withAiRewrites<T extends Pick<Issue, 'resolution'>>(autoFixed: readonly T[], resolved: readonly T[]): T[] {
  return [...autoFixed, ...resolved.filter((r) => r.resolution === 'ai_correction')]
}

/** The label over an issue's plain message: what was wrong once it is fixed, else plain language. */
export function issuePlainLabel(i: Pick<Issue, 'status'>): string {
  return i.status === 'auto_fixed' || i.status === 'resolved' ? 'What was wrong' : 'In plain language'
}

/**
 * Where a fix's "see it" link goes: the review's Fixed for you section when the fix belongs to the
 * listing's current version (the same rule as the review), else the product's Activity tab, since
 * the review no longer shows it. Null for an issue that is not a fix.
 */
export function issueTrailLink(
  i: Pick<Issue, 'status' | 'resolution' | 'listing_version_id' | 'resolved_at'>,
  listing: Parameters<typeof versionRef>[0],
): 'review' | 'activity' | null {
  if (!isAutoFix(i)) return null
  return onVersion(i, versionRef(listing)) ? 'review' : 'activity'
}

const ERROR_CLASS_LABEL: Record<Issue['error_class'], string> = {
  missing_data: 'Missing information',
  invalid_value: 'Value not accepted',
  category_mismatch: 'Wrong category',
  variation_error: 'Size or colour problem',
  media_error: 'Photo problem',
  content_error: 'Listing text problem',
  identifier_error: 'Barcode problem',
  compliance_error: 'Marketplace rule',
  account_permission: 'Account access',
  marketplace_technical: 'Marketplace problem',
  unknown: 'Other problem',
}

/** "Photo problem" (p16 "Class"), in plain words. What happens next is the Next step row. */
export function issueClassLine(i: Pick<Issue, 'error_class'>): string {
  return ERROR_CLASS_LABEL[i.error_class] ?? humanizeCode(i.error_class)
}

/** "RS-KS-102-L · Hand Block Print Kurta Set · Whole listing · Color". The product leads when known. */
export function issueAffects(i: Pick<Issue, 'listing_item_id' | 'field_path'>, product?: { sku: string; title: string }): string {
  return [product ? `${product.sku} · ${product.title}` : null, i.listing_item_id ? 'One variant' : 'The whole listing', fieldLabel(i.field_path)]
    .filter(Boolean)
    .join(' · ')
}

/** A question about the product's barcode: answered on the product (BarcodeField), not here. */
export function isIdentifierTask(task: Pick<Task, 'product_id' | 'target_path'>): boolean {
  return !!task.product_id && /^(variants\[[^\]]+\]\.)?facts\.identifier$/.test(task.target_path ?? '')
}

/** A marketplace's own words, verbatim, with its code when there is one. No internal field path. */
export function rawMarketplaceText(i: Pick<Issue, 'marketplace_code' | 'raw_message' | 'message'>): string {
  return [i.marketplace_code ? `code ${i.marketplace_code}` : null, i.raw_message ?? i.message].filter(Boolean).join(' · ')
}

/**
 * Whether an issue's suggestion is shown to the seller. Some seeded rule suggestions are written
 * for the agent ("Set attributes.color from the product data ... flag the row rather than
 * guessing"): those name internal paths and stay hidden. Only while the issue is open.
 */
export function showSuggestion(i: Pick<Issue, 'suggestion' | 'status'>): boolean {
  return !!i.suggestion && i.status === 'open' && !isAgentText(i.suggestion)
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

/** "Good morning, Priya": the first word of the display name, by the viewer's local hour. */
export function greeting(name: string | null, hour = new Date().getHours()) {
  const first = name?.trim().split(/\s+/)[0]
  if (!first) return 'Home'
  const part = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'
  return `Good ${part}, ${first}`
}

/**
 * The fix context of one listing: its resolution attempts, whether the current version is approved
 * and whether the viewer may approve it themselves (owner approval, useOwnerMayApproveOwn).
 */
export function fixContext(
  resolution: { attempts?: readonly { kind: string; at: string; outcome: string }[] } | null | undefined,
  listing: { current_version_id?: string | null; approved_version_id?: string | null } | null | undefined,
  ownApproval = false,
): FixContext | null {
  if (!resolution || !listing) return null
  return { attempts: resolution.attempts ?? [], approved: !!listing.current_version_id && listing.approved_version_id === listing.current_version_id, ownApproval }
}

/* ---------------------------------------------------------------------------------------------- */
/* Photo questions: the reason in seller words                                                     */
/* ---------------------------------------------------------------------------------------------- */

/**
 * Each image check code (backend ImageIssueCode) and check name in seller words. Mirrors the
 * backend `auto_fix.text.IMAGE_PROBLEMS`, which words new questions; this rewrites the reason of a
 * question stored before it ("failed these checks: BACKGROUND OFF, RESOLUTION LOW, WRONG ASPECT").
 */
export const IMAGE_PROBLEMS: Readonly<Record<string, string>> = {
  BACKGROUND_OFF: 'the background is not plain white',
  RESOLUTION_LOW: 'the photo is smaller than the marketplace asks for',
  WRONG_ASPECT: 'the photo is not the shape the marketplace asks for',
  TEXT_DETECTED: 'there is text on the photo',
  WATERMARK: 'the photo has a watermark',
  FILL_RATIO_LOW: 'the product fills too little of the photo',
  FORMAT_UNSUPPORTED: 'the file type is not accepted (use JPEG or PNG)',
  FILE_TOO_LARGE: 'the file is too large',
  CORRUPT: 'the file could not be opened',
  LOGO_PROHIBITED: 'the photo shows a logo the marketplace does not allow',
  BACKGROUND: 'the background is not plain white',
  RESOLUTION: 'the photo is smaller than the marketplace asks for',
  ASPECT_RATIO: 'the photo is not the shape the marketplace asks for',
  TEXT_OVERLAY: 'there is text on the photo',
  FILL_RATIO: 'the product fills too little of the photo',
  FORMAT: 'the file type is not accepted (use JPEG or PNG)',
  FILE_SIZE: 'the file is too large',
  CORRUPTION: 'the file could not be opened',
  LOGO: 'the photo shows a logo the marketplace does not allow',
  EXIF_ORIENTATION: 'the photo is turned on its side',
}
const IMAGE_PROBLEM_DEFAULT = 'it does not meet the marketplace photo rules'
const LEGACY_IMAGE_REASON = /^The current image failed these checks: (.+?)(?: \.\.\.)?\.?$/

/** A question's reason, with an old image reason's raw check codes put in plain words. */
export function taskReason(task: Pick<Task, 'kind' | 'reason'>): string {
  const reason = task.reason ?? ''
  if (task.kind !== 'image_replacement') return reason
  const m = LEGACY_IMAGE_REASON.exec(reason.trim())
  if (!m) return reason
  const words = m[1]!
    .split(',')
    .map((c) => IMAGE_PROBLEMS[c.trim().toUpperCase().replace(/[\s-]+/g, '_')] ?? IMAGE_PROBLEM_DEFAULT)
  return `The current photo can’t be used: ${[...new Set(words)].join('; ')}.`
}
