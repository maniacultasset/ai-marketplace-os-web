/**
 * "Issues and fixes" (client feedback item 20): the issue history read of one listing as a pure
 * model (unit tested).
 *
 * Contract: GET /listings/{id}/issue-history (IssueHistoryOut, schemas 2.1.0). The backend decides
 * who handles each issue; this file only groups and words it. Rules the copy keeps:
 *   - "Kuinn's fixes" lists only a fix the API returned, with its before and after values. Its
 *     outcome says what the marketplace did with it; "accepted" (and "fixed" in the summary) only
 *     when the marketplace accepted the send that carried it. A refused or unsent fix says so.
 *   - "Kuinn is fixing" lists Kuinn's open work with no fix yet (a repair or resend under way).
 *   - "Needs you" lists open issues the seller settles in Kuinn; "On the marketplace side" lists
 *     open issues settled outside Kuinn (a marketplace approval, a Seller Hub setting, an outage).
 *   - Kuinn's own open work and its team's checks are said as such, never as fixed.
 *   - Nothing is invented: every line is one row the API returned.
 */
import type { Schema } from '@/api/types'
import { fieldLabel, mpName } from './format'

export type IssueHistory = Schema<'IssueHistoryOut'>
export type HistoryIssue = Schema<'HistoryIssueOut'>
export type Fix = Schema<'FixOut'>
export type HistoryAttempt = Schema<'HistoryAttemptOut'>
export type Handler = HistoryIssue['handler']
export type ErrorGroup = HistoryIssue['group']
export type FixOutcome = Fix['outcome']

export type Tone = 'ok' | 'now' | 'need' | 'bad' | 'todo'

/** The client's error taxonomy, in short plain words. */
export const GROUP_LABEL: Record<ErrorGroup, string> = {
  content_data: 'Content or data',
  missing_attribute: 'Missing detail',
  image: 'Photo',
  identifier_exemption: 'Barcode or exemption',
  category_mismatch: 'Category',
  account_permission: 'Account approval',
  marketplace_system: 'Marketplace system',
  unknown: 'Not known yet',
}

const OUTCOME: Record<FixOutcome, (mp: string) => { label: string; tone: Tone }> = {
  waiting: () => ({ label: 'Not sent yet', tone: 'todo' }),
  sent: (mp) => ({ label: `Sent, waiting for ${mp}`, tone: 'now' }),
  accepted: (mp) => ({ label: `${mp} accepted it`, tone: 'ok' }),
  refused: (mp) => ({ label: `${mp} refused it again`, tone: 'bad' }),
  replaced: () => ({ label: 'Replaced by a newer value', tone: 'todo' }),
}

export function fixOutcome(outcome: string, marketplace: string): { label: string; tone: Tone } {
  const mp = mpName(marketplace)
  return (OUTCOME as Record<string, ((mp: string) => { label: string; tone: Tone }) | undefined>)[outcome]?.(mp) ?? { label: 'Unknown', tone: 'todo' }
}

export interface IssueLine {
  id: string
  field: string
  /** The raw path, for the tooltip and the review link. */
  fieldPath: string
  cause: string
  action: string | null
  group: string
  code: string | null
  /** The marketplace's own words, shown on disclosure. */
  said: string | null
  sent: string | null
  open: boolean
  occurrences: number
  lastSeen: string
}

export interface FixLine {
  id: string
  field: string
  fieldPath: string
  kind: Fix['kind']
  before: string | null
  after: string | null
  reason: string
  outcome: { label: string; tone: Tone }
  /** The API's outcome, for the summary's counts. */
  result: FixOutcome
  at: string
  /** The issue that made Kuinn fix it, when the API linked one. */
  issue: IssueLine | null
}

export interface HistoryStep {
  key: string
  title: string
  version: number
  at: string
  outcome: { label: string; tone: Tone }
  issues: IssueLine[]
  fixes: FixLine[]
}

export interface IssueHistoryView {
  /** Kuinn's fixes, newest first. */
  fixed: FixLine[]
  /**
   * Client item 20: the fixes Kuinn only suggests (the brand's automatic fixes are off), newest
   * first. They wait for the seller's "Apply fixes"; their issues are not listed again.
   */
  suggested: FixLine[]
  /** Open issues Kuinn is still working on (no fix yet, or the fix is not confirmed). */
  fixing: IssueLine[]
  needsYou: IssueLine[]
  marketplace: IssueLine[]
  /** Open issues Kuinn's team is checking. */
  team: IssueLine[]
  /** Every attempt, oldest first, with the issues it raised and the fixes made after it. */
  steps: HistoryStep[]
  /** One calm line for the header. */
  summary: string
  empty: boolean
}

const line = (i: HistoryIssue): IssueLine => ({
  id: i.id,
  field: fieldLabel(i.field),
  fieldPath: i.field,
  cause: i.cause,
  action: i.action ?? null,
  group: GROUP_LABEL[i.group] ?? GROUP_LABEL.unknown,
  code: i.marketplace_code ?? null,
  said: i.marketplace_message ?? null,
  sent: i.value_submitted ?? null,
  open: i.status === 'open',
  occurrences: i.occurrences,
  lastSeen: i.last_seen_at,
})

