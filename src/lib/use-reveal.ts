import { useLayoutEffect, type RefObject } from 'react'

/**
 * Plays each `[data-reveal]` element inside `scope` in once, the first time it scrolls into view
 * (time-based spring, so it reads as an arrival rather than being scrubbed by the scroll).
 * Nothing is hidden until this runs, so content shows without script, in tests (no
 * IntersectionObserver) and with reduced motion, where the hook does nothing.
 */
export function useReveal(scope: RefObject<HTMLElement | null>) {
  // Layout effect: the scope is marked before the first paint, so nothing flashes in and out.
  useLayoutEffect(() => {
    const root = scope.current
    if (!root || typeof IntersectionObserver === 'undefined') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const items = [...root.querySelectorAll<HTMLElement>('[data-reveal]')]
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue
          e.target.setAttribute('data-shown', '')
          io.unobserve(e.target)
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
    )
    root.setAttribute('data-reveal-scope', '')
    for (const el of items) io.observe(el)
    // Dropping the scope makes everything visible again; elements already shown keep their mark,
    // so a remount (StrictMode, route return) only plays what has not been seen yet.
    return () => {
      io.disconnect()
      root.removeAttribute('data-reveal-scope')
    }
  }, [scope])
}
