import type { ChipStatus } from '@/components/la/status-chip'
import type { AccountStatus, Marketplace } from './api'

export const MARKETPLACES: readonly Marketplace[] = ['amazon', 'flipkart']

/** Names follow the hi-fi (p04): "Amazon", "Flipkart". */
export const MARKETPLACE_META: Record<
  Marketplace,
  { name: string; short: string; console: string }
> = {
  amazon: { name: 'Amazon', short: 'Amazon', console: 'Seller Central' },
  flipkart: { name: 'Flipkart', short: 'Flipkart', console: 'the Flipkart seller dashboard' },
}

/** Connection health → hi-fi status chip (glyph + word, never colour alone). */
export const STATUS_META: Record<AccountStatus | 'none', { label: string; chip: ChipStatus }> = {
  active: { label: 'Connected', chip: 'live' },
  needs_reconnect: { label: 'Reconnect needed', chip: 'needs-you' },
  revoked: { label: 'Revoked', chip: 'not-listed' },
  none: { label: 'Not connected', chip: 'not-listed' },
}

/**
 * Whether a brand may start drafts for a marketplace before connecting it. Flipkart's connector is
 * built but switched off for brands (POST /marketplaces/connect answers 501) until our Flipkart
 * access is confirmed, so its drafts open only once the brand has Flipkart connected. Set flipkart
 * to true when the connector opens.
 */
export const DRAFTS_BEFORE_CONNECT: Readonly<Record<Marketplace, boolean>> = { amazon: true, flipkart: false }

/**
 * Publishing is not open for brands yet (Flipkart: "Next" on the landing page), and this brand has
 * no account there. Every screen then says "Coming soon" with no Connect or List action: Home's
 * card, the product page's card and the Marketplaces page (prod QA 9 Nov, items 3 and 10). The
 * same switch as `DRAFTS_BEFORE_CONNECT`. `connected` null (loading) reads as not connected.
 */
export function comingSoon(m: Marketplace, connected: readonly Marketplace[] | null | undefined): boolean {
  return !DRAFTS_BEFORE_CONNECT[m] && !connected?.includes(m)
}

/** The one sentence for a Coming soon marketplace, on every screen. */
export const comingSoonReason = (m: Marketplace) =>
  `Publishing to ${MARKETPLACE_META[m].name} is coming soon. Kuinn lists on Amazon for now.`

/** Drafts can be started for `m`: allowed before connecting, or the brand has it connected. */
export function draftOpen(m: Marketplace, connected: readonly Marketplace[] | null | undefined): boolean {
  return DRAFTS_BEFORE_CONNECT[m] || !!connected?.includes(m)
}

/** The marketplaces in `ms` that drafts can be started for now. */
export function openForDrafts(ms: readonly Marketplace[], connected: readonly Marketplace[] | null | undefined): Marketplace[] {
  return ms.filter((m) => draftOpen(m, connected))
}

/** Why drafts for `m` can't start yet. */
export const draftClosedReason = (m: Marketplace) =>
  `Connecting ${MARKETPLACE_META[m].name} is coming soon. ${MARKETPLACE_META[m].name} drafts open once it is connected.`
