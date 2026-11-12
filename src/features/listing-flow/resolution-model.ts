/**
 * "What Kuinn did": the resolution read of one listing as a pure model (unit tested).
 *
 * Contract: GET /listings/{id}/resolution (ResolutionOut, schemas 2.1.0). The backend decides the
 * state; this file only words it. Rules the copy keeps:
 *   - Only a data-format repair (lane `auto_repair`) is sent again without a new approval. A text
 *     change (a content fix or an AI rewrite) always waits for a teammate who did not make it.
 *   - "Fixed for you" is said only once the marketplace accepted the resend that carried the fix.
 *   - "Live" is said only when the marketplace reports the listing live.
 *   - Nothing is invented: every step, change and question is one row the API returned.
 */
import type { Schema } from '@/api/types'
import { fieldLabel, mpName } from './format'

export type Resolution = Schema<'ResolutionOut'>
export type Attempt = Schema<'AttemptOut'>
export type AttemptFailure = Schema<'AttemptFailureOut'>
export type Change = Schema<'ChangeOut'>
export type ResolutionState = Resolution['state']
export type Lane = AttemptFailure['lane']
export type Cause = AttemptFailure['cause']

/** The calm tone of the headline: the same five tones as Banner. */
export type ResolutionTone = 'neutral' | 'working' | 'success' | 'attention' | 'danger'

/** What the one button under the headline does. */
export type ResolutionAction =
  | { kind: 'none' }
  /** Approve the fix version, then send it (review screen only, maker-checker decides who sees it). */
  | { kind: 'approve' }
  /** Open the seller's question(s) in the Inbox. */
  | { kind: 'answer'; taskId: string | null }
  /** Open the marketplace step in the Inbox; closing that task resumes publishing. */
  | { kind: 'marketplace'; taskId: string | null }
  /** Kuinn stopped: change the listing (edit or generate again) to try again. */
  | { kind: 'change' }
  /** The answers are saved: generate the listing again to use them. */
  | { kind: 'regenerate' }
  /** The marketplace refused the barcode or the GTIN exemption: back to the product's barcode choice. */
  | { kind: 'edit_identifier' }

export interface ResolutionHeadline {
  state: ResolutionState
  title: string
  line: string
  tone: ResolutionTone
  /** Polled while true: Kuinn or the marketplace is still working. */
  working: boolean
}

export interface StepItem {
  field: string
  /** The raw path, for the tooltip. */
  fieldPath: string
  text: string
}

export interface StepChange extends StepItem {
  kind: Change['kind']
  /** An AI rewrite of the field (shows the "Rewritten by the agent" badge). */
  rewritten: boolean
}

export interface StepFailure extends StepItem {
  lane: Lane
  cause: Cause
  code: string | null
}

export interface ResolutionStep {
  key: string
  /** "Pre-check", "Sent 1", "Sent 2 by Kuinn". */
  title: string
  /** "Version 2 · 10:42" is built by the view; here only the parts. */
  version: number
  at: string
  byKuinn: boolean
  outcome: { label: string; tone: 'ok' | 'now' | 'need' | 'bad' | 'todo' }
  /** What the marketplace said (every failure on this attempt). */
  said: StepFailure[]
  /** What Kuinn changed after this attempt. */
  changed: StepChange[]
  /** The heading over `changed`: "Fixed for you" only once the resend that carried it was accepted. */
  changedTitle: string
  /** The failures only the seller can settle. */
  needsYou: StepFailure[]
  /** The failures only the marketplace can settle. */
  needsMarketplace: StepFailure[]
}

export interface ResolutionView {
  headline: ResolutionHeadline
  /** "2 of 3 automatic tries", or null before the first automatic try. */
  triesText: string | null
  /** Oldest first: Pre-check, Sent 1, Sent 2. */
  steps: ResolutionStep[]
  action: ResolutionAction
  /** The backend's own next-step sentence, when it sent one. */
  nextText: string | null
}

/** States the backend is still working in: the read is polled while one holds. */
export const WORKING_STATES: ReadonlySet<string> = new Set(['checking', 'fixing', 'resubmitted'])

const ACCEPTED: ReadonlySet<Attempt['outcome']> = new Set(['accepted', 'partially_accepted', 'live'])

