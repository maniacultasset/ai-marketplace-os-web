/**
 * Lanes (SI11): who settles a problem. The backend labels every blocking issue (IssueOut.lane,
 * IssueOut.cause; AttemptFailureOut) and this file words it, the same on the Inbox, the issue
 * detail and the "What Kuinn did" timeline.
 *
 * Four groups the seller sees:
 *   Fixed for you   Kuinn's own lanes (a value-format repair, a text fix, an AI rewrite, a retry);
 *                   "Fixed for you" only once the issue is closed, "Kuinn is fixing" while open
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

export interface LaneView {
  lane: Lane
  group: LaneGroup
  chip: { status: ChipStatus; label: string }
  /** One line: who does what next. */
  next: string
}

/** A lane we do not know yet (a newer API) is read as our team's: never as "fixed". */
const known = (lane: string): lane is Lane => lane in LANE_GROUP

export function laneView(lane: string | null | undefined, opts: { closed: boolean; marketplace: string }): LaneView | null {
  if (!lane) return null
  const l: Lane = known(lane) ? lane : 'staff'
  const mp = mpName(opts.marketplace)
  const v = (status: ChipStatus, label: string, next: string): LaneView => ({ lane: l, group: LANE_GROUP[l], chip: { status, label }, next })
  if (opts.closed && LANE_GROUP[l] === 'kuinn') {
    if (l === 'auto_repair' || l === 'retry') return v('live', 'Fixed for you', `Kuinn fixed it. It changed only how the value is sent to ${mp}.`)
    return v('live', 'Fixed for you', 'Kuinn fixed it. A teammate approves the new text before it is sent.')
  }
  switch (l) {
    case 'auto_repair':
      return v('working', 'Kuinn is fixing', `Kuinn changes only how this value is sent to ${mp}, then sends it again. Your product facts stay the same.`)
    case 'auto_content':
      return v('working', 'Kuinn is fixing', 'Kuinn is fixing the text. A teammate approves the change before it is sent.')
    case 'ai_field':
      return v('working', 'Kuinn is rewriting', 'Kuinn is rewriting this field. A teammate approves the new text before it is sent.')
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
