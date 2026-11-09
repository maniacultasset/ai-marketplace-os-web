/**
 * Pure logic for the Marketplaces (p04 layout), Settings and Activity screens. No React here, so
 * every rule is unit tested (model.test.ts).
 */
import type { MarketplaceId } from '@/components/la/marketplace'
import { NOT_YET } from '@/components/la/unavailable'
import type { CurrentAccounts, Marketplace, MarketplaceAccount } from '@/features/marketplaces/api'

export const SUPPORTED: readonly Marketplace[] = ['amazon', 'flipkart']

export function isSupported(id: string): id is Marketplace {
  return (SUPPORTED as readonly string[]).includes(id)
}

/** What one supported marketplace row shows (left list) and what its detail card offers. */
export type ConnectionKind = 'connected' | 'reconnect' | 'not-connected'

export interface Connection {
  marketplace: Marketplace
  kind: ConnectionKind
  /** The live (non-revoked) account, if any. */
  account: MarketplaceAccount | null
  /** The newest revoked account, shown as context when nothing is live. */
  previous: MarketplaceAccount | null
}

export function connectionFor(current: CurrentAccounts, marketplace: Marketplace): Connection {
  const account = current.live[marketplace]
  const kind: ConnectionKind = !account
    ? 'not-connected'
    : account.status === 'needs_reconnect'
      ? 'reconnect'
      : 'connected'
  return { marketplace, kind, account, previous: current.previous[marketplace] }
}

/**
 * The row selected when the URL names none: the first that needs the seller (reconnect), then the
 * first connected one, then Amazon. Matches p04, which opens on the row with something to do.
 */
export function defaultSelection(current: CurrentAccounts | undefined): Marketplace {
  if (!current) return 'amazon'
  const rows = SUPPORTED.map((m) => connectionFor(current, m))
  return (rows.find((r) => r.kind === 'reconnect') ?? rows.find((r) => r.kind === 'connected') ?? rows[0]!).marketplace
}

/** An active account whose token time has passed (refresh is due or failed silently). */
export function isTokenExpired(account: MarketplaceAccount | null, now: number): boolean {
  return !!account && account.status === 'active' && !!account.expires_at && new Date(account.expires_at).getTime() <= now
}

/**
 * Unsupported marketplaces in the order p04 lists them. Myntra and Meesho show "Connect" in the
 * design; in v1 none of the four is in the API, so every one is a disabled "Join waitlist" with
 * the reason (DESIGN.md "Not in the API yet").
 */
export interface WaitlistRow {
  id: Exclude<MarketplaceId, Marketplace>
  /** Sub line under the name. */
  note: string
  reason: string
}

export const WAITLIST: readonly WaitlistRow[] = [
  { id: 'myntra', note: 'Not supported yet', reason: NOT_YET.waitlist },
  { id: 'ajio', note: 'API access needed', reason: NOT_YET.waitlist },
  { id: 'meesho', note: 'Not supported yet', reason: NOT_YET.waitlist },
  { id: 'nykaa', note: 'API access needed', reason: NOT_YET.waitlist },
]

/** Hi-fi 19 "The agent may fix these on its own": planned scope only, none of it runs in v1. */
export const AUTO_FIX_SCOPE: readonly string[] = [
  "Map values to the marketplace's accepted list (colour, size)",
  'Fix formatting problems',
  'Calculate derived fields',
  'Rebuild parent and child variants from your matrix',
  'Rewrite titles that break a marketplace rule',
]

export const NEVER_GUESSED = 'It never guesses fabric, measurements, origin, tax codes or care. Those always come from you.'

export const AUTONOMY_REASON = {
  scope: 'Choosing what the agent fixes on its own is not available yet. Every change still waits for your approval.',
  retry: 'Changing the retry limit is not available yet.',
  notify: NOT_YET.notifications,
  perMarketplace: 'Per-marketplace settings are not available yet. Approval is required on every marketplace.',
} as const

/**
 * Who did it. The API gives an actor type and a user id; only the signed-in user's own id can be
 * named ("You"), other people are "Your team" (no user directory is readable by every role).
 */
export function auditActorLabel(
  e: { actor_type: 'user' | 'system' | 'staff'; actor_user_id?: string | null },
  meId: string | null | undefined,
): string {
  if (e.actor_type === 'system') return 'Kuinn'
  if (e.actor_type === 'staff') return 'Support team'
  return meId && e.actor_user_id === meId ? 'You' : 'Your team'
}

/** One row of a listing's history in Activity: an audit event or a marketplace submission. */
export interface ActivityEvent {
  id: string
  at: string
  label: string
  by: string
  reason: string | null
}

type SubmissionLike = {
  id: string
  attempt: number
  operation: 'create' | 'update' | 'patch'
  outcome: 'pending' | 'accepted' | 'partially_accepted' | 'rejected' | 'error' | 'live' | 'superseded'
  created_at: string
  sent_at?: string | null
  responded_at?: string | null
  resolved_at?: string | null
  error?: { errors?: { message?: string | null }[] | null } | null
}

const OUTCOME_LABEL: Partial<Record<SubmissionLike['outcome'], (mp: string) => string>> = {
  accepted: (mp) => `Accepted by ${mp}`,
  partially_accepted: (mp) => `Partly accepted by ${mp}`,
  rejected: (mp) => `Rejected by ${mp}`,
  error: (mp) => `${mp} answered with an error`,
  live: (mp) => `Live on ${mp}`,
}

/**
 * What the marketplace said, from GET /listings/{id}/submissions: the audit history records only
 * people's actions, so sends, refusals and Live come from here. Each send is one row, and its
 * outcome another once the marketplace answered.
 */
export function submissionEvents(subs: readonly SubmissionLike[], mp: string): ActivityEvent[] {
  const out: ActivityEvent[] = []
  for (const s of subs) {
    const resend = s.operation === 'patch' || s.attempt > 1
    out.push({ id: `${s.id}:sent`, at: s.sent_at ?? s.created_at, label: resend ? `Sent the fixes to ${mp} again` : `Sent to ${mp}`, by: 'Kuinn', reason: null })
    const outcome = OUTCOME_LABEL[s.outcome]
    const at = s.resolved_at ?? s.responded_at
    if (outcome && at) {
      const why = s.outcome === 'rejected' || s.outcome === 'error' ? (s.error?.errors?.[0]?.message ?? null) : null
      out.push({ id: `${s.id}:outcome`, at, label: outcome(mp), by: mp, reason: why })
    }
  }
  return out
}

/** Audit rows and submission rows, newest first. Stable for equal times. */
export function mergeActivity(a: readonly ActivityEvent[], b: readonly ActivityEvent[]): ActivityEvent[] {
  return [...a, ...b]
    .map((x, i) => ({ x, i }))
    .sort((p, q) => q.x.at.localeCompare(p.x.at) || p.i - q.i)
    .map(({ x }) => x)
}
