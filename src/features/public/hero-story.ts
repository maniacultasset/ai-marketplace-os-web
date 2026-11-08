/**
 * The landing hero's story (hero-stage.tsx): one kurta set record, led by a real product photo, that
 * turns into an Amazon listing ready to approve. Pure data and timing, so it can be tested on its own
 * (the same pattern as how-it-works-script.ts). Marketing illustration, never app data. "Best" is a banned title word
 * in the seeded kurta-set rules for Amazon (HERO_EXAMPLE.bannedTerm), and Amazon's title limit is
 * 200 characters (HERO_EXAMPLE.limits.amazon).
 */
import { HERO_EXAMPLE } from './model'

export const STORY = {
  product: 'Indigo floral print kurta set',
  facts: [
    { label: 'Fabric', value: 'Cotton' },
    { label: 'Colour', value: 'Indigo' },
  ],
  /** Read from the photo, then confirmed by the seller. */
  photoFact: { label: 'Neckline', value: 'Mandarin collar' },
  /** The main photo row: the studio shot, then the white-background version Kuinn proposes. The
   *  cleaned photo is a proposal: the seller approves it. */
  photoLabel: 'Photo',
  photoStudio: 'Studio shot',
  photoTag: 'White background',
  photoApproval: 'You approve',
  chips: ['Title', 'Bullets', 'Description'],
  bannedWord: 'Best',
  /** The title after the banned word; the draft is "Best " + this. */
  title: "Women's Floral Print Cotton Kurta Set with Straight Pants, Indigo",
  bullet: 'Printed cotton kurta with a mandarin collar and matching straight pants.',
  checks: [
    { id: 'length', text: `Title within Amazon’s ${HERO_EXAMPLE.limits.amazon} characters` },
    { id: 'banned', text: 'No banned words' },
    { id: 'required', text: 'Required fields filled' },
  ],
  /** The finding the checks raise before the fix lands. */
  finding: 'Banned word: “Best”',
  findingCaption: 'Amazon does not allow it in titles.',
  fixed: 'Fixed for you',
  fixedCaption: 'Removed “Best”, a word Amazon does not allow in titles.',
  checking: 'Checking…',
  ready: 'Ready to approve',
  /** The figure's accessible name. */
  label: 'How Kuinn turns one product into an Amazon listing',
  /** The real photo's alt text (the photo itself is decorative inside the stage). */
  photoAlt: 'Woman in an indigo floral print cotton kurta with a mandarin collar and matching straight pants',
  summary:
    'A kurta set record becomes an Amazon listing. Kuinn writes it in your brand’s voice, prepares a white-background main photo for you to approve, checks every field and fixes safe errors. The listing waits for your approval. Flipkart is next. Myntra, AJIO, Meesho and Nykaa Fashion are on the roadmap.',
} as const

export const DRAFT_TITLE = `${STORY.bannedWord} ${STORY.title}`

export type BeatId = 'reset' | 'photo' | 'photoTag' | 'confirm' | 'chips' | 'checks' | 'mark' | 'strike' | 'fixed' | 'banned' | 'ready'

/**
 * One loop of the story, in ms from the loop's start. After the last beat it holds until LOOP_MS.
 * Around the restart the listing's contents crossfade over RESET_DIP_MS (half out, half in) while
 * the cards themselves stay put, so the reset reads as one calm fade rather than many small reversals.
 */
export const BEATS: readonly { id: BeatId; at: number }[] = [
  // The studio photo holds for 1.6s first, so the real shot reads before it turns white.
  { id: 'reset', at: 0 },
  { id: 'photo', at: 1600 },
  { id: 'photoTag', at: 2200 },
  { id: 'confirm', at: 2700 },
  { id: 'chips', at: 3300 },
  { id: 'checks', at: 4200 },
  { id: 'mark', at: 4600 },
  { id: 'strike', at: 5600 },
  { id: 'fixed', at: 6000 },
  { id: 'banned', at: 6200 },
  { id: 'ready', at: 6600 },
]
export const LOOP_MS = 10_800
export const RESET_DIP_MS = 640
export const LAST = BEATS.length - 1

