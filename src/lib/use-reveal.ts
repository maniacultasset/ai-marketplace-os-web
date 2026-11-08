import { useEffect, useLayoutEffect, useState, type RefObject } from 'react'

/** Matches the motion tokens in index.css (--stagger, --dur-rise, the 200ms + 500ms mark sweep). */
const STAGGER_MS = 60
const STAGGER_CAP = 4
/** Longest reveal transition (the mark sweep: 200ms wait + 500ms draw), plus a frame of slack. */
const SETTLE_MS = 720
const REDUCE = '(prefers-reduced-motion: reduce)'

const docOrder = (a: Element, b: Element) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1)

/**
 * Plays each `[data-reveal]` element inside `scope` in once, the first time it scrolls into view
 * (time-based spring, so it reads as an arrival rather than being scrubbed by the scroll).
 *
 * - Batch stagger: the elements that enter view together are staggered in document order, 60ms
 *   apart and never more than 240ms, so a card that scrolls in alone never waits for its index.
 *   `data-reveal-delay="300"` pins an exact delay instead (the hero's choreography).
 * - Settle: once its transition is over an element gets `data-settled`, which drops the reveal
 *   transition, so hover styles and later changes run at their own speed.
 * - Reduced motion: nothing is hidden. If the setting turns on mid-page, everything shows at once.
 *
 * Nothing is hidden until this runs, so content shows without script and in tests (no
 * IntersectionObserver).
 */
export function useReveal(scope: RefObject<HTMLElement | null>) {
  // Layout effect: the scope is marked before the first paint, so nothing flashes in and out.
  useLayoutEffect(() => {
    const root = scope.current
    if (!root || typeof IntersectionObserver === 'undefined') return
    const mq = typeof window.matchMedia === 'function' ? window.matchMedia(REDUCE) : null
    if (mq?.matches) return
    const items = [...root.querySelectorAll<HTMLElement>('[data-reveal]')]
    const timers = new Set<number>()

    const settle = (el: HTMLElement, after: number) => {
      const t = window.setTimeout(() => {
        timers.delete(t)
        el.setAttribute('data-settled', '')
      }, after)
      timers.add(t)
    }
    const show = (batch: HTMLElement[]) => {
      batch.sort(docOrder)
      let k = 0
      for (const el of batch) {
        const pinned = el.dataset.revealDelay
        const delay = pinned !== undefined ? Number(pinned) || 0 : Math.min(k++, STAGGER_CAP) * STAGGER_MS
        el.style.setProperty('--d', `${delay}ms`)
        el.setAttribute('data-shown', '')
        settle(el, delay + SETTLE_MS)
      }
    }
    const io = new IntersectionObserver(
      (entries) => {
        const batch: HTMLElement[] = []
        for (const e of entries) {
          if (!e.isIntersecting) continue
          io.unobserve(e.target)
          batch.push(e.target as HTMLElement)
        }
        if (batch.length) show(batch)
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
    )
    root.setAttribute('data-reveal-scope', '')
    for (const el of items) {
      if (!el.hasAttribute('data-shown')) io.observe(el)
    }
    const onReduce = (e: MediaQueryListEvent) => {
      if (!e.matches) return
      io.disconnect()
      for (const el of items) {
        el.setAttribute('data-shown', '')
        el.setAttribute('data-settled', '')
      }
    }
    mq?.addEventListener?.('change', onReduce)
    // Dropping the scope makes everything visible again; elements already shown keep their mark,
    // so a remount (StrictMode, route return) only plays what has not been seen yet.
    return () => {
      io.disconnect()
      mq?.removeEventListener?.('change', onReduce)
      for (const t of timers) window.clearTimeout(t)
      for (const el of items) if (el.hasAttribute('data-shown')) el.setAttribute('data-settled', '')
      root.removeAttribute('data-reveal-scope')
    }
  }, [scope])
}

/**
 * True once `ref`'s element is on screen for real: when its reveal has played (plus its delay), or
 * at once when there is no reveal scope around it (reduced motion, no IntersectionObserver).
 */
export function useRevealed(ref: RefObject<HTMLElement | null>): boolean {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let timer = 0
    const check = () => {
      if (el.closest('[data-reveal-scope]') && !el.hasAttribute('data-shown')) return false
      const delay = Number.parseInt(el.style.getPropertyValue('--d'), 10) || 0
      timer = window.setTimeout(() => setShown(true), delay)
      return true
    }
    if (check()) return () => window.clearTimeout(timer)
    const mo = new MutationObserver(() => {
      if (check()) mo.disconnect()
    })
    mo.observe(el, { attributes: true, attributeFilter: ['data-shown'] })
    return () => {
      mo.disconnect()
      window.clearTimeout(timer)
    }
  }, [ref])
  return shown
}
