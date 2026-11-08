/**
 * The landing hero's example (hero-stage.tsx): one kurta set record that turns into an Amazon
 * listing ready to approve. Pure data and timing, so it can be tested on its own (the same pattern
 * as how-it-works-script.ts). Marketing illustration, never app data. "Best" is a banned title word
 * in the seeded kurta-set rules for Amazon (HERO_EXAMPLE.bannedTerm), and Amazon's title limit is
 * 200 characters (HERO_EXAMPLE.limits.amazon).
 */
import { HERO_EXAMPLE } from './model'

export const STORY = {
  recordLabel: 'Your product',
  product: 'Indigo handloom kurta set',
  facts: [
    { label: 'Fabric', value: 'Cotton' },
    { label: 'Colour', value: 'Indigo' },
  ],
  /** Read from the photo, then confirmed by the seller. */
  photoFact: { label: 'Neckline', value: 'Round' },
  /** The cleaned main photo is a proposal: the seller approves it. */
  photoTag: 'White background',
  photoApproval: 'You approve',
  chips: ['Title', 'Bullets', 'Description'],
  bannedWord: 'Best',
  /** The title after the banned word; the draft is "Best " + this. */
  title: "Women's Handloom Cotton Kurta Set with Palazzo and Dupatta, Indigo",
  bullet: 'Handwoven cotton kurta with a straight palazzo and a printed dupatta.',
  checks: [
    { id: 'length', text: `Title within Amazon’s ${HERO_EXAMPLE.limits.amazon} characters` },
    { id: 'banned', text: 'No banned words' },
    { id: 'required', text: 'Required fields filled' },
  ],
  fixed: 'Fixed for you',
  fixedCaption: 'Removed “Best”, a word Amazon does not allow in titles.',
  checking: 'Checking…',
  ready: 'Ready to approve',
  caption: 'An example listing, not real product data.',
  summary:
    'Example: a kurta set record becomes an Amazon listing. Kuinn writes it in your brand’s voice, prepares a white-background main photo for you to approve, checks every field and fixes safe errors. The listing waits for your approval. Flipkart is next. Myntra, AJIO, Meesho and Nykaa Fashion are on the roadmap.',
} as const

export const DRAFT_TITLE = `${STORY.bannedWord} ${STORY.title}`

export type BeatId = 'reset' | 'photo' | 'photoTag' | 'confirm' | 'chips' | 'checks' | 'mark' | 'strike' | 'fixed' | 'banned' | 'ready'

/**
 * One loop of the example, in ms from the loop's start. After the last beat it holds until LOOP_MS.
 * The stage dips to 0 for RESET_DIP_MS around the restart (half out, half in), so the reset reads as
 * one calm fade rather than many small reversals.
 */
export const BEATS: readonly { id: BeatId; at: number }[] = [
  { id: 'reset', at: 0 },
  { id: 'photo', at: 600 },
  { id: 'photoTag', at: 1100 },
  { id: 'confirm', at: 1800 },
  { id: 'chips', at: 2800 },
  { id: 'checks', at: 3800 },
  { id: 'mark', at: 4200 },
  { id: 'strike', at: 5000 },
  { id: 'fixed', at: 5400 },
  { id: 'banned', at: 5600 },
  { id: 'ready', at: 6200 },
]
export const LOOP_MS = 10_800
export const RESET_DIP_MS = 300
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
  tray: 120,
  record: 200,
  amazon: 440,
  ghost: 520,
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

/** The final call to action's example slips. */
export const CTA_SLIPS = ['Indigo handloom kurta set', 'Block print cotton co-ord set', 'Chanderi straight kurta'] as const
