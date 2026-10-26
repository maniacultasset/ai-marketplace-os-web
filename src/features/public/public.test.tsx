import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { isValidElement } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { MARKETPLACES } from '@/components/la/marketplace'
import { HeroFinding } from './hero-finding'
import { HowItWorksDemo } from './how-it-works-demo'
import { advance, checksAt, FINAL, FIX_BEATS, FIX_HEAD, FIX_TAIL, FIXED_TITLE, fixedText, LAST_BEAT, LIMIT, NARRATION, RAIL, SCENES, START } from './how-it-works-script'
import { DESCRIBES_YOU, HERO_EXAMPLE, heroFindings, heroTitleLength, MARKET_STATUS, signupChip, STAGE_CHIP } from './model'
import { Ph, POLICY_SECTIONS } from './privacy-policy'
import { LEGAL_EMAIL, TERMS_SECTIONS } from './terms'

describe('hero example (seeded kurta-set rules)', () => {
  // jsdom has no matchMedia; the length count-up asks for it. Report reduced motion so the real
  // value renders at once.
  beforeAll(() => {
    window.matchMedia ??= ((query: string) => ({
      matches: query.includes('reduce'),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as typeof window.matchMedia
  })
  it('has a title that passes Amazon’s 200 limit but breaks Flipkart’s 150', () => {
    const len = heroTitleLength()
    expect(len).toBeGreaterThan(HERO_EXAMPLE.limits.flipkart)
    expect(len).toBeLessThanOrEqual(HERO_EXAMPLE.limits.amazon)
  })
  it('derives exactly the findings the rules would raise', () => {
    const f = heroFindings()
    expect(f.map((x) => `${x.marketplace}:${x.code}`)).toEqual(['flipkart:FIELD_TOO_LONG', 'amazon:BANNED_TERM', 'flipkart:BANNED_TERM'])
    expect(f[0]?.message).toContain(String(heroTitleLength()))
  })
  it('renders as a labelled example with no interactive controls', () => {
    render(<HeroFinding />)
    expect(screen.getByText('Example')).toBeTruthy()
    expect(screen.getByText(/illustrative example/i)).toBeTruthy()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.queryAllByRole('link')).toHaveLength(0)
    expect(screen.getByText(`${heroTitleLength()} / ${HERO_EXAMPLE.limits.flipkart} characters`)).toBeTruthy()
  })
})

describe('marketplace status', () => {
  it('never claims a marketplace is live', () => {
    for (const m of MARKET_STATUS) expect(STAGE_CHIP[m.stage].status).not.toBe('live')
  })
  it('puts Amazon in setup, Flipkart pending and every unsupported marketplace under Later', () => {
    const stageOf = (id: string) => MARKET_STATUS.find((m) => m.ids.includes(id as never))?.stage
    expect(stageOf('amazon')).toBe('in-setup')
    expect(stageOf('flipkart')).toBe('pending')
    for (const m of MARKETPLACES.filter((x) => !x.supported)) expect(stageOf(m.id)).toBe('later')
  })
})

describe('sign-up', () => {
  it('maps every request status to a glyph chip with its own word', () => {
    expect(signupChip('pending')).toEqual({ status: 'working', label: 'Waiting for review' })
    expect(signupChip('approved').status).toBe('live')
    expect(signupChip('rejected').status).toBe('error')
  })
  it('keeps the five p01 options', () => {
    expect(DESCRIBES_YOU).toHaveLength(5)
  })
})

describe('privacy policy', () => {
  it('has unique anchor ids and the sections DPDP readers look for', () => {
    const ids = POLICY_SECTIONS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ['data-we-collect', 'ai-processing', 'retention', 'cookies', 'your-rights', 'grievance-officer']) {
      expect(ids).toContain(id)
    }
  })
  it('has no placeholder left in any section', () => {
    // Walk the element trees without rendering (the sections hold router links).
    const hasPh = (node: unknown): boolean => {
      if (Array.isArray(node)) return node.some(hasPh)
      if (!isValidElement(node)) return false
      if (node.type === Ph) return true
      return hasPh((node.props as { children?: unknown }).children)
    }
    for (const s of POLICY_SECTIONS) expect(hasPh(s.body), s.id).toBe(false)
  })
  it('renders placeholders visibly', () => {
    render(<Ph>contact email</Ph>)
    expect(screen.getByText('[PLACEHOLDER: contact email]')).toBeTruthy()
  })
})

describe('how it works demo: script', () => {
  it('edits the hero title by removing the banned word and the sleeve/occasion tail', () => {
    expect(HERO_EXAMPLE.title.startsWith(FIX_HEAD)).toBe(true)
    expect(HERO_EXAMPLE.title.endsWith(FIX_TAIL)).toBe(true)
    expect([...FIXED_TITLE].length).toBeLessThanOrEqual(LIMIT)
    expect(FIXED_TITLE.toLowerCase().split(/[^a-z0-9']+/)).not.toContain(HERO_EXAMPLE.bannedTerm)
    const start = fixedText(0)
    expect(start.head + FIXED_TITLE + start.tail).toBe(HERO_EXAMPLE.title)
    const end = fixedText(FIX_BEATS.allPass)
    expect(end.head + FIXED_TITLE + end.tail).toBe(FIXED_TITLE)
    expect(end.caret).toBeNull()
  })
  it('fails the same checks the hero findings raise, then passes them all only after the recheck', () => {
    const states = (s: Parameters<typeof checksAt>[0], b: number) => checksAt(s, b).map((c) => c.state)
    expect(states('validate', LAST_BEAT.validate)).toEqual(['pass', 'pass', 'fail', 'fail', 'fail'])
    expect(states('fix', FIX_BEATS.tailDone)).toEqual(['pass', 'pass', 'fail', 'fail', 'fail'])
    expect(states('fix', FIX_BEATS.allPass)).toEqual(['pass', 'pass', 'pass', 'pass', 'pass'])
    expect(checksAt('fix', FIX_BEATS.allPass)[2]?.detail).toBe(`${[...FIXED_TITLE].length} / ${LIMIT}`)
  })
  it('walks every beat of every step in order and loops back to the start', () => {
    let p = START
    const seen: string[] = []
    for (let i = 0; i < 500 && !(i > 0 && p.scene === 0 && p.beat === 0); i++) {
      if (p.beat === 0) seen.push(SCENES[p.scene]!)
      p = advance(p)
    }
    expect(seen).toEqual([...SCENES])
    expect(advance(FINAL)).toEqual(START)
  })
  it('keeps Generate on the rail as in development, never as a played step', () => {
    const gen = RAIL.find((r) => r.id === 'generate')
    expect(gen?.inDevelopment).toBe(true)
    expect(SCENES as readonly string[]).not.toContain('generate')
    expect(NARRATION.publish).toMatch(/Live only after Flipkart confirms/)
  })
})

describe('how it works demo: static fallback (no IntersectionObserver)', () => {
  const realMatchMedia = window.matchMedia
  const setReduced = (reduce: boolean) => {
    window.matchMedia = ((query: string) => ({
      matches: reduce && query.includes('reduce'),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as typeof window.matchMedia
  }
  beforeEach(cleanup)
  afterEach(() => {
    cleanup()
    window.matchMedia = realMatchMedia
  })

  it('renders every step label, the controls, and the finished state without autoplay', () => {
    setReduced(false)
    expect(typeof IntersectionObserver).toBe('undefined')
    render(<HowItWorksDemo />)
    for (const s of RAIL) expect(screen.getAllByText(s.title).length).toBeGreaterThan(0)
    expect(screen.getAllByText('In development').length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /^Generate/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Replay' })).toBeTruthy()
    const current = screen.getByRole('button', { name: /Publish, current step/ })
    expect(current.getAttribute('aria-current')).toBe('step')
    expect(screen.getByTestId('demo-narration').textContent).toBe(NARRATION.publish)
    expect(screen.getByText('Example')).toBeTruthy()
  })

  it('lets a person view any step and announces it politely', () => {
    setReduced(false)
    render(<HowItWorksDemo />)
    fireEvent.click(screen.getByTestId('demo-step-validate'))
    const narration = screen.getByTestId('demo-narration')
    expect(narration.getAttribute('aria-live')).toBe('polite')
    expect(narration.textContent).toBe(NARRATION.validate)
    expect(screen.getByTestId('demo-step-validate').getAttribute('aria-current')).toBe('step')
    expect(screen.getByTestId('demo-step-publish').getAttribute('aria-current')).toBeNull()
  })

  it('with reduced motion shows no play controls, only the steps', () => {
    setReduced(true)
    render(<HowItWorksDemo />)
    expect(screen.queryByRole('button', { name: 'Play' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull()
    expect(screen.getByText(/reduced motion/)).toBeTruthy()
    fireEvent.click(screen.getByTestId('demo-step-fix'))
    expect(screen.getByTestId('demo-narration').textContent).toBe(NARRATION.fix)
  })
})

describe('terms and conditions', () => {
  it('keeps the company’s 16 numbered sections plus the contact block, with unique anchors', () => {
    const ids = TERMS_SECTIONS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toHaveLength(17)
    expect(ids.at(-1)).toBe('contact')
  })
  it('names the legal contact on the company domain', () => {
    expect(LEGAL_EMAIL).toBe('mukul@kuinn.in')
  })
})
