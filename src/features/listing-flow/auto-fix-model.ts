/**
 * "Fixed for you": the auto-fix trail of one listing, as a pure model (unit tested).
 *
 * Contract: GET /issues?listing_id=… with `status=auto_fixed` and `status=resolved` (IssueOut; the
 * API has no `resolution` filter). Every kept fix closes the issue with a templated `action_taken`:
 *   - a code fix as `status: auto_fixed`, `resolution: deterministic_fix`;
 *   - an AI rewrite of the failed field as `status: resolved`, `resolution: ai_correction`, since
 *     the database allows `auto_fixed` only with `deterministic_fix` (ck_listing_issues_auto_fixed).
 * The review shows the fixes of the version a person approves (onVersion). Nothing here invents a
 * fix: every entry is one row the API returned.
 */
import { isAutoFix, type Issue } from '@/features/inbox/model'
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

/** The version a trail is read against: its id, and when it was written (content.created_at). */
export interface VersionRef {
  id: string | null | undefined
  createdAt?: string | null
}

export function versionRef(l: { current_version_id?: string | null; content?: { created_at?: string | null } | null }): VersionRef {
  return { id: l.current_version_id, createdAt: l.content?.created_at ?? null }
}

/**
 * Whether a fix belongs to the version. Its own version id decides; a row with no version id, or
 * a listing with no version yet, is kept (hiding a fix from the reviewer is worse than one too
 * many). A reused row can still carry an older version id, so a fix closed at or after the
 * version was written also belongs to it: a fix made during this version's pass is never hidden.
 */
export function onVersion(i: Pick<Issue, 'listing_version_id' | 'resolved_at'>, v: VersionRef): boolean {
  if (!v.id || !i.listing_version_id || i.listing_version_id === v.id) return true
  if (!v.createdAt || !i.resolved_at) return false
  const closed = Date.parse(i.resolved_at)
  const written = Date.parse(v.createdAt)
  return Number.isFinite(closed) && Number.isFinite(written) && closed >= written
}

/** The fix rows (auto-fixed, or resolved by an AI rewrite) that belong to a version. */
export function autoFixedOn<T extends Pick<Issue, 'status' | 'resolution' | 'listing_version_id' | 'resolved_at'>>(issues: readonly T[], v: VersionRef): T[] {
  return issues.filter((i) => isAutoFix(i) && onVersion(i, v))
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
export function autoFixTrail(issues: readonly Issue[], v: VersionRef): AutoFix[] {
  return autoFixedOn(issues, v)
    .map(autoFixView)
    .sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id))
}

/** "1 issue fixed for you", "2 issues fixed for you". */
export function fixedSummary(n: number): string {
  return `${n} ${n === 1 ? 'issue' : 'issues'} fixed for you`
}

/** "1 auto-fixed": the chip on a listing card. */
export const autoFixedChipText = (n: number) => `${n} auto-fixed`

/** Other listings in an "Approve all" batch that carry fixes: "Flipkart: 2 fixed". */
export function siblingFixes<T extends { id: string; marketplace: string }>(
  targets: readonly T[],
  counts: ReadonlyMap<string, number>,
  currentId: string,
): { listing: T; count: number }[] {
  return targets
    .filter((t) => t.id !== currentId && (counts.get(t.id) ?? 0) > 0)
    .map((listing) => ({ listing, count: counts.get(listing.id)! }))
    .sort((a, b) => a.listing.marketplace.localeCompare(b.listing.marketplace))
}

/** The review section's anchor, so a chip elsewhere can open it. */
export const FIXED_FOR_YOU_HASH = 'fixed-for-you'