/**
 * The entrance plays once, before the loop. ENTER is its own beat (-1) and shows the finished listing,
 * so the cards never contradict each other while they rise in. At ENTER_READY_MS it hands over to the
 * last beat (the same picture), which rings the live dot once. The loop then starts LOOP_START_MS after
 * the page arrives (the entrance settles at about 1.8s, plus 1.6s).
 */
export const ENTER = -1
export const ENTER_READY_MS = 980
export const LOOP_START_MS = 3400

/** Entrance timings (ms) for each layer of the hero. */
export const ENTRANCE = {
  sub: 60,
  ctas: 130,
  trust: 200,
  record: 160,
  amazon: 400,
  rail: [600, 670, 740],
} as const

/** How long the current beat lasts before the next one. */
export function beatDelay(beat: number, cycle: number): number {
  if (beat === ENTER) return ENTER_READY_MS
  if (beat === LAST) return cycle === 0 ? LOOP_START_MS - ENTER_READY_MS : LOOP_MS - BEATS[LAST]!.at
  return BEATS[beat + 1]!.at - BEATS[beat]!.at
}

/** The next beat; after the hold on the last beat the loop starts again at reset. */
export function nextBeat(beat: number): number {
  return beat === ENTER ? LAST : beat === LAST ? 0 : beat + 1
}

export interface StoryState {
  /** The cleaned white-background photo is showing. */
  white: boolean
  photoTag: boolean
  confirmed: boolean
  /** The field chips are travelling this beat. */
  chips: boolean
  /** Which checks show a tick, by id. */
  ticked: ReadonlySet<string>
  /** The highlight is drawn across "Best" (it leaves with the word). */
  marked: boolean
  /** "Best" is gone and the title has closed up. */
  struck: boolean
  fixed: boolean
  ready: boolean
}

const reached = (beat: number, id: BeatId) => beat >= BEATS.findIndex((b) => b.id === id)

/** What the stage shows at a beat. ENTER and LAST both show the finished listing. */
export function storyAt(beat: number): StoryState {
  if (beat === ENTER) return storyAt(LAST)
  const ticked = new Set<string>()
  if (reached(beat, 'checks')) ticked.add('length').add('required')
  if (reached(beat, 'banned')) ticked.add('banned')
  return {
    white: reached(beat, 'photo'),
    photoTag: reached(beat, 'photoTag'),
    confirmed: reached(beat, 'confirm'),
    chips: BEATS[beat]?.id === 'chips',
    ticked,
    marked: reached(beat, 'mark'),
    struck: reached(beat, 'strike'),
    fixed: reached(beat, 'fixed'),
    ready: reached(beat, 'ready'),
  }
}

export const FINAL = storyAt(LAST)

/** The final call to action's listing slips, each with its real product photo (public/landing). */
export const CTA_SLIPS = [
  { name: STORY.product, photo: '/landing/slip-kurta-set-indigo.webp' },
  { name: 'Printed cotton co-ord set', photo: '/landing/slip-coord-set-print.webp' },
  { name: 'White floral kurta set', photo: '/landing/slip-kurta-white-floral.webp' },
] as const

/**
 * The hero photo: the studio shot and the white-background main image made from it, both cropped
 * to the same 3:4 head-to-feet box so the crossfade stays registered. 720w by default, 1080w for
 * high-density phones.
 */
export const HERO_PHOTO = {
  studio: '/landing/kurta-set-indigo.webp',
  studio2x: '/landing/kurta-set-indigo-1080.webp',
  white: '/landing/kurta-set-indigo-white.webp',
  white2x: '/landing/kurta-set-indigo-white-1080.webp',
  width: 720,
  height: 960,
  /** The photo card is the left 56% of the stage from md, full width below. */
  sizes: '(min-width: 768px) 400px, calc(100vw - 32px)',
} as const

export const photoSrcSet = (one: string, two: string) => `${one} 720w, ${two} 1080w`
