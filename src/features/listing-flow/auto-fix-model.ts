/**
 * "Fixed for you": the auto-fix trail of one listing, as a pure model (unit tested).
 *
 * Contract: GET /issues?status=auto_fixed&listing_id=… (IssueOut). The backend closes each fix it
 * keeps as `status: auto_fixed` with a templated `action_taken` sentence and a `resolution`
 * (`deterministic_fix` for a code fix, `ai_correction` for an AI rewrite of the failed field). The
 * row carries the version it was found on, so the review shows the fixes of the version a person
 * approves. Nothing here invents a fix: every entry is one row the API returned.
 */
import type { Issue } from '@/features/inbox/model'
import { fieldLabel } from './format'

export interface AutoFix {
  id: string
  /** What was wrong, in plain words. */
  problem: string
  /** What Kuinn changed (the trail sentence). */
  change: string
  /** The field in plain words ("Title", "Bullet 3"). */
  field: string
  /** The raw path, for the tooltip. */
  fieldPath: string
  /** When it was fixed. */
  at: string
  /** An AI rewrite of the failed field, not a code fix. */
  rewritten: boolean
}

/** Said when a fix row has no trail sentence: true, and never a guess at what changed. */
export const NO_TRAIL_TEXT = 'Fixed on its own. No details were recorded.'

/**
 * The auto-fixed rows that belong to a version. A row with no version id is kept (it cannot be
 * placed, and hiding a fix from the reviewer is worse than showing one too many).
 */
export function autoFixedOn<T extends Pick<Issue, 'status' | 'listing_version_id'>>(issues: readonly T[], versionId: string | null | undefined): T[] {
  return issues.filter((i) => i.status === 'auto_fixed' && (!versionId || !i.listing_version_id || i.listing_version_id === versionId))
}

export function autoFixView(i: Issue): AutoFix {
  return {
    id: i.id,
    problem: i.plain_message?.trim() || i.message,
    change: i.action_taken?.trim() || NO_TRAIL_TEXT,
    field: fieldLabel(i.field_path),
    fieldPath: i.field_path,
    at: i.resolved_at ?? i.last_seen_at,
    rewritten: i.resolution === 'ai_correction',
  }
}

/** The trail for the version under review, newest first. */
export function autoFixTrail(issues: readonly Issue[], versionId: string | null | undefined): AutoFix[] {
  return autoFixedOn(issues, versionId)
    .map(autoFixView)
    .sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id))
}

/** "1 issue fixed for you", "2 issues fixed for you". */
export function fixedSummary(n: number): string {
  return `${n} ${n === 1 ? 'issue' : 'issues'} fixed for you`
}

/** "1 auto-fixed": the chip on a listing card. */
export const autoFixedChipText = (n: number) => `${n} auto-fixed`

/** The review section's anchor, so a chip elsewhere can open it. */
export const FIXED_FOR_YOU_HASH = 'fixed-for-you'