/** Kuinn's own resend that the marketplace accepted: the only time "Fixed for you" is said. */
export function resendAccepted(attempts: readonly Attempt[]): boolean {
  const latest = attempts[0]
  return !!latest && latest.kind === 'submission' && latest.actor === 'system' && ACCEPTED.has(latest.outcome)
}

export interface HeadlineContext {
  marketplace: string
  /** The listing's own marketplace state: "Live" needs the marketplace to say so. */
  marketplaceState?: string | null
  /** Whether the viewer may answer questions (product:import). Reviewers may not. */
  canAnswer?: boolean
  /** Amazon publishing is switched off: approving a fix sends nothing (publishGate). */
  publishingPaused?: boolean
  /** Item 17: the viewer may approve it themselves (useOwnerMayApproveOwn): never ask for a teammate. */
  ownApproval?: boolean
}

export function resolutionHeadline(r: Pick<Resolution, 'state' | 'attempts' | 'cycles_used' | 'max_cycles'>, ctx: HeadlineContext): ResolutionHeadline {
  const mp = mpName(ctx.marketplace)
  const attempts = r.attempts ?? []
  const max = r.max_cycles ?? 3
  const h = (title: string, line: string, tone: ResolutionTone, working = false): ResolutionHeadline => ({ state: r.state, title, line, tone, working })
  switch (r.state) {
    case 'checking':
      return h(`Checking with ${mp}`, `Kuinn asked ${mp} to check this version. Nothing is published by this check.`, 'working', true)
    case 'fixing':
      return h('Kuinn is fixing this', `Kuinn found a problem it can fix and is working on it. This page updates on its own.`, 'working', true)
    case 'resubmitted':
      return resendAccepted(attempts)
        ? h('Fixed for you', `Kuinn changed how a value is sent, and ${mp} accepted the resend. Your product facts and text stayed the same.`, 'success', true)
        : h(`Sent again to ${mp}`, `Kuinn changed how a value is sent and sent it again. Your product facts and text stayed the same.`, 'working', true)
    case 'fix_ready': {
      const who = ctx.ownApproval ? 'You can approve it' : 'A teammate who did not make the change approves it'
      return ctx.publishingPaused
        ? h('Fix ready to approve', `Kuinn changed the text. ${who}. Publishing to Amazon is paused for now, so nothing is sent.`, 'attention')
        : h('Fix ready: approve to resend', `Kuinn changed the text. ${who}, then it is sent again.`, 'attention')
    }
    case 'needs_you':
      return ctx.canAnswer === false
        ? h('Needs an answer', 'Kuinn needs an answer from an operator or owner before it can fix the listing.', 'attention')
        : h('Needs you', 'Kuinn needs an answer from you before it can fix the listing.', 'attention')
    case 'needs_marketplace':
      return h(`Needs ${mp} approval`, `${mp} must approve this brand or category first. Follow the step in the task, then resume.`, 'attention')
    case 'stopped':
      return (r.cycles_used ?? 0) >= max
        ? h(`Stopped after ${max} tries`, 'Kuinn will not send it again on its own. Change the listing or answer the open question to try again.', 'danger')
        : h('Kuinn stopped', 'Kuinn could not fix this on its own. Change the listing or generate it again to try again.', 'danger')
    case 'live':
      if (ctx.marketplaceState === 'live') return h('Live', `${mp} reports the listing live.`, 'success')
      if (ctx.marketplaceState === 'inactive') return h(`On ${mp}, not buyable yet`, `${mp} has the product page but is not selling it yet. Kuinn's part is done.`, 'neutral')
      return h(`Sent to ${mp}`, `Waiting for ${mp} to confirm. Live is shown only once ${mp} says so.`, 'neutral')
    case 'idle':
    default:
      return h('Nothing to do right now', 'Kuinn has nothing to fix on this listing.', 'neutral')
  }
}

/** "2 of 3 automatic tries"; null before the first automatic try. */
export function triesText(r: Pick<Resolution, 'cycles_used' | 'max_cycles'>): string | null {
  const used = r.cycles_used ?? 0
  if (used <= 0) return null
  const max = r.max_cycles ?? 3
  return `${Math.min(used, max)} of ${max} automatic tries`
}

