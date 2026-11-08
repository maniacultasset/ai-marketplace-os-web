import { useEffect, useRef, useState } from 'react'

/** True when the user asked for less motion, or when we cannot tell (no matchMedia: show the value). */
function prefersReducedMotion() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * A number that counts up to its value once, on a critically damped curve (no overshoot), then
 * stays put. The final text is always the real value; the motion only runs on first show and is
 * skipped with reduced motion. When motion is allowed the first frame is 0, never the final value,
 * so the number does not flash before it counts. Non-numeric values render as they are.
 * `start` holds the count at 0 until it turns true (e.g. once its line has been revealed), so the
 * count plays where someone can see it.
 */
export function CountUp({ value, duration = 900, start = true }: { value: string; duration?: number; start?: boolean }) {
  const m = /^(\d[\d,]*)(.*)$/.exec(value)
  const target = m?.[1] ? Number(m[1].replace(/,/g, '')) : null
  const [shown, setShown] = useState<number | null>(() => (target !== null && target > 0 && !prefersReducedMotion() ? 0 : null))
  const played = useRef(false)

  useEffect(() => {
    if (target === null || played.current || !start) return
    played.current = true
    let frame = 0
    if (target === 0 || prefersReducedMotion()) {
      // Nothing to count (or less motion asked): the real value, on the next frame at the latest.
      frame = requestAnimationFrame(() => {
        frame = 0
        setShown(null)
      })
    } else {
      const start = performance.now()
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / duration)
        // Critically damped response, normalised to land exactly on 1 at t = 1.
        const w = 7
        const x = (1 - (1 + w * t) * Math.exp(-w * t)) / (1 - (1 + w) * Math.exp(-w))
        setShown(t < 1 ? Math.round(target * x) : null)
        frame = t < 1 ? requestAnimationFrame(tick) : 0
      }
      frame = requestAnimationFrame(tick)
    }
    return () => {
      // Interrupted (StrictMode remount, value change): allow the next run. The shown number is
      // kept until that run's first frame, so the final value never flashes in between.
      if (frame) played.current = false
      cancelAnimationFrame(frame)
    }
  }, [target, duration, start])

  if (!m || shown === null || target === 0) return <>{value}</>
  return (
    <>
      <span aria-hidden>{shown.toLocaleString('en-IN')}{m[2]}</span>
      <span className="sr-only">{value}</span>
    </>
  )
}
