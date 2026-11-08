/**
 * The script behind the landing page's "See how it works" demo (how-it-works-demo.tsx): one example
 * listing taken from import to Live, step by step. Pure data and timing so it can be tested on its
 * own. The example is the hero's kurta set (HERO_EXAMPLE), so the limits and the banned term are
 * the real seeded rules and every count is computed from the text, never typed.
 */
import { CONCEPT_ICON } from '@/components/la/concept-icons'
import type { IconSource } from '@/components/la/icons'
import { HERO_EXAMPLE, heroTitleLength } from './model'

/** Example-only details the hero does not carry. Shown under an "Example" label. */
export const DEMO = {
  sku: 'KS-104-IND-M',
  price: '₹1,899',
  file: 'kurta-sets.csv',
  /** Starts the draft, so the maker-checker rule keeps them from approving it. */
  editor: 'Arjun',
  approver: 'Meera',
} as const

/** What the agent drafts in the Draft step. The title stays the one from the CSV. */
export const DRAFT = {
  bullets: [
    'Handloom cotton kurta in indigo, with a straight palazzo and a printed dupatta',
    'Regular fit with three-quarter sleeves',
    'Easy to wear from office days to festive evenings',
  ],
  description: 'Woven from breathable handloom cotton, this indigo set pairs a straight kurta with a palazzo and a printed dupatta.',
} as const

/** What Kuinn removes: the banned word up front, and the sleeve length and occasion at the end,
 *  which the drafted bullets already cover. */
export const FIX_HEAD = 'Best '
export const FIX_TAIL = ', Three-Quarter Sleeves, Festive and Office Wear'
const FULL = HERO_EXAMPLE.title
export const FIX_MIDDLE = FULL.slice(FIX_HEAD.length, FULL.length - FIX_TAIL.length)
export const FIXED_TITLE = FIX_MIDDLE
export const LIMIT = HERO_EXAMPLE.limits.flipkart

export type SceneId = 'import' | 'draft' | 'check' | 'fix' | 'approve' | 'publish'

export interface RailStep {
  id: SceneId
  title: string
  body: string
  icon: IconSource
}

/** The rail: the six steps every listing takes, each one played by the example. */
export const RAIL: readonly RailStep[] = [
  { id: 'import', icon: 'upload', title: 'Import', body: 'Upload a CSV or add one product. Each row becomes a product with its sizes and colours.' },
  { id: 'draft', icon: 'spark', title: 'Draft', body: 'The agent writes the title, bullets and description in your brand’s voice.' },
  { id: 'check', icon: CONCEPT_ICON.rules, title: 'Check', body: 'Every field is tested against the marketplace’s rules. No model decides pass or fail.' },
  { id: 'fix', icon: CONCEPT_ICON.edit, title: 'Fix', body: 'Safe errors are fixed and marked. Anything else reaches your team with the fix shown beside it.' },
  { id: 'approve', icon: CONCEPT_ICON.approval, title: 'Approve', body: 'A second person reviews the listing and its checks, then approves it.' },
  { id: 'publish', icon: 'store', title: 'Publish', body: 'Kuinn sends it to Amazon. It shows as Live once Amazon confirms.' },
]

export const SCENES: readonly SceneId[] = RAIL.map((r) => r.id)

const fullLen = heroTitleLength()
const fixedLen = [...FIXED_TITLE].length

/** What the example shows at each step. Read out only when a person picks a step. */
export const NARRATION: Record<SceneId, string> = {
  import: `A row from ${DEMO.file} becomes one product with its SKU, title and price.`,
  draft: `${DEMO.editor} starts the draft. Kuinn writes the bullets and description in your brand’s voice. This example keeps the title from the CSV, so you can watch the checks catch it.`,
  check: `The rules check each field. The title is ${fullLen} characters, which is over Flipkart’s ${LIMIT}. It also uses the banned word “Best”.`,
  fix: `Kuinn removes “Best” and the sleeve and occasion words the bullets already cover. Each change is marked “Fixed for you”. At ${fixedLen} characters, every check passes.`,
  approve: `${DEMO.approver} reviews the fixes and approves. ${DEMO.editor} started the draft, so the approval has to come from someone else.`,
  publish: 'Kuinn sends the listing to Amazon and waits for Amazon to confirm it.',
}

/* Timing. A scene is a run of beats; each beat waits its delay, then the next one plays. The last
   beat of a scene is its hold, so the finished state stays up long enough to read. */
const HEAD = [...FIX_HEAD].length
const TAIL = [...FIX_TAIL].length
/** Fix beats: 0 caret in · 1..HEAD backspace "Best " · HEAD+1 caret to the end · then the tail
 *  goes · RECHECK all checks pending · 5 ticks · ALL_PASS. */
