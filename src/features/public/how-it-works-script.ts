/**
 * The script behind the landing page's "See it work" demo (how-it-works-demo.tsx): one example
 * listing taken from import to Live, step by step. Pure data and timing so it can be tested on its
 * own. The example is the hero's kurta set (HERO_EXAMPLE), so the limits and the banned term are
 * the real seeded rules and every count is computed from the text, never typed.
 */
import type { IconSource } from '@/components/la/icons'
import { PencilLine } from 'lucide-react'
import { HERO_EXAMPLE, heroTitleLength } from './model'

/** Example-only details the hero does not carry. Shown under an "Example" label. */
export const DEMO = {
  sku: 'KS-104-IND-M',
  price: '₹1,899',
  file: 'kurta-sets.csv',
  editor: 'Arjun',
  approver: 'Meera',
} as const

/** What the person deletes: the banned word up front, the sleeve length and occasion at the end
 *  (the hero finding's own fix: "Move the sleeve length and occasion into a bullet"). */
export const FIX_HEAD = 'Best '
export const FIX_TAIL = ', Three-Quarter Sleeves, Festive and Office Wear'
const FULL = HERO_EXAMPLE.title
export const FIX_MIDDLE = FULL.slice(FIX_HEAD.length, FULL.length - FIX_TAIL.length)
export const FIXED_TITLE = FIX_MIDDLE
export const LIMIT = HERO_EXAMPLE.limits.flipkart

export type SceneId = 'import' | 'validate' | 'fix' | 'approve' | 'publish'

export interface RailStep {
  id: SceneId | 'generate'
  title: string
  body: string
  icon: IconSource
  inDevelopment?: true
}

/** The rail. The five landing cards keep their words; Fix is the step between a finding and approval. */
export const RAIL: readonly RailStep[] = [
  { id: 'import', icon: 'upload', title: 'Import', body: 'Upload a CSV or add one product at a time. Each row becomes one clean product with its variants.' },
  {
    id: 'generate',
    icon: 'spark',
    title: 'Generate',
    body: 'The agent will draft the title, bullets, description and attributes in your brand’s voice.',
    inDevelopment: true,
  },
  { id: 'validate', icon: 'shield', title: 'Validate', body: 'A rules engine written as code checks every field against each marketplace’s limits. No model decides pass or fail.' },
  { id: 'fix', icon: PencilLine, title: 'Fix', body: 'A person edits the field a rule flagged, then the same rules check the new text again.' },
  { id: 'approve', icon: 'check', title: 'Approve', body: 'A person reviews the draft beside its field-level results. Whoever edited a listing cannot approve it.' },
  { id: 'publish', icon: 'store', title: 'Publish', body: 'Approved listings go to the marketplace. A listing shows as Live only after the marketplace confirms it.' },
]

export const SCENES: readonly SceneId[] = ['import', 'validate', 'fix', 'approve', 'publish']

const fullLen = heroTitleLength()
const fixedLen = [...FIXED_TITLE].length

/** What the example shows at each step, read out politely once per step. */
export const NARRATION: Record<SceneId, string> = {
  import: `A row from ${DEMO.file} becomes one product with its SKU, title and price. Generate is skipped because drafting is in development.`,
  validate: `The rules check each field. The title is ${fullLen} characters, over Flipkart’s ${LIMIT}, and it uses the banned word “Best”.`,
  fix: `${DEMO.editor} removes “Best” and moves the sleeve length and occasion out of the title. At ${fixedLen} characters, every check passes.`,
  approve: `${DEMO.approver} approves it. ${DEMO.editor} edited the listing, so the approval has to come from someone else.`,
  publish: 'Sent to Flipkart and waiting. It shows as Live only after Flipkart confirms.',
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
  validate: 7,
  fix: FIX_BEATS.allPass,
  approve: 3,
  publish: 3,
}

export function beatDelay(scene: SceneId, beat: number): number {
  switch (scene) {
    case 'import':
      return [700, 750, 950, 2000][beat] ?? 600
    case 'validate':
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
  if (scene === 'import') states = rows.map(() => 'pending')
  else if (scene === 'validate') {
    // beat 2 required · 3 Amazon length · 4 Flipkart length · 5 both banned-term checks
    const done = [2, 3, 4, 5, 5]
    states = first.map((s, i) => (beat >= (done[i] ?? 9) ? s : 'pending'))
  } else if (scene === 'fix') {
    if (beat < FIX_BEATS.recheck) states = first
    else states = rows.map((_, i) => (beat - FIX_BEATS.recheck > i ? 'pass' : 'pending'))
  } else states = rows.map(() => 'pass')
  return rows.map((r, i) => ({ ...r, state: states[i] ?? 'pending' }))
}
