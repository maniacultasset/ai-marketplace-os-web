/**
 * Pure data and logic for the public pages: the landing page's illustrative finding, the honest
 * marketplace status, the sign-up status chip and the "what describes you" options.
 */
import type { MarketplaceId } from '@/components/la/marketplace'
import type { ChipStatus } from '@/components/la/status-chip'
import type { Schema } from '@/api/types'

/**
 * The hero's example finding. Marketing illustration, never app data. The limits and the banned
 * term are the real seeded platform rules for kurta sets (backend
 * packages/schemas/fixtures/rules.seed.json: content.title max_length 200 on Amazon and 150 on
 * Flipkart; banned_terms includes "best" on both), so the example shows what the rules engine
 * really answers. The character count is computed, never typed.
 */
export const HERO_EXAMPLE = {
  product: 'Example kurta set · Medium / Indigo',
  title:
    "Best Women's Handloom Cotton Kurta Set with Straight Palazzo and Printed Dupatta, Indigo, Medium, Regular Fit, Three-Quarter Sleeves, Festive and Office Wear",
  limits: { amazon: 200, flipkart: 150 },
  bannedTerm: 'best',
} as const

export const heroTitleLength = () => [...HERO_EXAMPLE.title].length

export interface HeroFinding {
  marketplace: 'amazon' | 'flipkart'
  field: string
  code: 'FIELD_TOO_LONG' | 'BANNED_TERM'
  message: string
  fix: string
}

/** The findings the seeded rules would raise on the example title, per marketplace. */
export function heroFindings(): HeroFinding[] {
  const len = heroTitleLength()
  const out: HeroFinding[] = []
  const words = HERO_EXAMPLE.title.toLowerCase().split(/[^a-z0-9']+/)
  if (len > HERO_EXAMPLE.limits.flipkart) {
    out.push({
      marketplace: 'flipkart',
      field: 'content.title',
      code: 'FIELD_TOO_LONG',
      message: `Title is ${len} characters. Flipkart allows ${HERO_EXAMPLE.limits.flipkart} for this category.`,
      fix: 'Shorten the title. Move the sleeve length and occasion into a bullet.',
    })
  }
  if (words.includes(HERO_EXAMPLE.bannedTerm)) {
    // Both marketplaces' kurta-set title rules ban "best" (match: word), so each raises its own finding.
    for (const marketplace of ['amazon', 'flipkart'] as const) {
      out.push({
        marketplace,
        field: 'content.title',
        code: 'BANNED_TERM',
        message: `Title contains the banned term "${HERO_EXAMPLE.bannedTerm}".`,
        fix: 'Remove it and describe a fact about the product instead.',
      })
    }
  }
  return out
}

export type MarketStage = 'in-setup' | 'pending' | 'later'

export interface MarketStatus {
  ids: MarketplaceId[]
  name: string
  stage: MarketStage
  body: string
}

/**
 * Honest marketplace status (FRONTEND-LIVE-HANDOVER.md §1: Amazon SP-API sandbox host until the
 * SP-API application is approved; analysis §1.1: Flipkart behind FLIPKART_ENABLED=false; the rest
 * are not in the API's `Marketplace` enum).
 */
export const MARKET_STATUS: readonly MarketStatus[] = [
  {
    ids: ['amazon'],
    name: 'Amazon',
    stage: 'in-setup',
    body: 'Built on Amazon’s Selling Partner API. We are testing against Amazon’s sandbox until our SP-API application is approved, so listings are not sent to Amazon yet.',
  },
  {
    ids: ['flipkart'],
    name: 'Flipkart',
    stage: 'pending',
    body: 'Built on Flipkart’s Seller API, with its own rules and category mapping. It stays switched off until our Flipkart access is confirmed.',
  },
  {
    ids: ['myntra', 'ajio', 'meesho', 'nykaa'],
    name: 'Myntra, AJIO, Meesho, Nykaa Fashion',
    stage: 'later',
    body: 'Not supported yet, and we have not set a date. Each one would be a new adapter behind the same rules and approval.',
  },
]

export const STAGE_CHIP: Record<MarketStage, { status: ChipStatus; label: string }> = {
  'in-setup': { status: 'working', label: 'In setup' },
  pending: { status: 'paused', label: 'Pending' },
  later: { status: 'not-listed', label: 'Later' },
}

export type SignupState = Schema<'SignupStatusOut'>['status']

/** The chip for a sign-up request (glyph + word). */
export function signupChip(status: SignupState): { status: ChipStatus; label: string } {
  switch (status) {
    case 'pending':
      return { status: 'working', label: 'Waiting for review' }
    case 'approved':
      return { status: 'live', label: 'Approved' }
    case 'rejected':
      return { status: 'error', label: 'Not approved' }
  }
}

/** p01 1b options. `SignupCreate` has no such field, so the choice cannot be saved yet. */
export const DESCRIBES_YOU = [
  'D2C brand',
  'Manufacturer',
  'Trader or reseller',
  'Small seller',
  'Agency managing other brands',
] as const
