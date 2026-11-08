/**
 * The landing hero's story (hero-stage.tsx): three products, one after another, each led by its real
 * product photo and each turned into an Amazon listing. Every product spotlights different live
 * features, so one full cycle shows them all:
 * - the kurta set: written in the brand's voice, the banned word "Best" removed and marked "Fixed for
 *   you", then approved by a second person (maker-checker);
 * - the t-shirt: one product with six size variants, a title trimmed to Amazon's 200 characters and
 *   marked "Fixed for you", then sent to Amazon and live;
 * - the linen shirt: its colour read from the photo and confirmed by the seller, the size chart taken
 *   from the seller's sheet (never invented), every rule checked, ready to approve.
 *
 * Pure data and timing, so it can be tested on its own (the same pattern as how-it-works-script.ts).
 * Marketing illustration, never app data. "Best" is a banned title word in the seeded kurta-set rules
 * for Amazon (HERO_EXAMPLE.bannedTerm) and Amazon's title limit is 200 characters
 * (HERO_EXAMPLE.limits.amazon). Nothing here claims a feature that is not live: no auto-resend after
 * a rejection, no Flipkart publishing and no invented product data.
 */
import { HERO_EXAMPLE } from './model'

export type ProductId = 'kurta' | 'tee' | 'shirt'
/** The listing's status, shown in the card's one status pill. */
export type Status = 'drafting' | 'checking' | 'ready' | 'approved' | 'sent' | 'live'
/** The check that fails until the product's fix lands. */
export type CheckId = 'length' | 'banned' | 'required'

export interface HeroProduct {
  id: ProductId
  /** The photos' file stem in public/landing. */
  file: string
  /** The record card's name. */
  name: string
  photo: { src: string; src2x: string; alt: string }
  /** Two facts from the seller's sheet. */
  facts: readonly [{ label: string; value: string }, { label: string; value: string }]
  /** One fact read from the photo, then confirmed by the seller. */
  photoFact: { label: string; value: string }
  /** The Amazon title the agent drafts; `title` is the one that ships. */
  draftTitle: string
  title: string
  /**
   * What the card shows of a title too long for two lines: whole phrases and an ellipsis, the way a
   * marketplace's own result card shortens a title, never a cut mid-word. The title row's counter
   * carries the full length.
   */
  shownTitle?: string
  /** The banned word marked in the draft title (kurta set only). */
  bannedWord?: string
  bullets: readonly [string, string]
  price: string
  mrp: string
  sizes: readonly string[]
  attributes: readonly [{ label: string; value: string }, { label: string; value: string }, { label: string; value: string }]
  /** Which check fails until the fix, what the finding says and what the fix line says after it. */
  failing: CheckId
  finding: string
  /** "Fixed for you" for a safe fix; a fill from the seller's sheet says where it came from instead. */
  fixTag: string
  fixCaption: string
  /** Green for a safe fix Kuinn made; brand blue for a fill that came from the seller. */
  fixTone: 'success' | 'brand'
  /** The small line under the title: the brand's voice, the title's length, or the photo's colour. */
  meta: 'voice' | 'count' | 'colour'
  /** The spotlight on the drafted listing: the brand's voice on the copy, or the size variants. */
  spotlight: 'voice' | 'variants' | null
  /** The status after "Ready to approve", one per end beat. */
  ending: readonly [Status, Status, Status]
}

/** Amazon's title limit, from the seeded rules. */
export const LIMIT = HERO_EXAMPLE.limits.amazon
const KURTA_TITLE = "Women's Indigo Floral Cotton Kurta Set with Straight Pants"
const TEE_TITLE =
  "Women's Oversized Cotton T-Shirt, Charcoal Grey, Round Neck, Drop Shoulder, Half Sleeves, Relaxed Fit, Soft Cotton Jersey, Everyday Casual Wear for College, Work and Weekends, Machine Washable"
