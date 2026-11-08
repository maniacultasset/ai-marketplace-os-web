// The landing hero stage (hero-stage.tsx, hero-story.ts) and the final call to action (final-cta.tsx).
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FinalCta } from './final-cta'
import { HeroStage } from './hero-stage'
import { BEATS, beatDelay, DRAFT_TITLE, ENTER, ENTER_READY_MS, FINAL, LAST, LOOP_MS, LOOP_START_MS, nextBeat, STORY, storyAt } from './hero-story'
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

function Hero() {
  const ref = useRef<HTMLElement>(null)
  return (
    <section ref={ref}>
      <HeroStage hero={ref} />
    </section>
  )
}

const beat = () => screen.getByTestId('hero-stage').getAttribute('data-beat')

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  window.matchMedia = realMatchMedia
})

describe('hero story', () => {
  it('keeps every beat in order inside one 10.8s loop, with a hold after the last', () => {
    const at = BEATS.map((b) => b.at)
    expect(at).toEqual([...at].sort((a, b) => a - b))
    expect(BEATS[0]).toEqual({ id: 'reset', at: 0 })
    expect(LOOP_MS - BEATS[LAST]!.at).toBeGreaterThanOrEqual(4000)
    // One full loop adds up to LOOP_MS.
    let total = 0
    for (let b = 0; b <= LAST; b++) total += beatDelay(b, 1)
    expect(total).toBe(LOOP_MS)
    // Entrance: ready at 980ms, loop from 3.4s, then round again.
    expect(beatDelay(ENTER, 0)).toBe(ENTER_READY_MS)
    expect(ENTER_READY_MS + beatDelay(LAST, 0)).toBe(LOOP_START_MS)
    expect([nextBeat(ENTER), nextBeat(LAST), nextBeat(3)]).toEqual([LAST, 0, 4])
  })

  it('starts from the draft and ends on the finished listing', () => {
    const start = storyAt(0)
    expect(start).toMatchObject({ white: false, confirmed: false, struck: false, fixed: false, ready: false })
    expect(start.ticked.size).toBe(0)
    expect(FINAL).toMatchObject({ white: true, photoTag: true, confirmed: true, marked: true, struck: true, fixed: true, ready: true })
    expect([...FINAL.ticked].sort()).toEqual(['banned', 'length', 'required'])
    // The banned-word check only ticks once "Best" is gone.
    const strike = BEATS.findIndex((b) => b.id === 'strike')
    expect(storyAt(strike - 1).ticked.has('banned')).toBe(false)
    // The entrance shows the finished listing, so no card contradicts another while they rise in.
    expect(storyAt(ENTER)).toEqual(FINAL)
  })

  it('uses the seeded rules: "Best" is banned and both titles fit Amazon’s limit', () => {
    expect(STORY.bannedWord.toLowerCase()).toBe(HERO_EXAMPLE.bannedTerm)
    expect([...DRAFT_TITLE].length).toBeLessThanOrEqual(HERO_EXAMPLE.limits.amazon)
    expect(STORY.title.toLowerCase().split(/[^a-z0-9']+/)).not.toContain(HERO_EXAMPLE.bannedTerm)
    expect(STORY.checks[0]!.text).toContain(String(HERO_EXAMPLE.limits.amazon))
  })
})

describe('hero stage', () => {
  it('is a labelled example with a screen reader summary, no links and Pause as its only control', () => {
    setReduced(false)
    render(<Hero />)
    const fig = screen.getByTestId('hero-example')
    expect(fig.tagName).toBe('FIGURE')
    expect(screen.getByText('Example')).toBeTruthy()
    expect(screen.getByText(STORY.caption).id).toBe(fig.getAttribute('aria-labelledby'))
    expect(screen.getByText(STORY.summary).className).toContain('sr-only')
    // The white-background photo is proposed for the seller's approval, never done for them.
    expect(STORY.summary).toContain('main photo for you to approve')
    expect(screen.getByTestId('hero-stage').getAttribute('aria-hidden')).toBe('true')
    expect(screen.queryAllByRole('link')).toHaveLength(0)
    expect(screen.getAllByRole('button')).toEqual([screen.getByTestId('hero-play')])
    // No announcements on autoplay.
    expect(fig.querySelector('[aria-live]')).toBeNull()
    // The rail stays a real list.
    expect(screen.getByRole('list', { name: 'Marketplaces' })).toBeTruthy()
  })

  it('puts Pause before the moving stage, and Pause/Play changes its label', () => {
    setReduced(false)
    vi.stubGlobal('IntersectionObserver', OnScreenObserver)
    render(<Hero />)
    const toggle = screen.getByTestId('hero-play')
    expect(toggle.compareDocumentPosition(screen.getByTestId('hero-stage')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(toggle.getAttribute('aria-label')).toBe('Pause animation')
    expect(toggle.textContent).toBe('Pause')
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-label')).toBe('Play animation')
    expect(toggle.textContent).toBe('Play')
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-label')).toBe('Pause animation')
  })

  it('loops while on screen, and Pause holds the beat until Play resumes it', () => {
    vi.useFakeTimers()
    setReduced(false)
    vi.stubGlobal('IntersectionObserver', OnScreenObserver)
    render(<Hero />)
    expect(beat()).toBe(String(ENTER))
    // No field chips travel during the entrance; they belong to the loop.
    expect(document.querySelector('.hero-chip')).toBeNull()
    act(() => vi.advanceTimersByTime(ENTER_READY_MS))
    expect(beat()).toBe(String(LAST))
    expect(document.querySelector('.hero-ring')).not.toBeNull()
    act(() => vi.advanceTimersByTime(LOOP_START_MS - ENTER_READY_MS))
    expect(beat()).toBe('0')
    act(() => vi.advanceTimersByTime(BEATS[1]!.at))
    expect(beat()).toBe('1')
    fireEvent.click(screen.getByTestId('hero-play'))
    act(() => vi.advanceTimersByTime(LOOP_MS * 2))
    expect(beat()).toBe('1')
    fireEvent.click(screen.getByTestId('hero-play'))
    act(() => vi.advanceTimersByTime(BEATS[2]!.at - BEATS[1]!.at))
    expect(beat()).toBe('2')
  })

  it('does not play while it is off screen', () => {
    vi.useFakeTimers()
    setReduced(false)
    class OffScreen extends OnScreenObserver {
      observe() {}
    }
    vi.stubGlobal('IntersectionObserver', OffScreen)
    render(<Hero />)
    act(() => vi.advanceTimersByTime(LOOP_MS))
    expect(beat()).toBe(String(ENTER))
  })

  it('with reduced motion renders the finished listing at once, with no loop, ring, chips or toggle', () => {
    vi.useFakeTimers()
    setReduced(true)
    vi.stubGlobal('IntersectionObserver', OnScreenObserver)
    render(<Hero />)
    expect(screen.queryByTestId('hero-play')).toBeNull()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(beat()).toBe('final')
    act(() => vi.advanceTimersByTime(LOOP_MS * 2))
    expect(beat()).toBe('final')
    const stage = screen.getByTestId('hero-stage')
    expect(stage.querySelector('.hero-chip')).toBeNull()
    expect(document.querySelector('.hero-ring')).toBeNull()
    expect(stage.textContent).toContain(STORY.ready)
    expect(stage.textContent).toContain(STORY.fixed)
    expect(stage.textContent).toContain('Confirmed')
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
    // Three example slips, each ready to approve, and nothing that loops.
    expect(cta.querySelectorAll('.cta-fan > li')).toHaveLength(3)
    expect(cta.textContent!.match(/Ready to approve/g)).toHaveLength(3)
  })
})
