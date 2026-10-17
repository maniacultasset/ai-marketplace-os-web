import { useEffect, useRef, useState } from 'react'

/**
 * A number that counts up to its value once, on a critically damped curve (no overshoot), then
 * stays put. The final text is always the real value; the motion only runs on first show and is
 * skipped with reduced motion. Non-numeric values ("—") render as they are.
 */
export function CountUp({ value, duration = 900 }: { value: string; duration?: number }) {
  const m = /^(\d[\d,]*)(.*)$/.exec(value)
  const target = m?.[1] ? Number(m[1].replace(/,/g, '')) : null
  const [shown, setShown] = useState<number | null>(null)
  const played = useRef(false)

  useEffect(() => {
    if (target === null || played.current) return
    played.current = true
    if (target === 0 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let frame = 0
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
    return () => {
      // Interrupted (StrictMode remount, value change): allow the next run, show the real value.
      if (frame) played.current = false
      cancelAnimationFrame(frame)
      setShown(null)
    }
  }, [target, duration])

  if (!m || shown === null) return <>{value}</>
  return (
    <>
      <span aria-hidden>{shown.toLocaleString('en-IN')}{m[2]}</span>
      <span className="sr-only">{value}</span>
    </>
  )
}