/** What the trim takes off the t-shirt's draft title: a trailing phrase, so the title ends on a word. */
const TEE_TAIL = ', Pairs with Jeans'
/** A title's length as Amazon counts it (code points). */
export const titleLength = (t: string) => [...t].length

export const PRODUCTS: readonly HeroProduct[] = [
  {
    id: 'kurta',
    file: 'kurta-set',
    name: 'Indigo floral print kurta set',
    photo: {
      src: '/landing/kurta-set-420.webp',
      src2x: '/landing/kurta-set-840.webp',
      alt: 'Woman in an indigo floral print cotton kurta with a mandarin collar and matching straight pants',
    },
    facts: [
      { label: 'Fabric', value: 'Cotton' },
      { label: 'Colour', value: 'Indigo' },
    ],
    photoFact: { label: 'Collar', value: 'Mandarin' },
    draftTitle: `Best ${KURTA_TITLE}`,
    title: KURTA_TITLE,
    bannedWord: 'Best',
    bullets: ['Soft printed cotton with a mandarin collar', 'Matching straight pants, easy all day'],
    price: '₹1,899',
    mrp: '₹3,499',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'],
    attributes: [
      { label: 'Fabric', value: 'Cotton' },
      { label: 'Sleeve', value: '3/4' },
      { label: 'Fit', value: 'Straight' },
    ],
    failing: 'banned',
    finding: 'Banned word “Best”',
    fixTag: 'Fixed for you',
    fixCaption: 'Removed “Best” from the title',
    fixTone: 'success',
    meta: 'voice',
    spotlight: 'voice',
    ending: ['approved', 'approved', 'approved'],
  },
  {
    id: 'tee',
    file: 'tee',
    name: 'Oversized cotton t-shirt',
    photo: {
      src: '/landing/tee-420.webp',
      src2x: '/landing/tee-840.webp',
      alt: 'Woman in an oversized charcoal cotton t-shirt and blue jeans',
    },
    facts: [
      { label: 'Fabric', value: 'Cotton' },
      { label: 'Colour', value: 'Charcoal' },
    ],
    photoFact: { label: 'Neck', value: 'Round' },
    draftTitle: `${TEE_TITLE}${TEE_TAIL}`,
    title: TEE_TITLE,
    shownTitle: "Women's Oversized Cotton T-Shirt, Charcoal Grey, Round Neck…",
    bullets: ['Heavy cotton jersey that keeps its shape', 'Dropped shoulders for a relaxed fall'],
    price: '₹799',
    mrp: '₹1,499',
    sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    attributes: [
      { label: 'Fabric', value: 'Cotton' },
      { label: 'Neck', value: 'Round' },
      { label: 'Fit', value: 'Oversized' },
    ],
    failing: 'length',
    finding: `Title is ${titleLength(`${TEE_TITLE}${TEE_TAIL}`)} characters`,
    fixTag: 'Fixed for you',
    fixCaption: `Title trimmed from ${titleLength(`${TEE_TITLE}${TEE_TAIL}`)} to ${titleLength(TEE_TITLE)} characters`,
    fixTone: 'success',
    meta: 'count',
    spotlight: 'variants',
    ending: ['approved', 'sent', 'live'],
  },
  {
    id: 'shirt',
    file: 'linen-shirt',
    name: 'Pastel pink linen shirt',
    photo: {
      src: '/landing/linen-shirt-420.webp',
      src2x: '/landing/linen-shirt-840.webp',
      alt: 'Man in a pastel pink long-sleeve shirt and charcoal trousers',
    },
    facts: [
      { label: 'Fabric', value: 'Linen' },
      { label: 'Fit', value: 'Regular' },
    ],
    photoFact: { label: 'Colour', value: 'Pink' },
    draftTitle: "Men's Linen Shirt, Pastel Pink, Regular Fit, Full Sleeves",
    title: "Men's Linen Shirt, Pastel Pink, Regular Fit, Full Sleeves",
    bullets: ['Breathable linen for warm days', 'Spread collar, full sleeves, chest pocket'],
    price: '₹1,599',
    mrp: '₹2,799',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'],
    attributes: [
      { label: 'Fabric', value: 'Linen' },
      { label: 'Colour', value: 'Pink' },
      { label: 'Fit', value: 'Regular' },
    ],
    failing: 'required',
    finding: 'Size chart needed',
    fixTag: 'Added from your sheet',
    fixCaption: 'Size chart attached, nothing guessed',
    fixTone: 'brand',
    meta: 'colour',
    spotlight: null,
    ending: ['ready', 'ready', 'ready'],
  },
]

