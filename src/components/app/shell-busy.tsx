import { useEffect, useState } from 'react'

/** The brand hit its shared request limit: a live countdown, then Kuinn tries again on its own. */
export function ShellBusy({ wait, onRetry }: { wait: number; onRetry: () => void }) {
  const [until] = useState(() => Date.now() + wait * 1000)
  const [left, setLeft] = useState(wait)
  useEffect(() => {
    const t = setInterval(() => setLeft(Math.max(0, Math.ceil((until - Date.now()) / 1000))), 500)
    return () => clearInterval(t)
  }, [until])
  useEffect(() => {
    if (left === 0) onRetry()
  }, [left, onRetry])
  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      <div role="status" className="w-full max-w-md rounded-card border border-line bg-surface p-6 text-center shadow-raised-md" data-testid="shell-busy">
        <p className="font-display text-h3 text-ink">Kuinn is busy</p>
        <p className="mt-1 text-body text-ink-2">
          Your brand sent a lot of requests in the last minute. {left > 0 ? `Trying again in ${left} s.` : 'Trying again now…'}
        </p>
      </div>
    </div>
  )
}
