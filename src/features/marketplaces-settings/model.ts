/**
 * Pure logic for the Marketplaces (p04 layout), Settings and Activity screens. No React here, so
 * every rule is unit tested (model.test.ts).
 */
import type { MarketplaceId } from '@/components/la/marketplace'
import { ROADMAP } from '@/components/la/roadmap'
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
 * design; in v1 none of the four is in the API, so every one reads "On the roadmap" with one
 * disabled "Join waitlist" (la/unavailable `ROADMAP`, the landing page's wording; prod QA 9 Nov).
 */
export interface WaitlistRow {
  id: Exclude<MarketplaceId, Marketplace>
  /** Sub line under the name. */
  note: string
  reason: string
}

export const WAITLIST: readonly WaitlistRow[] = (['myntra', 'ajio', 'meesho', 'nykaa'] as const).map((id) => ({
  id,
  note: ROADMAP.label,
  reason: ROADMAP.reason,
}))

/**
 * Hi-fi 19 "The agent may fix these on its own", as SI11 runs it in production (prod QA 9 Nov:
 * the page said "Coming soon" while it was live):
 * - `auto`: a marketplace data fix (a value mapped to the accepted list, a format or unit) is
 *   written and the listing is checked or sent again on its own;
 * - `approval`: a content change (title, bullets, description) becomes a new version a person
 *   approves;
 * - `planned`: not built yet.
 */
export type AutoFixMode = 'auto' | 'approval' | 'planned'

export const AUTO_FIX_SCOPE: readonly { label: string; mode: AutoFixMode }[] = [
  { label: "Map values to the marketplace's accepted list (colour, size)", mode: 'auto' },
  { label: 'Fix formatting problems (units, barcode format)', mode: 'auto' },
  { label: 'Calculate derived fields', mode: 'planned' },
  { label: 'Rebuild parent and child variants from your matrix', mode: 'planned' },
  { label: 'Rewrite titles that break a marketplace rule', mode: 'approval' },
]

/** SI11's cap (backend resolution/read.py MAX_CYCLES): automatic tries before it stops and asks. */
export const AUTO_FIX_TRIES = 3

export const NEVER_GUESSED = 'It never guesses fabric, measurements, origin, tax codes or care. Those always come from you.'

export const AUTONOMY_REASON = {
  scope: 'Choosing what the agent fixes on its own is not available yet.',
  retry: 'Changing the number of automatic tries is not available yet.',
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
