import { useEffect, useState } from 'react'

/** Current time, re-read every `ms` so relative times ("in 54 minutes") stay true. */
export function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}
