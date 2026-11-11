/**
 * Lanes (SI11): who settles a problem. The backend labels every blocking issue (IssueOut.lane,
 * IssueOut.cause; AttemptFailureOut) and this file words it, the same on the Inbox, the issue
 * detail and the "What Kuinn did" timeline.
 *
 * Four groups the seller sees:
 *   Fixed for you   Kuinn's own lanes (a value-format repair, a text fix, an AI rewrite, a retry);
 *                   "Kuinn is fixing" while open. Once closed, "Fixed for you" only when Amazon
 *                   accepted the corrected version, or when the fix needed no resend (the listing
 *                   was never sent; a text fix also needs its approval). Otherwise a text fix reads
 *                   "Fix ready, needs approval" and a resent value fix "Resent, waiting for
 *                   Amazon". Without the listing's attempts the chip says only "Kuinn changed this".
 *   Needs you       a fact only the seller knows, or a photo
 *   Marketplace     only the marketplace can approve it (brand or category approval)
 *   Kuinn team      our team checks it
 * Truthful: only a value-format repair is sent again without a new approval; a text change waits
 * for a teammate who did not make it. A missing lane (an older API) returns null, and the caller
 * keeps today's label.
 */
import type { ChipStatus } from '@/components/la/status-chip'
import type { Schema } from '@/api/types'
import { mpName } from './format'

export type Lane = NonNullable<Schema<'IssueOut'>['lane']>
export type Cause = NonNullable<Schema<'IssueOut'>['cause']>
export type LaneGroup = 'kuinn' | 'seller' | 'marketplace' | 'staff'

export const LANE_GROUP: Record<Lane, LaneGroup> = {
  auto_repair: 'kuinn',
  auto_content: 'kuinn',
  ai_field: 'kuinn',
  retry: 'kuinn',
  seller: 'seller',
  marketplace: 'marketplace',
  staff: 'staff',
}

/** Where a closed Kuinn fix stands (fixState). */
export type FixState = 'confirmed' | 'needs_approval' | 'waiting' | 'unknown'

/** What fixState reads: the listing's attempts (resolution read) and whether its current version is approved. */
export interface FixContext {
  attempts: readonly { kind: string; at: string; outcome: string }[]
  /** The listing's current version is approved (approved_version_id === current_version_id). */
  approved: boolean
}

const ACCEPTED: ReadonlySet<string> = new Set(['accepted', 'partially_accepted', 'live'])
const TEXT_LANES: ReadonlySet<string> = new Set(['auto_content', 'ai_field'])

/**
 * A closed fix is confirmed only when a send at or after the fix was accepted, or when no send was
 * needed: the listing was never sent (and a text fix was approved). Null context means unknown.
 */
export function fixState(lane: string, fixedAt: string | null | undefined, ctx: FixContext | null | undefined): FixState {
  if (!ctx) return 'unknown'
  const at = fixedAt ? Date.parse(fixedAt) : Number.NaN
  const sends = ctx.attempts.filter((a) => a.kind === 'submission')
  const after = Number.isFinite(at) ? sends.filter((a) => Date.parse(a.at) >= at) : sends
  if (after.some((a) => ACCEPTED.has(a.outcome))) return 'confirmed'
  const text = TEXT_LANES.has(lane)
  if (after.length) return 'waiting'
  if (text) return !ctx.approved ? 'needs_approval' : sends.length ? 'waiting' : 'confirmed'
  // A value-format fix: before any send it needed no resend; after a send it waits for one.
  return sends.length ? 'waiting' : 'confirmed'
}

export interface LaneView {
  lane: Lane
  group: LaneGroup
  chip: { status: ChipStatus; label: string }
  /** One line: who does what next. */
  next: string
}

/** A lane we do not know yet (a newer API) is read as our team's: never as "fixed". */
const known = (lane: string): lane is Lane => lane in LANE_GROUP

export function laneView(
  lane: string | null | undefined,
  opts: { closed: boolean; marketplace: string; fix?: FixState },
): LaneView | null {
  if (!lane) return null
  const l: Lane = known(lane) ? lane : 'staff'
  const mp = mpName(opts.marketplace)
  const v = (status: ChipStatus, label: string, next: string): LaneView => ({ lane: l, group: LANE_GROUP[l], chip: { status, label }, next })
  if (opts.closed && LANE_GROUP[l] === 'kuinn') {
    const text = TEXT_LANES.has(l)
    switch (opts.fix ?? 'unknown') {
      case 'confirmed':
        return v('live', 'Fixed for you', text ? 'Kuinn fixed it and a teammate approved the new text.' : `Kuinn fixed it. It changed only how the value is sent to ${mp}.`)
      case 'needs_approval':
        return v('ready', 'Fix ready, needs approval', 'Kuinn changed the text. A teammate who did not make the change approves it, then it is sent.')
      case 'waiting':
        return v('working', `Resent, waiting for ${mp}`, `Kuinn sent the corrected listing to ${mp}. Waiting for ${mp} to accept it.`)
      case 'unknown':
        return v('draft', 'Kuinn changed this', `Kuinn changed this. Open the issue to see whether ${mp} accepted it.`)
    }
  }
  switch (l) {
    case 'auto_repair':
      return v('working', 'Kuinn is fixing', `Kuinn changes only how this value is sent to ${mp}, then sends it again. Your product facts stay the same.`)
    case 'auto_content':
      return v('working', 'Kuinn is fixing', 'Kuinn is fixing the text. A person approves the change before it is sent.')
    case 'ai_field':
      return v('working', 'Kuinn is rewriting', 'Kuinn is rewriting this field. A person approves the new text before it is sent.')
    case 'retry':
      return v('working', 'Trying again', `A temporary problem at ${mp}. Kuinn sends the same listing again.`)
    case 'seller':
      return v('needs-you', 'Needs you', 'Needs your answer. Kuinn fixes the listing once you answer.')
    case 'marketplace':
      return v('paused', 'Marketplace', `Only ${mp} can approve this. Follow the step in the task, then resume.`)
    case 'staff':
      return v('working', 'Kuinn team', 'Our team is checking this. Nothing is needed from you yet.')
  }
}

export function causeLabel(cause: string | null | undefined, marketplace: string): string | null {
  if (!cause) return null
  const mp = mpName(marketplace)
  switch (cause) {
    case 'seller_fact':
      return 'A product fact'
    case 'ai_content':
      return 'The listing text'
    case 'mapping':
      return `How the value is sent to ${mp}`
    case 'image':
      return 'A photo'
    case 'marketplace':
      return `${mp}'s own rules`
    default:
      return 'Not known yet'
  }
}
