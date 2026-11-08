import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { isValidElement } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { MARKETPLACES } from '@/components/la/marketplace'
import { HeroFinding } from './hero-finding'
import { HowItWorksDemo } from './how-it-works-demo'
import { Benefits } from './benefits'
import { MarketplaceStrip } from './marketplace-strip'
import { advance, checksAt, DRAFT, FINAL, FIX_BEATS, FIX_HEAD, FIX_TAIL, FIXED_TITLE, fixedText, LAST_BEAT, LIMIT, NARRATION, RAIL, SCENES, START } from './how-it-works-script'
import { DESCRIBES_YOU, HERO_EXAMPLE, heroFindings, heroTitleLength, BENEFITS, MARKET_STATUS, signupChip, STAGE_CHIP, stageOf } from './model'
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
  it('renders as a labelled example with no interactive controls and shows the "Fixed for you" trail', () => {
    render(<HeroFinding />)
    expect(screen.getByText('Example')).toBeTruthy()
    expect(screen.getByText(/An example listing, not real product data/)).toBeTruthy()
    expect(screen.getByText('Fixed for you')).toBeTruthy()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.queryAllByRole('link')).toHaveLength(0)
    expect(screen.getByText(`${heroTitleLength()} / ${HERO_EXAMPLE.limits.flipkart} characters`)).toBeTruthy()
  })
})

describe('marketplace status', () => {
  it('covers every marketplace the product shows, once', () => {
    const ids = MARKET_STATUS.flatMap((m) => m.ids)
    expect(new Set(ids).size).toBe(ids.length)
    expect([...ids].sort()).toEqual(MARKETPLACES.map((m) => m.id).sort())
  })
  it('marks only Amazon live, Flipkart coming soon and every unsupported marketplace as roadmap', () => {
    expect(stageOf('amazon')).toBe('live')
    expect(stageOf('flipkart')).toBe('soon')
    for (const m of MARKETPLACES.filter((x) => !x.supported)) expect(stageOf(m.id)).toBe('roadmap')
    expect(MARKET_STATUS.filter((m) => STAGE_CHIP[m.stage].status === 'live').flatMap((m) => m.ids)).toEqual(['amazon'])
  })
})

describe('benefits', () => {
  afterEach(cleanup)
  it('shows the five live features with short titles and one line each', () => {
    expect(BENEFITS.map((b) => b.id)).toEqual(['draft', 'photos', 'checks', 'fixes', 'images'])
    for (const b of BENEFITS) {
      const words = b.title.split(/\s+/).length
      expect(words).toBeGreaterThanOrEqual(3)
      expect(words).toBeLessThanOrEqual(6)
      expect(b.body).not.toMatch(/in development|coming soon|will /i)
      expect(b.body).not.toMatch(/\d/)
    }
    const { container } = render(<Benefits />)
    expect(container.querySelectorAll('li')).toHaveLength(BENEFITS.length)
    expect(screen.getByTestId('benefit-fixes').textContent).toContain('Fixed for you')
  })
})

