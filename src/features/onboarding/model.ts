/**
 * Onboarding model (pure). The setup wizard (hi-fi 02-04) derives every state from real API data.
 * The Home first-run checklist (hi-fi 05) lives in features/home-inbox (first-run.tsx, model.ts
 * `setupSteps`), which links back into these steps.
 */
import type { Schema } from '@/api/types'
import { brandProfileDone } from '@/features/home-inbox/model'

type Account = Schema<'MarketplaceAccountOut'>

/** Only steps that save something real. Compliance defaults had no API and were cut. */
export const SETUP_STEPS = [
  { label: 'Brand', to: '/setup/brand' },
  { label: 'Manufacturer', to: '/setup/manufacturer' },
  { label: 'Connect marketplaces', to: '/setup/marketplaces' },
] as const

/** Accounts that can publish now (`active`). `needs_reconnect` and `revoked` do not count. */
export function activeAccounts(accounts: readonly (Account | null | undefined)[]): Account[] {
  return accounts.filter((a): a is Account => !!a && a.status === 'active')
}

/** "10:32" in the viewer's locale, for "Saved automatically · 10:32". */
export function savedClock(d: Date): string {
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
}

/**
 * Real completion per setup step, for the stepper. Same rules as the Home checklist: the brand
 * step is done when the profile has a voice, guidelines or glossary; the manufacturer step when
 * the brand manufacturer is saved; the last step is never behind the current one.
 */
export function setupStepsDone(
  tenant: Parameters<typeof brandProfileDone>[0],
  manufacturerSet = false,
): [boolean, boolean, boolean] {
  return [brandProfileDone(tenant), manufacturerSet, false]
}
