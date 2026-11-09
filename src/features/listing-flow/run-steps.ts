/**
 * Agent run progress (hi-fi p12). The backend has no product run (analysis plan: `product_runs`
 * missing), so the steps are derived from the real state we have, never a fake progress bar:
 *
 *   - the job (GET /jobs/{id}): `kind`, `status`, `stage` (PipelineStage, generation only);
 *   - the listing (GET /listings/{id}): `status`, `status_reason`, `marketplace_state`.
 *
 * The design's eight seller stages become the six the backend can prove. "Classified" and
 * "Mapped to N marketplaces" are left out: the category is seller input today (C-8) and mapping is
 * an adapter step with no event. "Waiting for your approval" is the step the design does not show
 * yet (Appendix A, p12): approval is always on in v1.
 */
import type { JobEnvelope } from '@/api/types'
import type { Listing } from '@/features/listings/model'

export type StepId = 'understand' | 'write' | 'check' | 'approve' | 'submit' | 'live'
export type StepState = 'done' | 'now' | 'todo' | 'failed' | 'needs-you'

export interface RunStep {
  id: StepId
  label: string
  state: StepState
  sub?: string
}

/** Each step reads as a task until it is done, then in the past tense (never "Wrote…" while writing). */
export const STEP_LABEL: Record<StepId, { todo: string; done: string }> = {
  understand: { todo: 'Understand the product', done: 'Understood the product' },
  write: { todo: 'Write titles and bullets', done: 'Wrote titles and bullets' },
  check: { todo: 'Check against the rules', done: 'Checked against the rules' },
  approve: { todo: 'Your approval', done: 'Approved' },
  submit: { todo: 'Send to the marketplace', done: 'Sent' },
  live: { todo: 'Confirm live', done: 'Confirmed live' },
}

const stepLabel = (id: StepId, state: StepState) => (state === 'done' ? STEP_LABEL[id].done : STEP_LABEL[id].todo)

const ORDER: readonly StepId[] = ['understand', 'write', 'check', 'approve', 'submit', 'live']

type Stage = NonNullable<JobEnvelope['stage']>

export const STAGE_STEP: Record<Stage, StepId> = {
  load_context: 'understand',
  retrieve_brand: 'understand',
  content_agent: 'write',
  keyword_agent: 'write',
  attribute_agent: 'write',
  image_agent: 'write',
  merge_outputs: 'write',
  validate_schema: 'check',
  validate_rules: 'check',
  validate_vision: 'check',
  correct: 'check',
  quality_check: 'check',
}

export const STAGE_SUB: Record<Stage, string> = {
  load_context: 'Reading the product record…',
  retrieve_brand: 'Reading your brand guidelines…',
  content_agent: 'Writing the title, bullets and description…',
  keyword_agent: 'Choosing search terms…',
  attribute_agent: 'Filling attributes…',
  image_agent: 'Checking images…',
  merge_outputs: 'Putting the listing together…',
  validate_schema: 'Checking the structure…',
  validate_rules: 'Running the marketplace rules…',
  validate_vision: 'Checking images…',
  correct: 'Fixing what the checks found…',
  quality_check: 'Final quality check…',
}

export interface RunInput {
  job: Pick<JobEnvelope, 'kind' | 'status' | 'stage'> | null | undefined
  listing: Pick<Listing, 'status' | 'status_reason' | 'marketplace_state' | 'marketplace'> | null | undefined
  validation?: { blocking: number; warnings: number } | null
  /**
   * proof.ts said Live: marketplace state, listing ID and confirmation time all held. Without it a
   * `marketplace_state` of live is the marketplace's word only, and the last step stays open.
   */
  liveConfirmed?: boolean
  /** Amazon publishing is switched off (publishGate): an approved listing is not sent. */
  publishingPaused?: boolean
}

const MP: Record<string, string> = { amazon: 'Amazon', flipkart: 'Flipkart' }

/** Steps before `id` done, `id` in `state`, the rest todo. */
function upTo(id: StepId, state: StepState, sub?: string): RunStep[] {
  const at = ORDER.indexOf(id)
  return ORDER.map((s, i) => {
    const st: StepState = i < at ? 'done' : i === at ? state : 'todo'
    return { id: s, label: stepLabel(s, st), state: st, sub: i === at ? sub : undefined }
  })
}

const ACTIVE = new Set(['queued', 'running'])
const ENDED_BAD = new Set(['failed', 'dead_letter', 'cancelled'])

