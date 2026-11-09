/**
 * Scroll model for the app shell.
 *
 * From 768px the shell is fixed to the viewport: the sidebar and the top bar never move, and
 * `<main id="main">` is the scroll container for ordinary pages. Below 768px the page keeps the
 * normal document scroll.
 *
 * Split screens (Inbox list | detail, Settings nav | page, the guided add form) render a
 * `<SplitLayout>` from 1024px. It fills `<main>` (main stops scrolling while one is on screen) and
 * every `<ScrollPane>` inside it scrolls on its own, so a short pane stays where it is while a long
 * one scrolls. Below 1024px the panes stack and scroll with the page.
 *
 * A short side column inside a scrolling page (Brand profile's Documents card, the review's right
 * column) uses `STICKY_ASIDE` instead: it stays at the top of its scroll container and scrolls
 * inside itself only when it is taller than the screen.
 *
 *   <SplitLayout className="lg:grid-cols-[340px_minmax(0,1fr)]">
 *     <ScrollPane as="section" scrollId="inbox-list">…</ScrollPane>
 *     <ScrollPane as="section" scrollId="inbox-detail" resetOnNavigate>…</ScrollPane>
 *   </SplitLayout>
 */
import type { HTMLAttributes, Ref } from 'react'
import { cn } from '@/lib/utils'

/** The scroll container classes of one pane (lg and up). */
export const PANE_SCROLL = 'lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain lg:[scrollbar-gutter:stable]'

/**
 * A short side column in a scrolling page: sticks to the top of its scroll container, and scrolls
 * inside itself when it is taller than the screen. The 8px inset keeps card shadows and focus rings
 * from being clipped by the scroll box.
 */
export const STICKY_ASIDE =
  'lg:sticky lg:top-5 lg:self-start lg:max-h-[calc(100svh-var(--topbar-h)-var(--banner-h,0px)-2.5rem)] lg:overflow-y-auto lg:overscroll-contain lg:-m-2 lg:p-2'

/** `STICKY_ASIDE` for a side column that only sits beside the page from 1536px. */
export const STICKY_ASIDE_2XL =
  '2xl:sticky 2xl:top-5 2xl:self-start 2xl:max-h-[calc(100svh-var(--topbar-h)-var(--banner-h,0px)-2.5rem)] 2xl:overflow-y-auto 2xl:overscroll-contain 2xl:-m-2 2xl:p-2'

/** `STICKY_ASIDE` for a side column that only sits beside the page from 1280px. */
export const STICKY_ASIDE_XL =
  'xl:sticky xl:top-5 xl:self-start xl:max-h-[calc(100svh-var(--topbar-h)-var(--banner-h,0px)-2.5rem)] xl:overflow-y-auto xl:overscroll-contain xl:-m-2 xl:p-2'

/** Marks a pane whose scroll goes back to the top on every navigation (see `scrollToTopSelectors`). */
export const PANE_RESET_SELECTOR = '[data-pane-reset]'

type Tag = 'div' | 'section' | 'aside' | 'nav'

/**
 * The frame of a split screen. A grid by default (give it the column template from lg); pass
 * `flex flex-col` for a frame with a pinned footer under its panes.
 */
export function SplitLayout({
  as = 'div',
  className,
  ref,
  ...props
}: HTMLAttributes<HTMLElement> & { as?: Tag; ref?: Ref<HTMLElement> }) {
  const Comp = as as 'div'
  return (
    <Comp
      ref={ref as Ref<HTMLDivElement>}
      data-slot="split-layout"
      className={cn('grid grid-cols-1 lg:min-h-0 lg:flex-1 lg:overflow-hidden', className)}
      {...props}
    />
  )
}

/**
 * One independently scrolling pane of a split screen. `scrollId` keys its saved scroll position across
 * navigations (selecting an Inbox row keeps the list where it was). `resetOnNavigate` sends it back
 * to the top on every navigation instead (the Inbox detail when the selected item changes).
 */
export function ScrollPane({
  as = 'div',
  scrollId,
  resetOnNavigate,
  className,
  ref,
  ...props
}: HTMLAttributes<HTMLElement> & { as?: Tag; scrollId?: string; resetOnNavigate?: boolean; ref?: Ref<HTMLElement> }) {
  const Comp = as as 'div'
  return (
    <Comp
      ref={ref as Ref<HTMLDivElement>}
      data-slot="scroll-pane"
      data-scroll-restoration-id={scrollId}
      data-pane-reset={resetOnNavigate || undefined}
      className={cn('min-w-0', PANE_SCROLL, className)}
      {...props}
    />
  )
}
