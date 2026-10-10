import { WifiOff } from 'lucide-react'
import { useEffect, useSyncExternalStore } from 'react'
import { getOffline, probe, setOffline, subscribeOffline } from '@/api/client'

/** "Can't reach the server" banner; polls /healthz every 5 s and hides itself. */
export function NetworkBanner() {
  const offline = useSyncExternalStore(subscribeOffline, getOffline, getOffline)
  useEffect(() => {
    if (!offline) return
    const t = setInterval(() => {
      void probe('/healthz').then((r) => {
        if (r.ok) setOffline(false)
      })
    }, 5000)
    const onOnline = () => void probe('/healthz').then((r) => r.ok && setOffline(false))
    window.addEventListener('online', onOnline)
    return () => {
      clearInterval(t)
      window.removeEventListener('online', onOnline)
    }
  }, [offline])
  if (!offline) return null
  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-50 flex items-center justify-center gap-2 border-b border-warning/30 bg-warning/10 px-4 py-2 text-sm text-foreground"
    >
      <WifiOff className="size-4 text-warning" aria-hidden />
      Can't reach the server. Retrying…
    </div>
  )
}