describe('marketplace strip', () => {
  afterEach(cleanup)
  it('names all six marketplaces with their own stage and keeps only Amazon in full colour', () => {
    const { container } = render(<MarketplaceStrip />)
    expect(container.querySelectorAll('li')).toHaveLength(MARKETPLACES.length)
    expect(screen.getByTestId('strip-amazon').textContent).toBe('Amazon●Live')
    expect(screen.getByTestId('strip-flipkart').textContent).toContain('Coming soon')
    for (const id of ['myntra', 'ajio', 'meesho', 'nykaa']) expect(screen.getByTestId(`strip-${id}`).textContent).toContain('On the roadmap')
    // The roadmap and coming-soon stages carry their own glyphs: never a dash, never "paused" bars.
    expect(container.textContent).not.toMatch(/[–—❚]/)
    const muted = [...container.querySelectorAll('[data-slot="marketplace-tile"][data-muted]')].map((t) => t.getAttribute('data-marketplace'))
    expect(muted).toEqual(['flipkart', 'myntra', 'ajio', 'meesho', 'nykaa'])
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
  it('removes the banned word and the sleeve/occasion tail from the hero title', () => {
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
    expect(states('draft', LAST_BEAT.draft)).toEqual(['pending', 'pending', 'pending', 'pending', 'pending'])
    expect(states('check', LAST_BEAT.check)).toEqual(['pass', 'pass', 'fail', 'fail', 'fail'])
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
  it('plays all six steps, drafting included, and publishes to Amazon, the live marketplace', () => {
    expect([...SCENES]).toEqual(['import', 'draft', 'check', 'fix', 'approve', 'publish'])
    expect(RAIL.map((r) => r.title)).toEqual(['Import', 'Draft', 'Check', 'Fix', 'Approve', 'Publish'])
    expect(DRAFT.bullets.length).toBeGreaterThan(0)
    expect(NARRATION.publish).toMatch(/Live only after Amazon confirms/)
    expect(NARRATION.fix).toMatch(/Fixed for you/)
    for (const text of [...Object.values(NARRATION), ...RAIL.map((r) => r.body)]) expect(text).not.toMatch(/Sent to Flipkart|Live on Flipkart/)
  })
})

/** A stand-in IntersectionObserver that reports every observed element fully on screen. */
class OnScreenObserver {
  private cb: IntersectionObserverCallback
  constructor(cb: IntersectionObserverCallback) {
    this.cb = cb
  }
  observe(target: Element) {
    const rect = { height: 2000 } as DOMRectReadOnly
    this.cb([{ target, isIntersecting: true, intersectionRatio: 1, intersectionRect: rect } as IntersectionObserverEntry], this as unknown as IntersectionObserver)
  }
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return []
  }
}

describe('how it works demo', () => {
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
    vi.unstubAllGlobals()
    window.matchMedia = realMatchMedia
  })

  it('without IntersectionObserver renders every step, the controls and the finished state, without autoplay', () => {
    setReduced(false)
    expect(typeof IntersectionObserver).toBe('undefined')
    render(<HowItWorksDemo />)
    for (const s of RAIL) expect(screen.getByTestId(`demo-step-${s.id}`)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Play animation' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Replay animation' })).toBeTruthy()
    const current = screen.getByRole('button', { name: /Publish, current step/ })
    expect(current.getAttribute('aria-current')).toBe('step')
    expect(screen.getByTestId('demo-narration').textContent).toBe(NARRATION.publish)
    expect(screen.getAllByText('Live on Amazon').length).toBeGreaterThan(0)
  })

  it('lets a person view any step and announces it politely', () => {
    setReduced(false)
    render(<HowItWorksDemo />)
    fireEvent.click(screen.getByTestId('demo-step-draft'))
    const narration = screen.getByTestId('demo-narration')
    expect(narration.getAttribute('aria-live')).toBe('polite')
    expect(narration.textContent).toBe(NARRATION.draft)
    expect(screen.getByTestId('demo-step-draft').getAttribute('aria-current')).toBe('step')
    expect(screen.getByTestId('demo-step-publish').getAttribute('aria-current')).toBeNull()
  })

  it('puts the pause control before the moving stage, and it toggles play and pause', () => {
    setReduced(false)
    vi.stubGlobal('IntersectionObserver', OnScreenObserver)
    render(<HowItWorksDemo />)
    const pause = screen.getByTestId('demo-play')
    const stage = screen.getByTestId('demo-stage')
    // Reached before the motion in reading order, so a phone does not scroll past it to stop it.
    expect(pause.compareDocumentPosition(stage) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // Autoplaying: the control offers Pause, and the narration stays quiet for screen readers.
    expect(pause.getAttribute('aria-label')).toBe('Pause animation')
    expect(screen.getByTestId('demo-narration').getAttribute('aria-live')).toBe('off')
    fireEvent.click(pause)
    expect(pause.getAttribute('aria-label')).toBe('Play animation')
    expect(pause.textContent).toContain('Play')
    // Paused: nothing blinks, and what the person picks is announced.
    expect(stage.querySelector('.caret-blink')).toBeNull()
    expect(screen.getByTestId('demo-narration').getAttribute('aria-live')).toBe('polite')
    fireEvent.click(pause)
    expect(pause.getAttribute('aria-label')).toBe('Pause animation')
  })

  it('with reduced motion shows no play controls, never blinks and keeps every step viewable', () => {
    setReduced(true)
    vi.stubGlobal('IntersectionObserver', OnScreenObserver)
    render(<HowItWorksDemo />)
    expect(screen.queryByTestId('demo-play')).toBeNull()
    expect(screen.queryByTestId('demo-replay')).toBeNull()
    expect(screen.getByText(/reduced motion/)).toBeTruthy()
    fireEvent.click(screen.getByTestId('demo-step-fix'))
    expect(screen.getByTestId('demo-narration').textContent).toBe(NARRATION.fix)
    expect(screen.getByTestId('demo-stage').querySelector('.caret-blink')).toBeNull()
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
