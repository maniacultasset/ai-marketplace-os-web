// The public pages' copy and motion rules: no dashes as punctuation, no claims past what is live,
// and motion that respects reduced motion everywhere.
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { act, cleanup, render } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useReveal } from '@/lib/use-reveal'

const ROOT = resolve(__dirname, '../../..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

/** Every file that holds public page copy: the public feature (tests aside), the frame and index.html. */
const PUBLIC_FILES = [
  ...readdirSync(join(ROOT, 'src/features/public'))
    .filter((f) => /\.(ts|tsx)$/.test(f) && !f.includes('.test.'))
    .map((f) => `src/features/public/${f}`),
  'src/components/app/public-layout.tsx',
  'index.html',
]

describe('public copy', () => {
  it('uses no em or en dashes anywhere', () => {
    for (const f of PUBLIC_FILES) {
      const hits = read(f)
        .split('\n')
        .map((line, i) => ({ line, n: i + 1 }))
        .filter(({ line }) => /[—–]/.test(line))
        .map(({ n }) => `${f}:${n}`)
      expect(hits, 'em or en dash found').toEqual([])
    }
  })

  it('never claims more than is live: Amazon live, Flipkart next', () => {
    const copy = [
      'src/features/public/landing.tsx',
      'src/features/public/model.ts',
      'src/features/public/how-it-works-script.ts',
      'src/features/public/hero-story.ts',
      'src/features/public/hero-stage.tsx',
      'src/features/public/final-cta.tsx',
      'index.html',
    ]
      .map(read)
      .join('\n')
    for (const claim of [/every marketplace you sell/i, /Live on Flipkart/, /Sent to Flipkart/, /Publishing to Flipkart</, /once Flipkart approves/i]) {
      expect(copy).not.toMatch(claim)
    }
    expect(read('index.html')).toMatch(/<title>Kuinn \| One catalog for every Indian marketplace<\/title>/)
  })

  it('pairs the one-catalog vision with what is live today wherever it is stated', () => {
    for (const f of ['src/features/public/landing.tsx', 'index.html']) {
      const text = read(f)
      expect(text, f).toMatch(/every Indian marketplace/i)
      expect(text, f).toMatch(/Live on Amazon today\. Flipkart is next\./)
    }
  })
})

/** The reduced-motion blocks of index.css, joined. */
function reducedMotionCss(): string {
  const css = read('src/index.css')
  const out: string[] = []
  let at = css.indexOf('@media (prefers-reduced-motion: reduce)')
  while (at !== -1) {
    let depth = 0
    let i = css.indexOf('{', at)
    const start = i
    for (; i < css.length; i++) {
      if (css[i] === '{') depth++
      else if (css[i] === '}' && --depth === 0) break
    }
    out.push(css.slice(start, i))
    at = css.indexOf('@media (prefers-reduced-motion: reduce)', i)
  }
  return out.join('\n')
}

describe('reduced motion', () => {
  it('switches off every public animation class in CSS', () => {
    const reduce = reducedMotionCss()
    expect(reduce).toMatch(/\.caret-blink\s*\{\s*animation:\s*none/)
    // The hero's ring and field chips hold still; the call to action's slips rest fanned.
    expect(reduce).toMatch(/\.hero-ring,\s*\.hero-chip\s*\{\s*animation:\s*none !important/)
    expect(reduce).toMatch(/\.cta-fan > \*,\s*\[data-reveal-scope\] \.cta-fan:not\(\[data-fanned\]\) > \*\s*\{[^}]*transition:\s*none !important/)
    expect(reduce).toMatch(/\[data-reveal-scope\] \[data-reveal\]:not\(\[data-shown\]\)\s*\{\s*transform:\s*none/)
    // The global rule that stops every other transition and animation.
    expect(reduce).toMatch(/animation-duration:\s*0\.01ms !important/)
    expect(reduce).toMatch(/transition-duration:\s*0\.01ms !important/)
  })
})

describe('reveal on scroll', () => {
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
  let report: IntersectionObserverCallback = () => {}
  const observed: Element[] = []
  class FakeObserver {
    constructor(cb: IntersectionObserverCallback) {
      report = cb
    }
    observe(el: Element) {
      observed.push(el)
    }
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return []
    }
  }
  const enter = (els: Element[]) =>
    act(() => report(els.map((target) => ({ target, isIntersecting: true }) as IntersectionObserverEntry), {} as IntersectionObserver))

  function Page() {
    const ref = useRef<HTMLDivElement>(null)
    useReveal(ref)
    return (
      <div ref={ref} data-testid="scope">
        <p data-reveal data-reveal-delay="300">
          pinned
        </p>
        {Array.from({ length: 6 }, (_, i) => (
          <p key={i} data-reveal>
            card {i}
          </p>
        ))}
      </div>
    )
  }

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.useRealTimers()
    window.matchMedia = realMatchMedia
    observed.length = 0
  })

  it('hides nothing and plays nothing when reduced motion is asked for', () => {
    setReduced(true)
    vi.stubGlobal('IntersectionObserver', FakeObserver)
    const { getByTestId } = render(<Page />)
    expect(getByTestId('scope').hasAttribute('data-reveal-scope')).toBe(false)
    expect(observed).toHaveLength(0)
  })

  it('staggers what arrives together in page order, capped at 240ms, then settles', () => {
    vi.useFakeTimers()
    setReduced(false)
    vi.stubGlobal('IntersectionObserver', FakeObserver)
    const { getByTestId } = render(<Page />)
    expect(getByTestId('scope').hasAttribute('data-reveal-scope')).toBe(true)
    const [pinned, ...cards] = observed as HTMLElement[]
    // Delivered out of order: the delays still follow the page.
    enter([pinned!, ...[...cards].reverse()])
    expect(pinned!.style.getPropertyValue('--d')).toBe('300ms')
    expect(cards.map((c) => c.style.getPropertyValue('--d'))).toEqual(['0ms', '60ms', '120ms', '180ms', '240ms', '240ms'])
    expect(cards.every((c) => c.hasAttribute('data-shown'))).toBe(true)
    expect(cards[0]!.hasAttribute('data-settled')).toBe(false)
    act(() => vi.advanceTimersByTime(2000))
    expect([pinned!, ...cards].every((c) => c.hasAttribute('data-settled'))).toBe(true)
  })

  it('a card that scrolls in on its own does not wait for its place in the list', () => {
    setReduced(false)
    vi.stubGlobal('IntersectionObserver', FakeObserver)
    render(<Page />)
    const last = observed.at(-1) as HTMLElement
    enter([last])
    expect(last.style.getPropertyValue('--d')).toBe('0ms')
  })
})