export function runSteps({ job, listing, validation, liveConfirmed = false, publishingPaused = false }: RunInput): RunStep[] {
  const mp = listing ? (MP[listing.marketplace] ?? listing.marketplace) : ''
  const genJob = job?.kind === 'listing_generate' ? job : null
  const checkSub = validation
    ? validation.blocking
      ? `${validation.blocking} blocking issue${validation.blocking === 1 ? '' : 's'} found`
      : validation.warnings
        ? `${validation.warnings} warning${validation.warnings === 1 ? '' : 's'} to read`
        : 'Every check passed'
    : undefined

  // A generation job in flight (or one that just ended badly) is the most precise signal.
  if (genJob && (ACTIVE.has(genJob.status) || (listing?.status === 'generating' && !ENDED_BAD.has(genJob.status)))) {
    if (genJob.status === 'queued') return upTo('understand', 'now', 'Waiting for a worker…')
    const stage = genJob.stage
    return stage ? upTo(STAGE_STEP[stage], 'now', STAGE_SUB[stage]) : upTo('understand', 'now', 'Starting…')
  }
  if (genJob && ENDED_BAD.has(genJob.status) && listing?.status !== 'validated' && listing?.status !== 'needs_review') {
    const at = genJob.stage ? STAGE_STEP[genJob.stage] : 'understand'
    return upTo(at, 'failed', genJob.status === 'cancelled' ? 'Cancelled before it finished' : 'This step failed')
  }

  if (!listing) return upTo('understand', 'todo')
  const reason = listing.status_reason ?? null
  const ms = listing.marketplace_state

  switch (listing.status) {
    case 'created':
      return upTo('understand', 'todo')
    case 'generating':
      return upTo('understand', 'now', 'Starting…')
    case 'validated':
      return withSub(upTo('approve', 'now', 'Ready for a reviewer'), 'check', checkSub)
    case 'needs_review':
      return withSub(upTo('approve', 'needs-you', 'Read the warnings, then approve'), 'check', checkSub)
    case 'approved':
      // The done label already says "Approved"; a sub would repeat it. Paused: say why nothing is sent.
      return upTo('submit', 'todo', publishingPaused ? 'Publishing paused' : undefined)
    case 'publishing':
      return upTo('submit', 'now', `Sending to ${mp}…`)
    case 'published':
      if (ms === 'live' && liveConfirmed)
        return ORDER.map((s) => ({ id: s, label: stepLabel(s, 'done'), state: 'done' as const, sub: s === 'live' ? `${mp} confirmed it` : undefined }))
      if (ms === 'live') return upTo('live', 'now', `${mp} reports it live. We can’t confirm it yet`)
      if (ms === 'partially_live') return upTo('live', 'needs-you', 'Some variants are not live')
      if (ms === 'rejected') return upTo('submit', 'failed', `${mp} rejected it`)
      if (ms === 'inactive' || ms === 'removed') return upTo('live', 'failed', `${mp} reports it ${ms}`)
      return upTo('live', 'now', `Waiting for ${mp} to confirm…`)
    case 'blocked':
      if (reason === 'rejected') return upTo('approve', 'needs-you', 'Sent back by a reviewer')
      if (reason === 'marketplace_action_required') return upTo('submit', 'needs-you', `${mp} needs an action`)
      if (reason === 'publish_attempts_exhausted') return upTo('submit', 'failed', 'All publish attempts used')
      return upTo('check', 'needs-you', checkSub ?? 'The checks found blocking issues')
    case 'failed':
      if (reason === 'generation_failed') return upTo(genJob?.stage ? STAGE_STEP[genJob.stage] : 'write', 'failed', 'Generation failed')
      if (reason === 'publish_partial') return upTo('submit', 'failed', 'Some fields were not accepted')
      if (reason === 'marketplace_rejected') return upTo('submit', 'failed', `${mp} rejected it`)
      return upTo('submit', 'failed', 'Publishing failed')
  }
}

function withSub(steps: RunStep[], id: StepId, sub: string | undefined): RunStep[] {
  return sub ? steps.map((s) => (s.id === id ? { ...s, sub } : s)) : steps
}

/**
 * Steps whose 'now' means someone other than the agent has the next move: a person approving, or
 * the marketplace confirming. The run is waiting then, not working.
 */
const WAITING_STEPS: ReadonlySet<StepId> = new Set(['approve', 'live'])

/** The header chip word for a run: Working only while the agent itself has work in flight. */
export function runIsActive(input: RunInput): boolean {
  return runSteps(input).some((s) => s.state === 'now' && !WAITING_STEPS.has(s.id))
}
