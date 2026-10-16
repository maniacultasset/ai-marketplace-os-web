import { useEffect, useState } from 'react'
import { isNotImplemented } from '@/api/errors'
import { useConnectMarketplace, type Marketplace } from '@/features/marketplaces/api'
import { MARKETPLACE_META } from '@/features/marketplaces/meta'
import { toastError } from '@/lib/toast'

/**
 * POST /marketplaces/connect, then send the browser to the marketplace's consent page. The
 * backend returns to /marketplaces/connected?pending=… (routers/marketplaces.py callback 303).
 * A 501 means the marketplace's OAuth settings are missing on this server: shown inline, once.
 */
export function useStartConnect(marketplace: Marketplace) {
  const connect = useConnectMarketplace()
  const [notConfigured, setNotConfigured] = useState(false)

  // Back from the marketplace restores this page from bfcache with the mutation still pending.
  const { reset } = connect
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) reset()
    }
    window.addEventListener('pageshow', onShow)
    return () => window.removeEventListener('pageshow', onShow)
  }, [reset])

  const start = () =>
    connect.mutate(marketplace, {
      onSuccess: ({ authorize_url }) => window.location.assign(authorize_url),
      onError: (err) => {
        if (isNotImplemented(err)) setNotConfigured(true)
        else toastError(err, `Couldn't start connecting ${MARKETPLACE_META[marketplace].short}`)
      },
    })

  // Stays "Redirecting…" after success until the browser leaves the page.
  return { start, redirecting: connect.isPending || connect.isSuccess, notConfigured }
}
