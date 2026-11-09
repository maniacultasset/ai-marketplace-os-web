import { useEffect, useState } from 'react'

/**
 * True once the page has scrolled past `threshold` px, so a sticky bar can show its edge. The page
 * is the window, or `getScroller()` when given (the app shell's <main> scrolls on desktop).
 */
export function useScrolled(threshold = 4, getScroller?: () => HTMLElement | null) {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const scroller = getScroller?.() ?? null
    let frame = 0
    const read = () => {
      frame = 0
      setScrolled(Math.max(window.scrollY, scroller?.scrollTop ?? 0) > threshold)
    }
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(read)
    }
    read()
    window.addEventListener('scroll', onScroll, { passive: true })
    scroller?.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      scroller?.removeEventListener('scroll', onScroll)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [threshold, getScroller])
  return scrolled
}
