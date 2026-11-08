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
        message: `Title contains the banned term “${HERO_EXAMPLE.bannedTerm}”.`,
        fix: 'Remove it and describe a fact about the product instead.',
      })
    }
  }
  return out
}

export type MarketStage = 'live' | 'soon' | 'roadmap'

export interface MarketStatus {
  ids: MarketplaceId[]
  name: string
  stage: MarketStage
  body: string
}

/**
 * Honest marketplace status. Kuinn's aim is every marketplace Indian brands sell on, added one at
 * a time behind the same rules and approval step. Amazon is connected in production (SP-API);
 * Flipkart is built but its connection stays off (FLIPKART_ENABLED=false); the other four are not
 * in the API's `Marketplace` enum yet, so they are roadmap only, with no date.
 */
export const MARKET_STATUS: readonly MarketStatus[] = [
  {
    ids: ['amazon'],
    name: 'Amazon',
    stage: 'live',
    body: 'Connect your seller account through Amazon’s Selling Partner API. Kuinn checks each listing against Amazon’s rules and sends it once your team approves.',
  },
  {
    ids: ['flipkart'],
    name: 'Flipkart',
    stage: 'soon',
    body: 'Built on Flipkart’s Seller API, with its own rules and category mapping. The connection stays switched off until our Flipkart access is confirmed.',
  },
  {
    ids: ['myntra', 'ajio', 'meesho', 'nykaa'],
    name: 'Myntra, AJIO, Meesho, Nykaa Fashion',
    stage: 'roadmap',
    body: 'Next on the roadmap, with no date set yet. Each one joins behind the same product record, the same rules and the same approval step.',
  },
]

export const STAGE_CHIP: Record<MarketStage, { status: ChipStatus; label: string }> = {
  live: { status: 'live', label: 'Live' },
  soon: { status: 'paused', label: 'Coming soon' },
  roadmap: { status: 'not-listed', label: 'On the roadmap' },
}

/** The stage of one marketplace, for the hero strip. */
export function stageOf(id: MarketplaceId): MarketStage {
  return MARKET_STATUS.find((m) => m.ids.includes(id))!.stage
}

export interface Benefit {
  id: 'draft' | 'photos' | 'checks' | 'fixes' | 'images'
  title: string
  body: string
}

/** The landing's "What Kuinn does for you" row. Only shipped features, no counts or rates. */
export const BENEFITS: readonly Benefit[] = [
  { id: 'draft', title: 'Listings in your brand’s voice', body: 'Title, bullets, description and keywords, drafted from your product facts.' },
  { id: 'photos', title: 'Details read from your photos', body: 'Attributes suggested from your product images. You confirm each one.' },
  { id: 'checks', title: 'Every field checked first', body: 'Each marketplace’s limits, required fields and banned terms, checked before you approve.' },
  { id: 'fixes', title: 'Safe errors fixed for you', body: 'Small rule errors are corrected on their own and marked “Fixed for you”.' },
  { id: 'images', title: 'Main photos on clean white', body: 'Your main photo, turned into a clean white-background image. You approve it.' },
]

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