const OUTCOME: Record<Attempt['outcome'], (mp: string) => ResolutionStep['outcome']> = {
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

function outcomeOf(outcome: string, mp: string): ResolutionStep['outcome'] {
  return (OUTCOME as Record<string, ((mp: string) => ResolutionStep['outcome']) | undefined>)[outcome]?.(mp) ?? { label: 'Unknown', tone: 'todo' }
}

const failure = (f: AttemptFailure): StepFailure => ({
  field: fieldLabel(f.field),
  fieldPath: f.field,
  text: f.message,
  lane: f.lane,
  cause: f.cause,
  code: f.marketplace_code ?? null,
})

const change = (c: Change): StepChange => ({
  field: fieldLabel(c.field),
  fieldPath: c.field,
  text: c.summary,
  kind: c.kind,
  rewritten: c.kind === 'ai_correction',
})

/**
 * The steps, oldest first. A change belongs to the attempt it followed; the next attempt carried it,
 * so "Fixed for you" heads the changes only when that next attempt is Kuinn's own accepted resend.
 */
export function resolutionSteps(attemptsNewestFirst: readonly Attempt[], marketplace: string): ResolutionStep[] {
  const mp = mpName(marketplace)
  const oldestFirst = [...attemptsNewestFirst].reverse()
  return oldestFirst.map((a, i) => {
    const next = oldestFirst[i + 1]
    const said = (a.failed ?? []).map(failure)
    const changed = (a.changed ?? []).map(change)
    const carried = next && next.kind === 'submission' && ACCEPTED.has(next.outcome)
    const allRepairs = changed.length > 0 && changed.every((c) => c.kind === 'repair')
    // A seller's answer is a change the seller made, not Kuinn.
    const byYou = changed.some((c) => c.kind === 'seller_answer')
    const changedTitle =
      carried && allRepairs && next.actor === 'system'
        ? 'Fixed for you'
        : byYou
          ? next
            ? 'What changed'
            : 'What changed, not sent yet'
          : next
            ? 'What Kuinn changed'
            : 'What Kuinn changed, not sent yet'
    const byKuinn = a.kind === 'submission' && a.actor === 'system'
    return {
      key: `${a.kind}:${a.number}:${a.version}:${a.at}`,
      title: a.kind === 'precheck' ? 'Pre-check' : `Sent ${a.number}${byKuinn ? ' by Kuinn' : ''}`,
      version: a.version,
      at: a.at,
      byKuinn,
      outcome: outcomeOf(a.outcome, mp),
      said,
      changed,
      changedTitle,
      needsYou: said.filter((f) => f.lane === 'seller'),
      needsMarketplace: said.filter((f) => f.lane === 'marketplace'),
    }
  })
}

export function resolutionAction(r: Pick<Resolution, 'state' | 'next_step'>): ResolutionAction {
  const first = r.next_step?.task_ids?.[0] ?? null
  switch (r.next_step?.kind) {
    case 'approve':
      return { kind: 'approve' }
    case 'answer':
      return { kind: 'answer', taskId: first }
    case 'marketplace':
      return { kind: 'marketplace', taskId: first }
    case 'resume':
      return first ? { kind: 'answer', taskId: first } : { kind: 'change' }
    case 'regenerate':
      return { kind: 'regenerate' }
    case 'edit_identifier':
      return { kind: 'edit_identifier' }
    default:
      return { kind: 'none' }
  }
}

export function resolutionView(r: Resolution, ctx: HeadlineContext): ResolutionView {
  const action = resolutionAction(r)
  // "What needs you" only while a question is still open: an answered one is not work.
  const open = action.kind === 'answer' || r.state === 'needs_you'
  return {
    headline: resolutionHeadline(r, ctx),
    triesText: triesText(r),
    steps: resolutionSteps(r.attempts ?? [], ctx.marketplace).map((st) => (open ? st : { ...st, needsYou: [] })),
    action,
    nextText: r.next_step?.text?.trim() || null,
  }
}

/** Whether the card is worth showing: a state that says something, or at least one step. */
export function hasResolution(r: Pick<Resolution, 'state' | 'attempts'> | null | undefined): boolean {
  if (!r) return false
  return r.state !== 'idle' || (r.attempts?.length ?? 0) > 0
}

/** The listing was sent before: approving it now is a resend. */
export function wasSent(r: Pick<Resolution, 'attempts'> | null | undefined): boolean {
  return (r?.attempts ?? []).some((a) => a.kind === 'submission')
}
