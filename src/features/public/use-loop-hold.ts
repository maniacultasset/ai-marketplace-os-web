/**
 * What holds a looping landing animation still without a visible control. How it works holds for a
 * mouse over it, keyboard focus inside it and a hidden tab; the hero holds only for a hidden tab and
 * off screen (its own observer), never for hover or focus. Off-screen holds are each figure's own.
 *
 * Only a real mouse hover and keyboard focus count. A click or a tap also focuses (the demo's steps
 * are buttons) and a tap fires an emulated mouseenter; neither may freeze the loop until the visitor
 * happens to click somewhere else.
 */
import { useCallback, useEffect, useRef, useState, type FocusEvent } from 'react'

/** A touch fires emulated mouse events right after it; ignore them for this long. */
const TOUCH_GRACE_MS = 1000

/** Spread `handlers` on the looping figure and read `held`. Focus moving inside it keeps the hold. */
export function useHold() {
  const [hover, setHover] = useState(false)
  const [focus, setFocus] = useState(false)
  const pointerDown = useRef(false)
  const touchAt = useRef(-Infinity)
  /** Lets go of the hover hold, for a click that asks the animation to play (a picked step). */
  const releaseHover = useCallback(() => setHover(false), [])
  return {
    held: hover || focus,
    focusHeld: focus,
    releaseHover,
    handlers: {
      onTouchStart: () => {
        touchAt.current = performance.now()
        pointerDown.current = true
      },
      onMouseDown: () => {
        pointerDown.current = true
      },
      // Focus lands on mousedown; a press that focused nothing must not mark the next Tab as a click.
      onMouseUp: () => {
        pointerDown.current = false
      },
      onMouseEnter: () => {
        if (performance.now() - touchAt.current > TOUCH_GRACE_MS) setHover(true)
      },
      onMouseLeave: () => setHover(false),
      onFocus: () => {
        // Focus that follows a click or tap is not a request to hold still.
        setFocus(!pointerDown.current)
        pointerDown.current = false
      },
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
