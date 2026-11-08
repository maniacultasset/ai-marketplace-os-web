/**
 * Pure data and logic for the public pages: the How it works example's findings, the honest
 * marketplace status, the live features, the sign-up status chip and the "what describes you" options.
 */
import type { MarketplaceId } from '@/components/la/marketplace'
import type { ChipStatus } from '@/components/la/status-chip'
import type { Schema } from '@/api/types'

/**
 * The How it works example's finding. Marketing illustration, never app data. The limits and the banned
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

/** Plain names for the rule codes on a marketing page; the code itself stays in a tooltip. */
export const FINDING_LABEL: Record<HeroFinding['code'], string> = {
  FIELD_TOO_LONG: 'Title too long',
  BANNED_TERM: 'Banned word',
}

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
 * Honest marketplace status. Amazon is connected in production (SP-API); Flipkart is built but its
 * connection stays off (FLIPKART_ENABLED=false); the other four are not in the API's `Marketplace`
 * enum yet, so they are roadmap only, with no date.
 */
export const MARKET_STATUS: readonly MarketStatus[] = [
  {
    ids: ['amazon'],
    name: 'Amazon',
    stage: 'live',
    body: 'Connect your seller account through Amazon’s Selling Partner API. Kuinn checks each listing against Amazon’s rules and sends it after your team approves.',
  },
  {
    ids: ['flipkart'],
    name: 'Flipkart',
    stage: 'soon',
    body: 'The rules and category mapping are built. Publishing to Flipkart is not switched on yet.',
  },
  {
    ids: ['myntra', 'ajio', 'meesho', 'nykaa'],
    name: 'Myntra, AJIO, Meesho, Nykaa Fashion',
    stage: 'roadmap',
    body: 'Planned after Flipkart, with no dates yet. Each will use the same catalog and approval step.',
  },
]

/**
 * The chip for each stage. `glyph` replaces the status glyph on the public pages: a dotted ring for
 * the roadmap (never a dash) and a half disc for "Next" (the paused bars read as stopped). Flipkart
 * reads "Next" everywhere, to match "Flipkart is next."
 */
export const STAGE_CHIP: Record<MarketStage, { status: ChipStatus; label: string; short: string; glyph?: string }> = {
  live: { status: 'live', label: 'Live', short: 'Live' },
  soon: { status: 'paused', label: 'Next', short: 'Next', glyph: '◐' },
  roadmap: { status: 'not-listed', label: 'On the roadmap', short: 'Roadmap', glyph: '◌' },
}

/** The stage of one marketplace, for the hero rail. */
export function stageOf(id: MarketplaceId): MarketStage {
  return MARKET_STATUS.find((m) => m.ids.includes(id))!.stage
}

export interface Benefit {
  id: 'draft' | 'photos' | 'checks' | 'fixes' | 'images'
  title: string
  body: string
}

/** The landing's "What Kuinn does for your team" row. Only shipped features, no counts or rates. */
export const BENEFITS: readonly Benefit[] = [
  { id: 'draft', title: 'Written in your voice', body: 'Titles, bullets and descriptions follow your tone, your glossary and the words your brand avoids.' },
  { id: 'photos', title: 'Read from your photos', body: 'Kuinn suggests product details from your images. You confirm each one before it is used.' },
  { id: 'checks', title: 'Checked before you approve', body: 'Limits, required fields and banned words are checked for each marketplace before you approve.' },
  { id: 'fixes', title: 'Fixed for you', body: 'Safe rule errors, like a title a few characters too long, are corrected on their own. You see each change marked “Fixed for you”.' },
  { id: 'images', title: 'A clean white main image', body: 'Your main photo is turned into the white-background image marketplaces ask for. You approve it first.' },
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
