import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useScrolled } from '@/lib/use-scrolled'
import { PANE_RESET_SELECTOR, ScrollPane, SplitLayout, STICKY_ASIDE, STICKY_ASIDE_2XL, STICKY_ASIDE_XL } from './split-layout'

afterEach(cleanup)

const classes = (el: HTMLElement) => el.className.split(/\s+/)

describe('SplitLayout', () => {
  it('fills the shell main from lg and clips, so only its panes scroll', () => {
    render(
      <SplitLayout data-testid="split" className="lg:grid-cols-[340px_minmax(0,1fr)]">
        <ScrollPane data-testid="list" />
      </SplitLayout>,
    )
    const split = screen.getByTestId('split')
    expect(split.dataset.slot).toBe('split-layout')
    expect(classes(split)).toEqual(expect.arrayContaining(['lg:flex-1', 'lg:min-h-0', 'lg:overflow-hidden', 'lg:grid-cols-[340px_minmax(0,1fr)]']))
  })
})

describe('ScrollPane', () => {
  it('is its own scroll container from lg, with a stable gutter, and a plain block below it', () => {
    render(<ScrollPane as="section" data-testid="pane" aria-label="Items" />)
    const pane = screen.getByTestId('pane')
    expect(pane.tagName).toBe('SECTION')
    expect(classes(pane)).toEqual(
      expect.arrayContaining(['min-w-0', 'lg:min-h-0', 'lg:overflow-y-auto', 'lg:overscroll-contain', 'lg:[scrollbar-gutter:stable]']),
    )
    // Phones keep the page scroll: no unprefixed overflow.
    expect(classes(pane).some((c) => c.startsWith('overflow-'))).toBe(false)
  })

  it('keeps its position across navigations by id, or resets to the top when asked', () => {
    render(
      <>
        <ScrollPane data-testid="list" scrollId="inbox-list" />
        <ScrollPane data-testid="detail" scrollId="inbox-detail" resetOnNavigate />
      </>,
    )
    const list = screen.getByTestId('list')
    const detail = screen.getByTestId('detail')
    expect(list.getAttribute('data-scroll-restoration-id')).toBe('inbox-list')
    expect(list.matches(PANE_RESET_SELECTOR)).toBe(false)
    expect(detail.matches(PANE_RESET_SELECTOR)).toBe(true)
    expect(document.querySelector(PANE_RESET_SELECTOR)).toBe(detail)
  })
})

describe('STICKY_ASIDE', () => {
  it('pins a side column only from lg and lets it scroll inside itself when tall', () => {
    const c = STICKY_ASIDE.split(' ')
    expect(c).toEqual(expect.arrayContaining(['lg:sticky', 'lg:self-start', 'lg:overflow-y-auto']))
    expect(c.every((x) => x.startsWith('lg:'))).toBe(true)
  })

  it('lets the wheel over a short side column scroll the page', () => {
    for (const v of [STICKY_ASIDE, STICKY_ASIDE_XL, STICKY_ASIDE_2XL]) expect(v).not.toMatch(/overscroll/)
  })
})

describe('pane children', () => {
  it('never squash under long content: every scrolling pane keeps its direct children at full height', () => {
    render(<ScrollPane data-testid="pane" />)
    expect(screen.getByTestId('pane').className).toContain('lg:*:shrink-0')
    expect(STICKY_ASIDE).toContain('lg:*:shrink-0')
    expect(STICKY_ASIDE_XL).toContain('xl:*:shrink-0')
    expect(STICKY_ASIDE_2XL).toContain('2xl:*:shrink-0')
  })
})

describe('useScrolled', () => {
  it('follows the given scroll container as well as the window', async () => {
    const main = document.createElement('main')
    document.body.append(main)
    const { result } = renderHook(() => useScrolled(4, () => main))
    expect(result.current).toBe(false)
    act(() => {
      main.scrollTop = 40
      main.dispatchEvent(new Event('scroll'))
    })
    // The read runs on the next animation frame.
    await waitFor(() => expect(result.current).toBe(true))
    main.remove()
  })
})
