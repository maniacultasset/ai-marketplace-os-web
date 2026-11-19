/**
 * The hero theatre's story: one product at a time travels the whole path, end to end, while the step
 * track above it lights up: photos in, read, written, checked, approved, live. Each product shows a
 * different part of what is live today, so one cycle shows all of it:
 *  - kurta set: a fact read from the photo, the banned word "Best" caught and fixed before approval,
 *    approved by a second person, then live on Amazon;
 *  - t-shirt: the title trimmed to Amazon's 200 characters, then, after it is sent, Amazon refuses a
 *    colour value; Kuinn diagnoses it, swaps in Amazon's allowed value and resends on its own
 *    (backend resolution: one automatic resend after a failed submission, capped), then live;
 *  - block print shirt: colour and pattern read from the photo, the size chart filled from the
 *    seller's sheet (never invented), approved, live.
 * Pure data and timing (testable on its own). Marketing illustration, never app data.
 */
import { PRODUCTS, titleLength, type HeroProduct } from './hero-story'

export const STAGES = [
  { id: 'in', label: 'Photos in' },
  { id: 'read', label: 'Read' },
  { id: 'write', label: 'Written' },
  { id: 'check', label: 'Checked' },
  { id: 'approve', label: 'Approved' },
  { id: 'live', label: 'Live' },
] as const

export type StageId = (typeof STAGES)[number]['id']

/** A rule check row in the listing column. `flag` fails until the fix lands. */
export interface TheatreCheck {
  text: string
  flag?: boolean
}

/** The marketplace's answer after sending, when it refuses something (the t-shirt only). */
export interface Rejection {
  code: string
  message: string
  diagnosis: string
  fix: string
}

export interface TheatreProduct {
  product: HeroProduct
  /** Facts read off the photo: label, value, confidence. */
  read: readonly { label: string; value: string; confidence: number }[]
  /** The title as drafted (may hold the banned word) and as it ships. */
  draft: string
  final: string
  /** The word to strike in the draft, if any. */
  strike?: string
  checks: readonly TheatreCheck[]
  /** What the fix line says once the flagged check is fixed. */
  fixLabel: string
  fixDetail: string
  /** True: a safe fix Kuinn made (green). False: filled from the seller's sheet (indigo). */
  fixBySelf: boolean
  rejection?: Rejection
  /** The title's real length as drafted and as it ships (the shown draft may be shortened). */
  count: { draft: number; final: number }
}

const [kurta, tee, shirt] = PRODUCTS as readonly [HeroProduct, HeroProduct, HeroProduct]

export const THEATRE: readonly TheatreProduct[] = [
  {
    product: kurta,
    read: [
      { label: 'Collar', value: 'Mandarin', confidence: 94 },
      { label: 'Print', value: 'Floral', confidence: 97 },
      { label: 'Sleeve', value: '3/4', confidence: 91 },
    ],
    draft: kurta.draftTitle,
    final: kurta.title,
    strike: kurta.bannedWord,
    checks: [{ text: 'Within 200 characters' }, { text: 'No banned words', flag: true }, { text: 'Required fields filled' }, { text: 'Main image on white' }],
    fixLabel: 'Fixed for you',
    fixDetail: 'Removed “Best” from the title',
    fixBySelf: true,
    count: { draft: titleLength(kurta.draftTitle), final: titleLength(kurta.title) },
  },
  {
    product: tee,
    read: [
      { label: 'Neck', value: 'Round', confidence: 96 },
      { label: 'Fit', value: 'Oversized', confidence: 89 },
      { label: 'Sleeve', value: 'Half', confidence: 95 },
    ],
    draft: "Women's Oversized Cotton T-Shirt, Charcoal Grey, Round Neck, Drop Shoulder, Relaxed Fit…",
    final: "Women's Oversized Cotton T-Shirt, Charcoal Grey, Round Neck, Drop Shoulder, Relaxed Fit…",
    checks: [{ text: 'Within 200 characters', flag: true }, { text: 'No banned words' }, { text: 'Required fields filled' }, { text: 'Six sizes as variants' }],
    fixLabel: 'Fixed for you',
    fixDetail: `Title trimmed from ${titleLength(tee.draftTitle)} to ${titleLength(tee.title)} characters`,
    count: { draft: titleLength(tee.draftTitle), final: titleLength(tee.title) },
    fixBySelf: true,
    rejection: {
      code: 'Rejected by Amazon',
      message: 'Colour value “Charcoal Grey” is not allowed',
      diagnosis: 'Matched to Amazon’s colour list',
      fix: 'Set to “Grey”, resent automatically',
    },
  },
  {
    product: shirt,
    read: [
      { label: 'Colour', value: 'Maroon', confidence: 97 },
      { label: 'Pattern', value: 'Block print', confidence: 94 },
      { label: 'Collar', value: 'Band', confidence: 92 },
    ],
    draft: shirt.draftTitle,
    final: shirt.title,
    checks: [{ text: 'Within 200 characters' }, { text: 'No banned words' }, { text: 'Size chart attached', flag: true }, { text: 'Main image on white' }],
    fixLabel: 'Added from your sheet',
    fixDetail: 'Size chart attached, nothing guessed',
    fixBySelf: false,
    count: { draft: titleLength(shirt.draftTitle), final: titleLength(shirt.title) },
  },
]