const ATTEMPT_OUTCOME: Record<string, (mp: string) => { label: string; tone: Tone }> = {
  clean: () => ({ label: 'Passed', tone: 'ok' }),
  issues: (mp) => ({ label: `${mp} found issues`, tone: 'bad' }),
  failed: () => ({ label: 'Check did not finish', tone: 'bad' }),
  pending: (mp) => ({ label: `Waiting for ${mp}`, tone: 'now' }),
  accepted: () => ({ label: 'Accepted', tone: 'ok' }),
  partially_accepted: () => ({ label: 'Partly accepted', tone: 'need' }),
  rejected: () => ({ label: 'Refused', tone: 'bad' }),
  error: () => ({ label: 'Did not go through', tone: 'bad' }),
  live: () => ({ label: 'Live', tone: 'ok' }),
  superseded: () => ({ label: 'Replaced by a newer try', tone: 'todo' }),
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

export function summaryLine(
  v: Pick<IssueHistoryView, 'fixing' | 'needsYou' | 'marketplace' | 'team'> & { fixed: readonly Pick<FixLine, 'result'>[]; suggested?: readonly unknown[] },
  marketplace: string,
): string {
  const mp = mpName(marketplace)
  const parts: string[] = []
  const suggested = v.suggested?.length ?? 0
  if (suggested) parts.push(`${plural(suggested, 'suggested fix waits', 'suggested fixes wait')} for you`)
  const fixes = (...results: FixOutcome[]) => v.fixed.filter((f) => results.includes(f.result)).length
  const accepted = fixes('accepted')
  const refused = fixes('refused')
  const unconfirmed = fixes('waiting', 'sent')
  if (v.needsYou.length) parts.push(`${plural(v.needsYou.length, 'needs', 'need')} you`)
  if (v.marketplace.length) parts.push(`${v.marketplace.length} on ${mp}'s side`)
  if (v.fixing.length) parts.push(`${v.fixing.length} Kuinn is fixing`)
  if (v.team.length) parts.push(`${v.team.length} with Kuinn's team`)
  if (accepted) parts.push(`${accepted} fixed by Kuinn`)
  if (refused) parts.push(`${plural(refused, 'Kuinn fix', 'Kuinn fixes')} refused`)
  if (unconfirmed) parts.push(`${plural(unconfirmed, 'Kuinn fix', 'Kuinn fixes')} not confirmed yet`)
  if (!parts.length) return `No open issues from ${mp}.`
  return `${parts.join(' · ')}.`
}

export function issueHistoryView(h: IssueHistory, marketplace: string): IssueHistoryView {
  const mp = mpName(marketplace)
  const issues = h.issues ?? []
  const lines = new Map(issues.map((i) => [i.id, line(i)]))
  const all: (FixLine & { suggestion: boolean })[] = (h.fixes ?? []).map((f) => ({
    id: f.id,
    field: fieldLabel(f.field),
    fieldPath: f.field,
    kind: f.kind,
    before: f.before ?? null,
    after: f.after ?? null,
    reason: f.reason,
    outcome: fixOutcome(f.outcome, marketplace),
    result: f.outcome,
    at: f.at,
    issue: f.issue_id ? (lines.get(f.issue_id) ?? null) : null,
    suggestion: f.suggested === true,
  }))
  const strip = ({ suggestion: _s, ...rest }: FixLine & { suggestion: boolean }): FixLine => rest
  const fixed = all.filter((f) => !f.suggestion).map(strip)
  const suggested = all.filter((f) => f.suggestion).map(strip)
  const suggestedIssueIds = new Set(suggested.map((f) => f.issue?.id).filter(Boolean))
  const open = issues.filter((i) => i.status === 'open')
  const by = (handler: Handler) => open.filter((i) => i.handler === handler).map(line)
  const fixedIssueIds = new Set(fixed.map((f) => f.issue?.id).filter(Boolean))
  // An open Kuinn row that already has a fix shows under its fix, not twice.
  const fixing = by('kuinn').filter((i) => !fixedIssueIds.has(i.id))
  const fixesById = new Map(fixed.map((f) => [f.id, f]))
  const steps: HistoryStep[] = [...(h.attempts ?? [])].reverse().map((a) => {
    const byKuinn = a.kind === 'submission' && a.actor === 'system'
    const outcome = ATTEMPT_OUTCOME[a.outcome]?.(mp) ?? { label: 'Unknown', tone: 'todo' as const }
    return {
      key: `${a.kind}:${a.number}:${a.version}:${a.at}`,
      title: a.kind === 'precheck' ? 'Pre-check' : `Sent ${a.number}${byKuinn ? ' by Kuinn' : ''}`,
      version: a.version,
      at: a.at,
      outcome,
      issues: (a.issue_ids ?? []).map((id) => lines.get(id)).filter((x): x is IssueLine => !!x),
      fixes: (a.fix_ids ?? []).map((id) => fixesById.get(id)).filter((x): x is FixLine => !!x),
    }
  })
  const view = {
    fixed,
    suggested,
    fixing,
    // an issue with a suggested fix shows under its suggestion, not twice
    needsYou: by('you').filter((i) => !suggestedIssueIds.has(i.id)),
    marketplace: by('marketplace'),
    team: by('staff'),
    steps,
  }
  return {
    ...view,
    summary: summaryLine(view, marketplace),
    empty: issues.length === 0 && fixed.length === 0 && suggested.length === 0,
  }
}

/** Whether the card is worth showing: at least one marketplace issue or one fix. */
export function hasIssueHistory(h: IssueHistory | null | undefined): h is IssueHistory {
  return !!h && ((h.issues?.length ?? 0) > 0 || (h.fixes?.length ?? 0) > 0)
}

/** "Kuinn's fixes" wording per kind: a value repair goes out on its own, a text change waits for approval. */
export function fixKindLabel(kind: Fix['kind']): string {
  switch (kind) {
    case 'repair':
      return 'Value format'
    case 'content_fix':
      return 'Text fix'
    case 'ai_correction':
      return 'Rewritten by the agent'
  }
}