export const CHECKS: readonly { id: CheckId; text: string }[] = [
  { id: 'length', text: `Title within ${LIMIT} characters` },
  { id: 'banned', text: 'No banned words' },
  { id: 'required', text: 'Required fields filled' },
]

/** The approver in the maker-checker beat (the same person as in How it works). */
export const APPROVER = { name: 'Meera', initial: 'M' } as const

export const STATUS_LABEL: Record<Status, string> = {
  drafting: 'Drafting…',
  checking: 'Checking…',
  ready: 'Ready to approve',
  approved: `Approved by ${APPROVER.name}`,
  sent: 'Sent to Amazon',
  live: 'Live on Amazon',
}

export const STORY = {
  /** The figure's accessible name. */
  label: 'How Kuinn turns your products into Amazon listings',
  voice: 'Brand voice',
  /** The linen shirt's line under the title: its colour, read from the photo and confirmed. */
  colour: 'Colour from your photo',
  /** The marketplaces are read out once, by the rail's own list in the same figure. */
  summary:
    'Three products become Amazon listings, one after another. A kurta set is written in your brand’s voice, the banned word “Best” is removed and marked Fixed for you, and a second person approves it. A t-shirt becomes six size variants, its title is trimmed to fit Amazon’s 200 characters, and it is sent to Amazon and goes live. A linen shirt’s colour is read from its photo and confirmed by the seller, its size chart comes from the seller’s sheet, every rule is checked and it waits for approval.',
} as const

export type BeatId = 'in' | 'confirm' | 'draft' | 'calm' | 'checks' | 'finding' | 'fix' | 'ready' | 'end1' | 'end2' | 'end3'

/**
 * One product's beats, in ms from its start. After the last beat it holds until PRODUCT_MS, then the
 * next product crossfades in (photo and listing together, CROSSFADE_MS).
 */
export const BEATS: readonly { id: BeatId; at: number }[] = [
  { id: 'in', at: 0 },
  { id: 'confirm', at: 1200 },
  { id: 'draft', at: 2000 },
  // The spotlight on the draft settles back before the checks start.
  { id: 'calm', at: 3300 },
  { id: 'checks', at: 3600 },
  { id: 'finding', at: 4700 },
  { id: 'fix', at: 5700 },
  { id: 'ready', at: 6500 },
  { id: 'end1', at: 7400 },
  { id: 'end2', at: 8200 },
  { id: 'end3', at: 9000 },
]
export const PRODUCT_MS = 10_600
export const CYCLE_MS = PRODUCT_MS * PRODUCTS.length
export const CROSSFADE_MS = 700
export const LAST = BEATS.length - 1
/** How far apart the checks tick, in order. */
export const TICK_STAGGER_MS = 180

/**
 * The entrance plays once, before the loop. ENTER is its own beat (-1) and shows the first product's
 * finished listing, so the cards never contradict each other while they rise in. After ENTER_HOLD_MS
 * the second product crossfades in and the loop runs on from there.
 */
export const ENTER = -1
export const ENTER_HOLD_MS = 4200