/** One product's beats, in ms from its start. */
export const BEAT = {
  in: 0,
  scan: 700,
  chips: 1500,
  chipStagger: 260,
  write: 2600,
  /** Typing speed for the title, per character. */
  charMs: 18,
  check: 4300,
  checkStagger: 220,
  fix: 5500,
  approve: 6500,
  send: 7400,
  live: 8300,
  /** The t-shirt's rejection act, after sending. */
  rejected: 8300,
  diagnosed: 9300,
  resent: 10_200,
  liveAfterFix: 11_100,
} as const

export const HOLD_MS = 2600
export const CROSSFADE_MS = 600

/** How long one product plays, including the hold on its final frame. */
export const productMs = (p: TheatreProduct) => (p.rejection ? BEAT.liveAfterFix : BEAT.live) + HOLD_MS

export type Phase = 'in' | 'scan' | 'chips' | 'write' | 'check' | 'fix' | 'approve' | 'send' | 'rejected' | 'diagnosed' | 'resent' | 'live'

export interface TheatreFrame {
  phase: Phase
  /** The step track: index of the active stage (all before it are done). */
  stage: number
  scanning: boolean
  chips: number
  typed: number
  checks: number
  fixed: boolean
  approved: boolean
  status: 'drafting' | 'checking' | 'ready' | 'approved' | 'sent' | 'rejected' | 'fixing' | 'resent' | 'live'
}

/** What the theatre shows for a product at `t` ms. Pure: the component only advances `t`. */
export function frameAt(p: TheatreProduct, t: number): TheatreFrame {
  const r = p.rejection
  const after = (ms: number) => t >= ms
  const chips = after(BEAT.chips) ? Math.min(p.read.length, 1 + Math.floor((t - BEAT.chips) / BEAT.chipStagger)) : 0
  const typed = after(BEAT.write) ? Math.min(p.draft.length, Math.floor((t - BEAT.write) / BEAT.charMs)) : 0
  const checks = after(BEAT.check) ? Math.min(p.checks.length, 1 + Math.floor((t - BEAT.check) / BEAT.checkStagger)) : 0
  const phase: Phase =
    r && after(BEAT.liveAfterFix)
      ? 'live'
      : r && after(BEAT.resent)
        ? 'resent'
        : r && after(BEAT.diagnosed)
          ? 'diagnosed'
          : r && after(BEAT.rejected)
            ? 'rejected'
            : !r && after(BEAT.live)
              ? 'live'
              : after(BEAT.send)
                ? 'send'
                : after(BEAT.approve)
                  ? 'approve'
                  : after(BEAT.fix)
                    ? 'fix'
                    : after(BEAT.check)
                      ? 'check'
                      : after(BEAT.write)
                        ? 'write'
                        : after(BEAT.chips)
                          ? 'chips'
                          : after(BEAT.scan)
                            ? 'scan'
                            : 'in'
  const stage = (() => {
    switch (phase) {
      case 'in':
        return 0
      case 'scan':
      case 'chips':
        return 1
      case 'write':
        return 2
      case 'check':
      case 'fix':
        return 3
      case 'approve':
        return 4
      case 'live':
        return 6
      default:
        return 5
    }
  })()
  const status: TheatreFrame['status'] = {
    in: 'drafting',
    scan: 'drafting',
    chips: 'drafting',
    write: 'drafting',
    check: 'checking',
    fix: 'ready',
    approve: 'approved',
    send: 'sent',
    rejected: 'rejected',
    diagnosed: 'fixing',
    resent: 'resent',
    live: 'live',
  }[phase] as TheatreFrame['status']
  return {
    phase,
    stage,
    scanning: phase === 'scan' || phase === 'chips',
    chips,
    typed,
    checks,
    fixed: after(BEAT.fix),
    approved: after(BEAT.approve),
    status,
  }
}

/** The still frame (reduced motion, no script): the t-shirt, everything done, its fix shown. */
export const STILL_INDEX = 1
export const STILL_T = BEAT.liveAfterFix + 1

export const STATUS_TEXT: Record<TheatreFrame['status'], string> = {
  drafting: 'Drafting…',
  checking: 'Checking rules…',
  ready: 'Ready to approve',
  approved: 'Approved by Meera',
  sent: 'Sent to Amazon',
  rejected: 'Amazon refused a value',
  fixing: 'Kuinn is fixing it',
  resent: 'Resent automatically',
  live: 'Live on Amazon',
}
