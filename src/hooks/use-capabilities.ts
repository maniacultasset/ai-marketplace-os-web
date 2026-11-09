import { useQuery } from '@tanstack/react-query'
import { BUILT, probeCapabilities, type Capability, type ProbeOutcome } from '@/api/capabilities'
import { useKeys } from '@/lib/query-keys'

const STORE = 'mkos.capabilities'

/**
 * The last clean probe for this tenant, kept for the tab (sessionStorage), so a page reload does
 * not spend seven calls of the brand's shared rate limit on the same answer. A probe with any
 * failed call is never kept: it runs again next time.
 */
function readStored(key: string): ProbeOutcome[] | undefined {
  try {
    const raw = sessionStorage.getItem(STORE)
    const all = raw ? (JSON.parse(raw) as Record<string, ProbeOutcome[]>) : null
    return all?.[key]
  } catch {
    return undefined
  }
}

function store(key: string, value: ProbeOutcome[]) {
  if (value.some((p) => p.result === 'error')) return
  try {
    sessionStorage.setItem(STORE, JSON.stringify({ [key]: value }))
  } catch {
    /* storage blocked: the probe runs again after a reload */
  }
}

/** Runtime capability probe: once per session per tenant, never refetched. */
export function useCapabilityProbe(opts: { enabled?: boolean } = {}) {
  const keys = useKeys()
  const queryKey = keys.capabilities()
  const storeKey = JSON.stringify(queryKey)
  return useQuery({
    queryKey,
    queryFn: async () => {
      const out = await probeCapabilities()
      store(storeKey, out)
      return out
    },
    initialData: () => readStored(storeKey),
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false,
    enabled: opts.enabled ?? true,
  })
}

/** True when a pending capability is both built into this app and live on the backend. */
export function useCapability(capability: Capability) {
  const probe = useCapabilityProbe({ enabled: BUILT[capability] })
  return BUILT[capability] && probe.data?.find((p) => p.capability === capability)?.result === 'live'
}
