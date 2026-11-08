// The landing hero stage (hero-stage.tsx, hero-story.ts) and the final call to action (final-cta.tsx).
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FinalCta } from './final-cta'
import { HeroStage } from './hero-stage'
import {
  APPROVER,
  BEATS,
  beatDelay,
  CHECKS,
  CTA_SLIPS,
  CYCLE_MS,
  ENTER,
  ENTER_HOLD_MS,
  FINAL,
  HERO_PHOTO,
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

function Hero() {
  const ref = useRef<HTMLElement>(null)
  return (
    <section ref={ref}>
      <HeroStage hero={ref} />
    </section>
  )
}

const beat = () => screen.getByTestId('hero-stage').getAttribute('data-beat')
const stage = () => screen.getByTestId('hero-stage')
/** jsdom never loads images: report every hero photo loaded. */
const loadPhotos = () => {
  for (const img of screen.getByTestId('hero-photo').querySelectorAll('img')) fireEvent.load(img)
}
/** md and up, motion on. */
const setWide = () => {
  setReduced(false)
  const reduced = window.matchMedia
  window.matchMedia = ((query: string) => ({ ...reduced(query), matches: /min-width: (768|1024)px/.test(query) })) as typeof window.matchMedia
}
/** Runs the clock in small steps, so each beat's timer is set before the next one is due. */
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

describe('hero stage', () => {
  it('is a named figure with a screen reader summary, no links, no controls and no tab stop', () => {
    setReduced(false)
    render(<Hero />)
    const fig = screen.getByTestId('hero-example')
    expect(fig.tagName).toBe('FIGURE')
    expect(fig.getAttribute('aria-label')).toBe(STORY.label)
    expect(fig.hasAttribute('tabindex')).toBe(false)
    expect(fig.textContent).not.toMatch(/example/i)
    expect(STORY.summary).not.toMatch(/example|white/i)
    expect(screen.getByText(STORY.summary).className).toContain('sr-only')
    expect(screen.getByTestId('hero-stage').getAttribute('aria-hidden')).toBe('true')
    expect(screen.queryAllByRole('link')).toHaveLength(0)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(fig.querySelector('[aria-live]')).toBeNull()
    expect(screen.getByRole('list', { name: 'Marketplaces' })).toBeTruthy()
  })

  it('shows only the original photos, sized up front; the other two load once the stage is seen', () => {
    setReduced(false)
    class Never extends OnScreenObserver {
      observe() {}
    }
    vi.stubGlobal('IntersectionObserver', Never)
    render(<Hero />)
    const imgs = () => [...screen.getByTestId('hero-photo').querySelectorAll('img')]
    expect(imgs().map((i) => i.getAttribute('src'))).toEqual([PRODUCTS[0]!.photo.src])
    cleanup()
    vi.stubGlobal('IntersectionObserver', OnScreenObserver)
    render(<Hero />)
    expect(imgs().map((i) => i.getAttribute('src'))).toEqual(PRODUCTS.map((p) => p.photo.src))
    for (const img of imgs()) {
      expect(img.getAttribute('src')).not.toMatch(/white/)
      expect(img.getAttribute('width')).toBe(String(HERO_PHOTO.width))
      expect(img.getAttribute('height')).toBe(String(HERO_PHOTO.height))
      expect(img.getAttribute('srcset')).toMatch(/ 420w, .+ 840w$/)
    }
    // Only the first photo may be high priority (from md, where it is above the fold); matchMedia says no here.
    expect(imgs()[0]!.getAttribute('fetchpriority')).toBe('auto')
    expect(imgs()[1]!.getAttribute('fetchpriority')).toBe('low')
    expect(imgs()[0]!.getAttribute('alt')).toBe(PRODUCTS[0]!.photo.alt)
    expect(imgs()[1]!.getAttribute('alt')).toBe('')
    // Nothing is laid over the photo.
    expect(screen.getByTestId('hero-photo').querySelectorAll(':scope > :not(img)')).toHaveLength(0)
  })

  it('gives only the first photo high priority from md, where the stage is above the fold', () => {
    setWide()
    vi.stubGlobal('IntersectionObserver', OnScreenObserver)
    render(<Hero />)
    const imgs = [...screen.getByTestId('hero-photo').querySelectorAll('img')]
    expect(imgs.map((i) => i.getAttribute('fetchpriority'))).toEqual(['high', 'low', 'low'])
  })

  it('waits for the next photo before moving to its product', () => {
    vi.useFakeTimers()
    setReduced(false)
    vi.stubGlobal('IntersectionObserver', OnScreenObserver)
    render(<Hero />)
    run(ENTER_HOLD_MS * 2)
    expect([stage().getAttribute('data-product'), beat()]).toEqual(['kurta', String(ENTER)])
    loadPhotos()
    run(ENTER_HOLD_MS)
    expect([stage().getAttribute('data-product'), beat()]).toEqual(['tee', '0'])
  })

  it('loops through the three products and never holds for hover, focus or a tap', () => {
    vi.useFakeTimers()
    setReduced(false)
    vi.stubGlobal('IntersectionObserver', OnScreenObserver)
    render(<Hero />)
    const fig = screen.getByTestId('hero-example')
    loadPhotos()
    expect(beat()).toBe(String(ENTER))
    expect(stage().getAttribute('data-product')).toBe('kurta')
    fireEvent.mouseEnter(fig)
    fireEvent.focus(fig)
    fireEvent.touchStart(fig)
    expect(stage().hasAttribute('data-paused')).toBe(false)
    run(ENTER_HOLD_MS)
    expect([stage().getAttribute('data-product'), beat()]).toEqual(['tee', '0'])
    run(BEATS[1]!.at)
    expect(beat()).toBe('1')
    // A full product later the shirt is in, then the kurta set again.
    run(PRODUCT_MS - BEATS[1]!.at)
    expect([stage().getAttribute('data-product'), beat()]).toEqual(['shirt', '0'])
    run(PRODUCT_MS)
    expect([stage().getAttribute('data-product'), beat()]).toEqual(['kurta', '0'])
  })

  it('rings the live dot when the t-shirt goes live on Amazon', () => {
    vi.useFakeTimers()
    setReduced(false)
    vi.stubGlobal('IntersectionObserver', OnScreenObserver)
    render(<Hero />)
    loadPhotos()
    expect(document.querySelector('.hero-ring')).toBeNull()
    run(ENTER_HOLD_MS + BEATS[LAST]!.at)
    expect(screen.getByTestId('hero-stage').getAttribute('data-product')).toBe('tee')
    expect(document.querySelector('.hero-ring')).not.toBeNull()
  })

  it('holds still while the tab is hidden', () => {
    vi.useFakeTimers()
    setReduced(false)
    vi.stubGlobal('IntersectionObserver', OnScreenObserver)
    render(<Hero />)
    const hidden = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    act(() => vi.advanceTimersByTime(CYCLE_MS))
    expect(beat()).toBe(String(ENTER))
    expect(stage().hasAttribute('data-paused')).toBe(true)
    // Visible again: it picks up from the same beat.
    hidden.mockReturnValue('visible')
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    loadPhotos()
    run(ENTER_HOLD_MS)
    expect([stage().getAttribute('data-product'), beat()]).toEqual(['tee', '0'])
    hidden.mockRestore()
  })

  it('resumes when the stage comes back on screen', () => {
    vi.useFakeTimers()
    setReduced(false)
    let report: ((on: boolean) => void) | undefined
    class Toggle extends OnScreenObserver {
      observe(target: Element) {
        report = (on) =>
          this.cb(
            [{ target, isIntersecting: on, intersectionRatio: on ? 1 : 0, intersectionRect: { height: on ? 2000 : 0 } } as IntersectionObserverEntry],
            this as unknown as IntersectionObserver,
          )
        report(true)
      }
    }
    vi.stubGlobal('IntersectionObserver', Toggle)
    render(<Hero />)
    loadPhotos()
    act(() => report!(false))
    act(() => vi.advanceTimersByTime(CYCLE_MS))
    expect(beat()).toBe(String(ENTER))
    act(() => report!(true))
    run(ENTER_HOLD_MS)
    expect([stage().getAttribute('data-product'), beat()]).toEqual(['tee', '0'])
  })

  it('clears its timer on unmount', () => {
    vi.useFakeTimers()
    setReduced(false)
    vi.stubGlobal('IntersectionObserver', OnScreenObserver)
    const { unmount } = render(<Hero />)
    loadPhotos()
    expect(vi.getTimerCount()).toBeGreaterThan(0)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not play while it is off screen', () => {
    vi.useFakeTimers()
    setReduced(false)
    class OffScreen extends OnScreenObserver {
      observe() {}
    }
    vi.stubGlobal('IntersectionObserver', OffScreen)
    render(<Hero />)
    act(() => vi.advanceTimersByTime(CYCLE_MS))
    expect(beat()).toBe(String(ENTER))
  })

  it('with reduced motion shows one still frame: the kurta set, finished, with no loop or ring', () => {
    vi.useFakeTimers()
    setReduced(true)
    vi.stubGlobal('IntersectionObserver', OnScreenObserver)
    render(<Hero />)
    expect(beat()).toBe('final')
    act(() => vi.advanceTimersByTime(CYCLE_MS * 2))
    expect(beat()).toBe('final')
    const stage = screen.getByTestId('hero-stage')
    expect(stage.getAttribute('data-product')).toBe('kurta')
    expect(screen.getByTestId('hero-photo').querySelectorAll('img')).toHaveLength(1)
    expect(document.querySelector('.hero-ring')).toBeNull()
    expect(stage.textContent).toContain(STATUS_LABEL.approved)
    expect(stage.textContent).toContain('Fixed for you')
    expect(stage.textContent).toContain('Confirmed')
    expect(stage.textContent).toContain(STORY.voice)
  })
})

describe('final call to action', () => {
  async function renderCta() {
    const rootRoute = createRootRoute({ component: () => <FinalCta wrap="" h2="" /> })
    const router = createRouter({ routeTree: rootRoute, history: createMemoryHistory({ initialEntries: ['/'] }) })
    render(<RouterProvider router={router} />)
    return screen.findByTestId('final-cta')
  }

  it('leads with the real Amazon logo at 64px, a Live chip and the two actions', async () => {
    setReduced(false)
    const cta = await renderCta()
    const lockup = screen.getByTestId('cta-lockup')
    const tile = lockup.querySelector('[data-slot="marketplace-tile"][data-marketplace="amazon"]')!
    expect(tile).not.toBeNull()
    expect(tile.getAttribute('class')).toContain('size-16')
    expect(tile.hasAttribute('data-muted')).toBe(false)
    const img = tile.querySelector('img')!
    expect(img.getAttribute('src')).toMatch(/amazon/)
    // The logo is used as it is: no filter or opacity class on the tile.
    expect(tile.getAttribute('class')).not.toMatch(/\[&_img\]/)
    expect(lockup.textContent).toBe('Amazon●Live')
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('List your next collection on Amazon, in your own voice.')
    expect(screen.getByRole('link', { name: 'Request access' }).getAttribute('href')).toBe('/signup')
    expect(screen.getByRole('link', { name: 'Check a request' }).getAttribute('href')).toBe('/signup/status')
    // Three listing slips, each with its real product photo and ready to approve, and nothing that loops.
    const slips = cta.querySelectorAll('.cta-fan > li')
    expect(slips).toHaveLength(3)
    expect([...slips].map((li) => li.querySelector('img')!.getAttribute('src'))).toEqual(CTA_SLIPS.map((s) => s.photo))
    for (const li of slips) {
      const img = li.querySelector('img')!
      expect(img.getAttribute('loading')).toBe('lazy')
      expect(img.getAttribute('srcset')).toMatch(/ 1x, .+-96\.webp 2x$/)
    }
    // The hero's three products, each with the status it ends on in the hero.
    expect(CTA_SLIPS.map((s) => s.name)).toEqual(PRODUCTS.map((p) => p.name))
    expect([...slips].map((li) => li.querySelector('[data-status]')!.textContent!.slice(1))).toEqual([
      STATUS_LABEL.approved,
      STATUS_LABEL.live,
      STATUS_LABEL.ready,
    ])
    // Nothing is labelled as an example.
    expect(cta.textContent).not.toMatch(/example/i)
  })
})
