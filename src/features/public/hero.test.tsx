// The landing hero: its products (hero-story.ts), the theatre (hero-theatre.tsx) and the final call to action.
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FinalCta } from './final-cta'
import { HeroTheatre } from './hero-theatre'
import { BEAT, frameAt, productMs, STAGES, STILL_INDEX, THEATRE } from './hero-theatre-story'
import {
  APPROVER,
  BEATS,
  beatDelay,
  CHECKS,
  CYCLE_MS,
  ENTER,
  ENTER_HOLD_MS,
  FINAL,
  LAST,
  next,
  PRODUCT_MS,
  PRODUCTS,
  STATUS_LABEL,
  STORY,
  storyAt,
  titleLength,
} from './hero-story'
import { HERO_EXAMPLE } from './model'

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

/** Reports every observed element fully on screen. */
class OnScreenObserver {
  protected cb: IntersectionObserverCallback
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

/** Runs the clock in small steps, so each tick's timer is set before the next one is due. */
const run = (ms: number) => {
  for (let t = 0; t < ms; t += 100) act(() => vi.advanceTimersByTime(Math.min(100, ms - t)))
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  window.matchMedia = realMatchMedia
})

describe('hero story', () => {
  const at = (id: string) => BEATS.findIndex((b) => b.id === id)

  it('plays each product in order inside one loop, with a hold after the last beat', () => {
    const times = BEATS.map((b) => b.at)
    expect(times).toEqual([...times].sort((x, y) => x - y))
    expect(BEATS[0]).toEqual({ id: 'in', at: 0 })
    expect(PRODUCT_MS - BEATS[LAST]!.at).toBeGreaterThanOrEqual(1200)
    let total = 0
    for (let b = 0; b <= LAST; b++) total += beatDelay(b)
    expect(total).toBe(PRODUCT_MS)
    expect(CYCLE_MS).toBe(PRODUCT_MS * 3)
    // The entrance shows the first product finished, then the second product comes in.
    expect(beatDelay(ENTER)).toBe(ENTER_HOLD_MS)
    expect(next({ product: 0, beat: ENTER })).toEqual({ product: 1, beat: 0 })
    expect(next({ product: 2, beat: LAST })).toEqual({ product: 0, beat: 0 })
    expect(next({ product: 1, beat: 3 })).toEqual({ product: 1, beat: 4 })
  })

  it('walks every product from photo to listing: confirm, draft, checks, fix, ready', () => {
    PRODUCTS.forEach((p, i) => {
      const start = storyAt(i, 0)
      expect(start).toMatchObject({ confirmed: false, drafted: false, finding: false, fixed: false, status: 'drafting' })
      expect(start.ticked.size).toBe(0)
      expect(storyAt(i, at('confirm')).confirmed).toBe(true)
      expect(storyAt(i, at('draft'))).toMatchObject({ drafted: true, spot: true })
      // The spotlight settles back before the checks start.
      expect(storyAt(i, at('calm')).spot).toBe(false)
      const checks = storyAt(i, at('checks'))
      expect(checks.status).toBe('checking')
      expect(checks.ticked.has(p.failing)).toBe(false)
      expect(checks.ticked.size).toBe(2)
      expect(storyAt(i, at('fix')).ticked.size).toBe(3)
      expect(storyAt(i, at('ready')).status).toBe('ready')
    })
    expect(storyAt(0, ENTER)).toEqual(FINAL)
  })

  it('spotlights different live features per product, and ends each one truthfully', () => {
    const [kurta, tee, shirt] = PRODUCTS
    expect(kurta!.spotlight).toBe('voice')
    expect(storyAt(0, LAST).status).toBe('approved')
    expect(STATUS_LABEL.approved).toBe(`Approved by ${APPROVER.name}`)
    expect(tee!.spotlight).toBe('variants')
    expect(tee!.sizes).toHaveLength(6)
    expect([at('end1'), at('end2'), at('end3')].map((b) => storyAt(1, b).status)).toEqual(['approved', 'sent', 'live'])
    expect(shirt!.photoFact.label).toBe('Colour')
    expect(shirt!.fixTag).toMatch(/your sheet/i)
    expect(shirt!.fixCaption).toMatch(/nothing guessed/i)
    expect(storyAt(2, LAST).status).toBe('ready')
    // "Fixed for you" (green) only marks safe fixes; the size chart comes from the seller (brand blue).
    expect(PRODUCTS.map((p) => p.fixTag)).toEqual(['Fixed for you', 'Fixed for you', 'Added from your sheet'])
    expect(PRODUCTS.map((p) => p.fixTone)).toEqual(['success', 'success', 'brand'])
    // The t-shirt's fix says exactly what changed.
    expect(tee!.fixCaption).toBe(`Title trimmed from ${titleLength(tee!.draftTitle)} to ${titleLength(tee!.title)} characters`)
    const copy = JSON.stringify(PRODUCTS) + JSON.stringify(STORY) + JSON.stringify(STATUS_LABEL)
    // No em dashes, no white-background claim and nothing that is not live yet.
    expect(copy).not.toMatch(/—|white background|resend|re-send|resubmit/i)
    // The rail's own list reads the marketplaces out; the summary does not repeat them.
    expect(STORY.summary).not.toMatch(/flipkart|myntra|roadmap/i)
    expect(JSON.stringify(STATUS_LABEL)).not.toMatch(/flipkart/i)
  })

  it('uses the seeded rules: "Best" is banned and the trimmed title fits Amazon’s 200 characters', () => {
    const [kurta, tee] = PRODUCTS
    expect(kurta!.bannedWord!.toLowerCase()).toBe(HERO_EXAMPLE.bannedTerm)
    expect(kurta!.draftTitle).toBe(`${kurta!.bannedWord} ${kurta!.title}`)
    expect(kurta!.title.toLowerCase().split(/[^a-z0-9']+/)).not.toContain(HERO_EXAMPLE.bannedTerm)
    const limit = HERO_EXAMPLE.limits.amazon
    expect(limit).toBe(200)
    expect([...tee!.draftTitle].length).toBeGreaterThan(limit)
    expect([...tee!.title].length).toBeLessThanOrEqual(limit)
    expect(tee!.draftTitle.startsWith(tee!.title)).toBe(true)
    expect(tee!.finding).toBe(`Title is ${[...tee!.draftTitle].length} characters`)
    expect(CHECKS[0]!.text).toContain(String(limit))
    for (const p of PRODUCTS) expect([...p.title].length).toBeLessThanOrEqual(limit)
    // A title shortened for the card keeps whole phrases from the shipped title, then an ellipsis.
    expect(tee!.shownTitle!.endsWith('…')).toBe(true)
    expect(tee!.title.startsWith(tee!.shownTitle!.slice(0, -1))).toBe(true)
    expect(tee!.title.slice(tee!.shownTitle!.length - 1, tee!.shownTitle!.length + 1)).toBe(', ')
  })

  it('keeps every visible title within two lines, so none is cut mid-word by the clamp', () => {
    for (const p of PRODUCTS) expect([...(p.shownTitle ?? p.draftTitle)].length).toBeLessThanOrEqual(70)
  })
})

describe('hero theatre story', () => {
  it('takes every product through all six stages, ending live', () => {
    for (const p of THEATRE) {
      const stages = new Set<number>()
      for (let t = 0; t <= productMs(p); t += 100) stages.add(frameAt(p, t).stage)
      expect([...stages].sort((x, y) => x - y)).toEqual([0, 1, 2, 3, 4, 5, 6])
      expect(frameAt(p, productMs(p) - 1).status).toBe('live')
    }
    expect(STAGES.map((s) => s.label)).toEqual(['Photos in', 'Read', 'Written', 'Checked', 'Approved', 'Live'])
  })

  it('catches one rule per product and fixes it before approval', () => {
    for (const p of THEATRE) {
      expect(p.checks.filter((c) => c.flag)).toHaveLength(1)
      expect(frameAt(p, BEAT.fix - 1).fixed).toBe(false)
      expect(frameAt(p, BEAT.fix).fixed).toBe(true)
      expect(BEAT.fix).toBeLessThan(BEAT.approve)
    }
  })

  it('shows a refused value fixed and resent automatically on exactly one product, after it was sent', () => {
    const withRejection = THEATRE.filter((p) => p.rejection)
    expect(withRejection).toHaveLength(1)
    const tee = withRejection[0]!
    expect(frameAt(tee, BEAT.rejected).status).toBe('rejected')
    expect(frameAt(tee, BEAT.diagnosed).status).toBe('fixing')
    expect(frameAt(tee, BEAT.resent).status).toBe('resent')
    expect(frameAt(tee, BEAT.liveAfterFix).status).toBe('live')
    expect(BEAT.send).toBeLessThan(BEAT.rejected)
  })

  it('counts titles by their real length and keeps every shipped title within Amazon’s 200', () => {
    for (const p of THEATRE) {
      expect(p.count.final).toBeLessThanOrEqual(200)
      expect(p.count.final).toBe(titleLength(p.product.title))
    }
  })

  it('types the title out in full before the checks start', () => {
    for (const p of THEATRE) expect(BEAT.write + p.draft.length * BEAT.charMs).toBeLessThanOrEqual(BEAT.check)
  })
})

describe('hero theatre', () => {
  it('is one named figure with nothing to tab to', () => {
    setReduced(false)
    vi.stubGlobal('IntersectionObserver', OnScreenObserver)
    render(<HeroTheatre />)
    const fig = screen.getByRole('figure')
    expect(fig.getAttribute('aria-label')).toMatch(/live Amazon listing/)
    expect(fig.querySelectorAll('a, button, input, [tabindex]')).toHaveLength(0)
  })

  it('plays while on screen and moves on to the next product', () => {
    vi.useFakeTimers()
    setReduced(false)
    vi.stubGlobal('IntersectionObserver', OnScreenObserver)
    render(<HeroTheatre />)
    const fig = screen.getByTestId('hero-theatre')
    expect(fig.getAttribute('data-product')).toBe('kurta')
    run(productMs(THEATRE[0]!) + 200)
    expect(fig.getAttribute('data-product')).toBe('tee')
  })

  it('holds still while a mouse is over it', () => {
    vi.useFakeTimers()
    setReduced(false)
    vi.stubGlobal('IntersectionObserver', OnScreenObserver)
    render(<HeroTheatre />)
    const fig = screen.getByTestId('hero-theatre')
    fireEvent.pointerEnter(fig, { pointerType: 'mouse' })
    const phase = fig.getAttribute('data-phase')
    run(3000)
    expect(fig.getAttribute('data-phase')).toBe(phase)
  })

  it('with reduced motion shows one finished still frame and never moves', () => {
    vi.useFakeTimers()
    setReduced(true)
    vi.stubGlobal('IntersectionObserver', OnScreenObserver)
    render(<HeroTheatre />)
    const fig = screen.getByTestId('hero-theatre')
    expect(fig.getAttribute('data-product')).toBe(THEATRE[STILL_INDEX]!.product.id)
    expect(fig.getAttribute('data-phase')).toBe('live')
    run(20_000)
    expect(fig.getAttribute('data-phase')).toBe('live')
  })
})

describe('final call to action', () => {
  async function renderCta() {
    const rootRoute = createRootRoute({ component: () => <FinalCta /> })
    const router = createRouter({ routeTree: rootRoute, history: createMemoryHistory({ initialEntries: ['/'] }) })
    render(<RouterProvider router={router} />)
    return screen.findByTestId('final-cta')
  }

  it('says what is live, asks for access or a demo, and carries the pricing note', async () => {
    setReduced(false)
    const cta = await renderCta()
    // The pricing anchor the header and footer link to (Amazon's developer website rules).
    expect(cta.id).toBe('pricing')
    expect(cta.textContent).toContain('Live on Amazon. Flipkart is next.')
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Stop juggling marketplaces. Start scaling revenue.')
    expect(screen.getByRole('link', { name: 'Request access' }).getAttribute('href')).toBe('/signup')
    expect(screen.getByRole('link', { name: 'Book a demo' }).getAttribute('href')).toMatch(/^mailto:/)
    expect(cta.textContent).toContain('Quote-based pricing for your catalog')
    expect(cta.textContent).toContain('Nothing goes live without your approval')
    // Another product's claims never carry over from the reference.
    expect(cta.textContent).not.toMatch(/free trial|credit card|sellers scaling|example/i)
  })
})
