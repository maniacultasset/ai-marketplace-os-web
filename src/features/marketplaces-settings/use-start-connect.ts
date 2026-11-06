import { useEffect, useState } from 'react'
import { isNotImplemented } from '@/api/errors'
import { useConnectMarketplace, type Marketplace } from '@/features/marketplaces/api'
import { MARKETPLACE_META } from '@/features/marketplaces/meta'
import { toastError } from '@/lib/toast'

/** Where a marketplace connect started, so the OAuth return page can send the user back there. */
export type ConnectOrigin = '/marketplaces' | '/setup/marketplaces'

const ORIGIN_KEY = 'kuinn:connect-from'
const MARKETPLACE_KEY = 'kuinn:connect-marketplace'

/** Remember the origin and marketplace before leaving for the marketplace's consent page. */
export function rememberConnectOrigin(from: ConnectOrigin, marketplace: Marketplace) {
  try {
    sessionStorage.setItem(ORIGIN_KEY, from)
    sessionStorage.setItem(MARKETPLACE_KEY, marketplace)
  } catch {
    // Storage blocked (private mode, quota): the return page falls back to Marketplaces.
  }
}

/** What rememberConnectOrigin stored, or nulls. Read-only, so a StrictMode double render is safe. */
export function readConnectOrigin(): { from: ConnectOrigin | null; marketplace: Marketplace | null } {
  try {
    const from = sessionStorage.getItem(ORIGIN_KEY)
    const mp = sessionStorage.getItem(MARKETPLACE_KEY)
    return {
      from: from === '/marketplaces' || from === '/setup/marketplaces' ? from : null,
      marketplace: mp === 'amazon' || mp === 'flipkart' ? mp : null,
    }
  } catch {
    return { from: null, marketplace: null }
  }
}

export function clearConnectOrigin() {
  try {
    sessionStorage.removeItem(ORIGIN_KEY)
    sessionStorage.removeItem(MARKETPLACE_KEY)
  } catch {
    // Nothing to clear.
  }
}

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
      onSuccess: ({ authorize_url }) => {
        rememberConnectOrigin('/marketplaces', marketplace)
        window.location.assign(authorize_url)
      },
      onError: (err) => {
        if (isNotImplemented(err)) setNotConfigured(true)
        else toastError(err, `Couldn't start connecting ${MARKETPLACE_META[marketplace].short}`)
      },
    })

  // Stays "Redirecting…" after success until the browser leaves the page.
  return { start, redirecting: connect.isPending || connect.isSuccess, notConfigured }
}
