/**
 * The Kuinn brand theme, in one place.
 *
 * This file is the readable reference for the brand: colour roles, type, radii, elevation and motion
 * as they are applied today. The values themselves live as CSS custom properties (src/index.css for the
 * product kit, src/styles/landing.css for the marketing-only tokens), and components use the Tailwind
 * names (bg-canvas, text-ink-2, rounded-card, bg-night ...), never a raw hex. `brand-theme.test.ts`
 * fails if a value here drifts from the CSS, so this file and the stylesheet always agree.
 *
 * See docs/BRAND.md for when to use each role.
 */

export const BRAND = {
  name: 'Kuinn',
  tagline: 'Automate your marketplace listing operations, end to end.',
  legalName: 'Maniacult Technology Pvt Ltd',
} as const

/** Product colour roles (src/index.css :root). A matte, slightly desaturated light theme. */
export const COLOR = {
  /** Page background: a cool off-white. */
  canvas: '#edf0f5',
  /** Cards and raised surfaces. */
  surface: '#fbfcfd',
  subtle: '#e8ecf3',
  sunken: '#f4f6f9',
  line: '#dde2ec',
  lineStrong: '#c8d0e0',
  /** Text: ink for headings and body, ink-2 for secondary, ink-3 for captions. */
  ink: '#1b2238',
  ink2: '#4a5573',
  ink3: '#586280',
  /** The one brand colour: Kuinn indigo. Primary buttons, links, the active state. */
  brand: '#2f46d6',
  brandHover: '#2639b6',
  brandBg: '#e7ebfb',
  brandLine: '#b9c4f2',
  brandInk: '#1b2a8a',
  success: '#1d7449',
  successBg: '#e1f1e8',
  attention: '#965200',
  attentionBg: '#f8edda',
  danger: '#ad2a1f',
  dangerBg: '#f8e5e2',
} as const

/**
 * Marketing-only roles (src/styles/landing.css). The landing alternates light bands with "night"
 * bands: the brand indigo taken almost to black, so a dark section still reads as Kuinn, never as a
 * generic black. `brandOnNight` is the indigo lifted for text and marks on night (>= 4.5:1).
 */
export const MARKETING = {
  night: '#0b1028',
  night2: '#121a3d',
  nightLine: 'rgb(255 255 255 / 0.09)',
  nightInk: '#eef0fa',
  nightInk2: '#a9b1d3',
  brandOnNight: '#8f9cff',
  /** The footer's ground: deeper than night, so the footer reads as the page's floor. */
  floor: '#070a1a',
} as const

export const FONT = {
  /** Headlines and the wordmark. Variable, optical sizing on. */
  display: '"Bricolage Grotesque Variable"',
  /** Body, UI and data. Variable, optical sizing on. */
  ui: '"DM Sans Variable"',
} as const

export const RADIUS = {
  control: '8px',
  card: '12px',
  stage: '24px',
  /** Marketing panels (final call to action, product window). */
  panel: '28px',
  pill: '999px',
} as const

export const MOTION = {
  /** Calm, no bounce. Only transform and opacity move. */
  easeOutCalm: 'cubic-bezier(0.22, 1, 0.36, 1)',
  durFade: '320ms',
  durRise: '440ms',
  stagger: '60ms',
  /** One full pass of the trusted-by band. Slow enough to read every name. */
  marquee: '48s',
} as const

/**
 * Landing type scale (clamped, so it grows smoothly between phone and desktop). Headlines use
 * Bricolage at weight 700 with negative tracking that tightens as the size grows.
 */
export const TYPE = {
  heroH1: 'clamp(2.6rem, 3.4vw + 1.4rem, 5.25rem)',
  sectionH2: 'clamp(2rem, 2.4vw + 1.1rem, 3.5rem)',
  eyebrow: '13px',
  lede: 'clamp(1.0625rem, 0.3vw + 1rem, 1.25rem)',
} as const