/** Entrance timings (ms) for each layer of the hero. */
export const ENTRANCE = {
  sub: 60,
  ctas: 130,
  trust: 200,
  record: 160,
  amazon: 400,
  rail: [600, 670, 740],
} as const

export interface Position {
  product: number
  beat: number
}

/** How long the current beat lasts before the next one. */
export function beatDelay(beat: number): number {
  if (beat === ENTER) return ENTER_HOLD_MS
  if (beat === LAST) return PRODUCT_MS - BEATS[LAST]!.at
  return BEATS[beat + 1]!.at - BEATS[beat]!.at
}

/** The next position; after the hold on the last beat the next product starts. */
export function next({ product, beat }: Position): Position {
  if (beat === ENTER || beat === LAST) return { product: (product + 1) % PRODUCTS.length, beat: 0 }
  return { product, beat: beat + 1 }
}

export interface StoryState {
  /** The photo fact reads "Confirmed" (it reads "From photo" before). */
  confirmed: boolean
  /** The listing's rows are written (skeleton bars before). */
  drafted: boolean
  /** The product's spotlight on the draft is lit. */
  spot: boolean
  /** Which checks show a tick, by id. */
  ticked: ReadonlySet<CheckId>
  /** The failing check is flagged and the finding shows. */
  finding: boolean
  /** The fix has landed: the title or field is corrected and the fix line shows. */
  fixed: boolean
  /** While the checks and the fix hold the eye, the written rows rest at a lower opacity. */
  quiet: boolean
  status: Status
}

const reached = (beat: number, id: BeatId) => beat >= BEATS.findIndex((b) => b.id === id)

/** What the stage shows for one product at a beat. ENTER shows the finished listing. */
export function storyAt(product: number, beat: number): StoryState {
  const p = PRODUCTS[product]!
  if (beat === ENTER) beat = LAST
  const ticked = new Set<CheckId>()
  if (reached(beat, 'checks')) for (const c of CHECKS) if (c.id !== p.failing) ticked.add(c.id)
  if (reached(beat, 'fix')) ticked.add(p.failing)
  const at = BEATS[beat]?.id
  const status: Status = reached(beat, 'end3')
    ? p.ending[2]
    : reached(beat, 'end2')
      ? p.ending[1]
      : reached(beat, 'end1')
        ? p.ending[0]
        : reached(beat, 'ready')
          ? 'ready'
          : reached(beat, 'checks')
            ? 'checking'
            : 'drafting'
  return {
    confirmed: reached(beat, 'confirm'),
    drafted: reached(beat, 'draft'),
    spot: at === 'draft',
    ticked,
    finding: reached(beat, 'finding'),
    fixed: reached(beat, 'fix'),
    quiet: reached(beat, 'checks') && !reached(beat, 'ready'),
    status,
  }
}

/** The still frame (reduced motion) and the entrance: the first product, finished. */
export const FINAL = storyAt(0, LAST)

/**
 * The final call to action's listing slips: the hero's three products, each with its real photo and
 * the status it ends on in the hero, so the slips echo the story.
 */
export const CTA_SLIPS = PRODUCTS.map((p) => ({
  name: p.name,
  photo: `/landing/slip-${p.file}-48.webp`,
  photo2x: `/landing/slip-${p.file}-96.webp`,
  status: p.ending[2],
}))

/**
 * The hero photos: each cropped from its original to the same 3:4 frame with the same headroom; the
 * kurta set and the t-shirt head to toe, the shirt (a studio shot cut at the shins) head to below the
 * hem. 420w by default, 840w for 2x screens (exported at 2x the largest display size).
 */
export const HERO_PHOTO = {
  width: 420,
  height: 560,
  /** The photo card is 48% of the stage from md, full width below. */
  sizes: '(min-width: 1024px) 300px, (min-width: 768px) 340px, calc(100vw - 32px)',
} as const

export const photoSrcSet = (p: HeroProduct['photo']) => `${p.src} 420w, ${p.src2x} 840w`
