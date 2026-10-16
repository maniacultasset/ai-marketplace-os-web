import { useEffect, useState } from 'react'

/** Seconds left of a Retry-After wait; `left` is 0 when not waiting. */
export function useCountdown() {
  const [until, setUntil] = useState<number | null>(null)
  const [left, setLeft] = useState(0)
  useEffect(() => {
    if (!until) return
    const tick = () => {
      const s = Math.max(0, Math.ceil((until - Date.now()) / 1000))
      setLeft(s)
      if (s === 0) setUntil(null)
    }
    tick()
    const t = setInterval(tick, 500)
    return () => clearInterval(t)
  }, [until])
  return { left: until ? left : 0, start: (seconds: number) => setUntil(Date.now() + seconds * 1000) }
}
