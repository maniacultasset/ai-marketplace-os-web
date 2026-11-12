/**
 * Lane F1 (client Chrome pass 2, B12, B14, B15): the gate panel reads one set of blockers for the
 * current version, the one `rollUpGates` builds (the rules check, the marketplace preview and the
 * open stored issues). Every line of the panel counts from it:
 *   - the footer's "N blocking, M warnings" (it read the rules run's own `blocking_count`, so it
 *     said "0 blocking" while the gates said "3 must fix": the marketplace check and the photo
 *     checks are not in that run);
 *   - each gate row's count and its details (a row said "5 blocking issues, See 3 findings": the
 *     link counted the rules findings listed below only, and Media and Commercial, which come
 *     from stored issues, had none);
 *   - an open question that blocks the listing (status `blocked/human_task_open`) is a blocking
 *     reason of its own, never "Nothing blocks approval in the checks that ran".
 */
import type { Task } from '@/features/inbox/model'
import type { Listing } from '@/features/listings/model'
import type { ErrorItem, GateResult } from './gates'
import { isRecommendation } from './recommended'

/** The findings a gate row lists: blocking first, then warnings; recommendations are apart. */
export function gateRowFindings(gate: Pick<GateResult, 'findings'>): ErrorItem[] {
  const blocking = gate.findings.filter((f) => f.severity === 'error')
  const warnings = gate.findings.filter((f) => f.severity !== 'error' && !isRecommendation(f))
  return [...blocking, ...warnings]
}

/**
 * The row's "show" link, in the row note's own count: a blocked row says "5 blocking issues", so
 * its link never says "Show all 7" when 2 of the 7 are warnings ("Show all 5 and 2 warnings").
 */
export function gateDetailsLabel(findings: readonly Pick<ErrorItem, 'severity'>[]): string {
  if (findings.length === 1) return 'Show it'
  const errors = findings.filter((f) => f.severity === 'error').length
  const warnings = findings.length - errors
  if (errors && warnings) return `Show ${errors === 1 ? 'it' : `all ${errors}`} and ${warnings} ${warnings === 1 ? 'warning' : 'warnings'}`
  return `Show all ${findings.length}`
}

/**
 * The footer's totals over the same gates: each finding sits in one gate, so the sum is the
 * number of blockers the rows list. A gate blocked with no finding (no image, a marketplace
 * refusal) is one blocker.
 */
export function gateTotals(gates: readonly GateResult[]): { blocking: number; warnings: number } {
  let blocking = 0
  let warnings = 0
  for (const g of gates) {
    const errors = g.findings.filter((f) => f.severity === 'error').length
    blocking += errors || (g.state === 'blocked' ? 1 : 0)
    warnings += g.findings.filter((f) => f.severity !== 'error' && !isRecommendation(f)).length
  }
  return { blocking, warnings }
}

/**
 * The open questions that keep this listing blocked (`blocked/human_task_open`): the product's
 * open tasks, a non-blocking one (a photo question) left out. Empty for any other status, and
 * while the tasks are unread.
 */
export function blockingQuestions(
  listing: Pick<Listing, 'status' | 'status_reason' | 'product_id'>,
  tasks: readonly Pick<Task, 'id' | 'product_id' | 'status' | 'question' | 'blocking'>[] | undefined,
): Pick<Task, 'id' | 'question'>[] {
  if (listing.status !== 'blocked' || listing.status_reason !== 'human_task_open' || !tasks) return []
  return tasks.filter((t) => t.product_id === listing.product_id && t.status === 'open' && t.blocking !== false)
}
