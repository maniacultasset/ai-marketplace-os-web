/**
 * What holds a looping landing animation still without a visible control (WCAG 2.2.2): the pointer
 * over it, focus inside it, and a hidden tab. Off-screen holds are each figure's own observer.
 */
import { useState, useEffect, type FocusEvent } from 'react'

/** Spread `handlers` on the looping figure and read `held`. Focus moving inside it keeps the hold. */
export function useHold() {
  const [hover, setHover] = useState(false)
  const [focus, setFocus] = useState(false)
  return {
    held: hover || focus,
    handlers: {
      onMouseEnter: () => setHover(true),
      onMouseLeave: () => setHover(false),
      onFocus: () => setFocus(true),
      onBlur: (e: FocusEvent<HTMLElement>) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocus(false)
      },
    },
  }
}

/** False while the tab is hidden. */
export function usePageVisible(): boolean {
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || document.visibilityState !== 'hidden')
  useEffect(() => {
    const on = () => setVisible(document.visibilityState !== 'hidden')
    document.addEventListener('visibilitychange', on)
    return () => document.removeEventListener('visibilitychange', on)
  }, [])
  return visible
}
