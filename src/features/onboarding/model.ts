/**
 * Onboarding model (pure). The setup wizard (hi-fi 02-04) derives every state from real API data.
 * The Home first-run checklist (hi-fi 05) lives in features/home-inbox (first-run.tsx, model.ts
 * `setupSteps`), which links back into these steps.
 */
import type { Schema } from '@/api/types'
import { brandProfileDone } from '@/features/home-inbox/model'

type Account = Schema<'MarketplaceAccountOut'>

export const SETUP_STEPS = [
  { label: 'Brand and business', to: '/setup/brand' },
  { label: 'Compliance defaults', to: '/setup/compliance' },
  { label: 'Connect marketplaces', to: '/setup/marketplaces' },
] as const

/** One sentence used wherever a designed field has no API to save it yet. */
export const NEEDS_BACKEND = 'Saving this needs a backend update — coming soon.'

/** Accounts that can publish now (`active`). `needs_reconnect` and `revoked` do not count. */
export function activeAccounts(accounts: readonly (Account | null | undefined)[]): Account[] {
  return accounts.filter((a): a is Account => !!a && a.status === 'active')
}

/** "10:32" in the viewer's locale, for "Saved automatically · 10:32". */
export function savedClock(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

/**
 * Real completion per setup step, for the stepper. Same rules as the Home checklist: the brand
 * step is done when the profile has a voice, guidelines or glossary; compliance defaults never
 * (nothing on that step can be saved yet); the last step is never behind the current one.
 */
export function setupStepsDone(tenant: Parameters<typeof brandProfileDone>[0]): [boolean, boolean, boolean] {
  return [brandProfileDone(tenant), false, false]
}