export const FIX_BEATS = {
  caretToEnd: HEAD + 1,
  tailDone: HEAD + 1 + TAIL,
  recheck: HEAD + 2 + TAIL,
  allPass: HEAD + 2 + TAIL + 6,
} as const

export const LAST_BEAT: Record<SceneId, number> = {
  import: 3,
  draft: 5,
  check: 7,
  fix: FIX_BEATS.allPass,
  approve: 3,
  publish: 3,
}

export function beatDelay(scene: SceneId, beat: number): number {
  switch (scene) {
    case 'import':
      return [700, 750, 950, 2000][beat] ?? 600
    case 'draft':
      // 0 panel in · 1..3 one bullet each · 4 description · 5 hold
      return [650, 700, 700, 700, 900, 2400][beat] ?? 600
    case 'check':
      return [550, 600, 600, 700, 800, 800, 1000, 2600][beat] ?? 600
    case 'fix': {
      if (beat === 0) return 900
      if (beat < HEAD) return 120
      if (beat === HEAD) return 700
      if (beat === FIX_BEATS.caretToEnd) return 450
      if (beat < FIX_BEATS.tailDone) return 30
      if (beat === FIX_BEATS.tailDone) return 800
      if (beat === FIX_BEATS.recheck) return 450
      if (beat < FIX_BEATS.allPass) return 230
      return 2600
    }
    case 'approve':
      return [800, 1000, 600, 2800][beat] ?? 600
    case 'publish':
      // The wait is the honest part: Live only lands after the confirmation, then a calm pause.
      return [700, 2200, 1000, 3600][beat] ?? 600
  }
}

export interface Pos {
  scene: number
  beat: number
}

export const START: Pos = { scene: 0, beat: 0 }
export const FINAL: Pos = { scene: SCENES.length - 1, beat: LAST_BEAT.publish }

/** The next beat; after Live the demo starts over. */
export function advance(p: Pos): Pos {
  const id = SCENES[p.scene] ?? 'import'
  if (p.beat < LAST_BEAT[id]) return { scene: p.scene, beat: p.beat + 1 }
  return p.scene + 1 < SCENES.length ? { scene: p.scene + 1, beat: 0 } : START
}

/** The title as the person edits it, and where the caret sits (null when it is not shown). */
export function fixedText(beat: number): { head: string; tail: string; caret: 'head' | 'end' | null } {
  const headLeft = HEAD - Math.min(Math.max(beat, 0), HEAD)
  const tailLeft = TAIL - Math.min(Math.max(beat - FIX_BEATS.caretToEnd, 0), TAIL)
  return {
    head: [...FIX_HEAD].slice(0, headLeft).join(''),
    tail: [...FIX_TAIL].slice(0, tailLeft).join(''),
    caret: beat < FIX_BEATS.caretToEnd ? 'head' : beat < FIX_BEATS.recheck ? 'end' : null,
  }
}

export type CheckState = 'pending' | 'pass' | 'fail'

export interface Check {
  label: string
  detail: string
  state: CheckState
}

/** The five checks the rules run on the example, as they stand at a scene and beat. */
export const FIXED_LEN = fixedLen
export const FULL_LEN = fullLen

export function checksAt(scene: SceneId, beat: number): Check[] {
  // The details are what the last run saw: the original title until the recheck runs.
  const rechecked = scene === 'approve' || scene === 'publish' || (scene === 'fix' && beat >= FIX_BEATS.recheck)
  const titleLen = rechecked ? fixedLen : fullLen
  const banned = !rechecked
  const rows: Omit<Check, 'state'>[] = [
    { label: 'Required fields', detail: 'SKU, title, price' },
    { label: 'Title length · Amazon', detail: `${titleLen} / ${HERO_EXAMPLE.limits.amazon}` },
    { label: 'Title length · Flipkart', detail: `${titleLen} / ${LIMIT}` },
    { label: 'Banned terms · Amazon', detail: banned ? '“best” found' : 'None found' },
    { label: 'Banned terms · Flipkart', detail: banned ? '“best” found' : 'None found' },
  ]
  const first: CheckState[] = ['pass', 'pass', 'fail', 'fail', 'fail']
  let states: CheckState[]
  if (scene === 'import' || scene === 'draft') states = rows.map(() => 'pending')
  else if (scene === 'check') {
    // beat 2 required · 3 Amazon length · 4 Flipkart length · 5 both banned-term checks
    const done = [2, 3, 4, 5, 5]
    states = first.map((s, i) => (beat >= (done[i] ?? 9) ? s : 'pending'))
  } else if (scene === 'fix') {
    if (beat < FIX_BEATS.recheck) states = first
    else states = rows.map((_, i) => (beat - FIX_BEATS.recheck > i ? 'pass' : 'pending'))
  } else states = rows.map(() => 'pass')
  return rows.map((r, i) => ({ ...r, state: states[i] ?? 'pending' }))
}
