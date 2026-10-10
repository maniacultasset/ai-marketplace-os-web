import { useQuery } from '@tanstack/react-query'
import { BUILT, probeCapabilities, type Capability } from '@/api/capabilities'
import { useKeys } from '@/lib/query-keys'

/** Runtime capability probe: once per session per tenant, never refetched. */
export function useCapabilityProbe(opts: { enabled?: boolean } = {}) {
  const keys = useKeys()
  return useQuery({
    queryKey: keys.capabilities(),
    queryFn: probeCapabilities,
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
