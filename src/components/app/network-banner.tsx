import { CONCEPT_ICON } from '@/components/la/concept-icons'
import { IconGlyph } from '@/components/la/icons'
import { useEffect, useSyncExternalStore } from 'react'
import { getOffline, probe, setOffline, subscribeOffline } from '@/api/client'

/** "Can't reach the server" banner (36px); polls /readyz every 5 s and hides itself. */
export function NetworkBanner() {
  const offline = useSyncExternalStore(subscribeOffline, getOffline, getOffline)
  useEffect(() => {
    if (!offline) return
    const t = setInterval(() => {
      void probe('/readyz').then((r) => {
        if (r.ok) setOffline(false)
      })
    }, 5000)
    const onOnline = () => void probe('/readyz').then((r) => r.ok && setOffline(false))
    window.addEventListener('online', onOnline)
    return () => {
      clearInterval(t)
      window.removeEventListener('online', onOnline)
    }
  }, [offline])
  // While shown, the sticky top bar and sticky asides sit below the banner (--banner-h).
  useEffect(() => {
    if (!offline) return
    const root = document.documentElement
    root.style.setProperty('--banner-h', '36px')
    return () => {
      root.style.removeProperty('--banner-h')
    }
  }, [offline])
  if (!offline) return null
  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-50 flex h-9 items-center justify-center gap-2 border-b border-attention-line bg-attention-tint px-4 text-small font-semibold text-attention-ink"
    >
      <IconGlyph icon={CONCEPT_ICON.offline} size={16} className="text-attention" />
      Can't reach the server. Trying again…
    </div>
  )
}
