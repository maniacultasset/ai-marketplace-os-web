/**
 * Session hooks and auth actions. Token mechanics live in src/api/session.ts.
 */
import { queryOptions, useQuery } from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'
import { api, unwrap } from '@/api/client'
import { isApiError } from '@/api/errors'
import {
  broadcast,
  clearSession,
  currentRefreshToken,
  getSession,
  storeTokens,
  subscribeSession,
} from '@/api/session'
import type { Me } from '@/api/types'
import { queryClient } from '@/lib/query-client'
import { toast } from '@/lib/toast'

export function useSession() {
  return useSyncExternalStore(subscribeSession, getSession, getSession)
}

export const meQueryOptions = (tenantId: string) =>
  queryOptions({
    queryKey: ['t', tenantId, 'me'] as const,
    queryFn: () => unwrap(api.GET('/auth/me')),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  })

/** GET /auth/me for the active tenant: the source of role, tenant and memberships. */
export function useMe() {
  const { tenantId, status } = useSession()
  return useQuery({
    ...meQueryOptions(tenantId ?? 'anonymous'),
    enabled: status === 'authenticated' && !!tenantId,
  })
}

/** The active tenant's display name (until GET /tenants/me exists). */
export function tenantName(me: Me | undefined) {
  return me?.memberships.find((m) => m.tenant_id === me.tenant_id)?.tenant_name ?? ''
}

export async function login(email: string, password: string): Promise<Me> {
  const tokens = await unwrap(api.POST('/auth/login', { body: { email, password } }))
  queryClient.clear()
  storeTokens(tokens)
  broadcast({ type: 'login', access_token: tokens.access_token })
  const { tenantId } = getSession()
  return queryClient.fetchQuery(meQueryOptions(tenantId!))
}

/** POST /auth/logout (always 204), then drop tokens + cache everywhere. */
export async function logout() {
  const rt = currentRefreshToken()
  if (rt) {
    await Promise.race([
      api.POST('/auth/logout', { body: { refresh_token: rt } }).catch(() => undefined),
      new Promise((r) => setTimeout(r, 3000)),
    ])
  }
  clearSession('logout', { broadcast: true })
}

/** Switch tenant: new pair, clear cache, tell other tabs, close the old family, reload me. */
export async function switchTenant(targetTenantId: string) {
  const oldRt = currentRefreshToken()
  let tokens
  try {
    tokens = await unwrap(api.POST('/auth/switch-tenant', { body: { target_tenant_id: targetTenantId } }))
  } catch (e) {
    if (isApiError(e) && e.status === 404) {
      toast.error('You no longer have access to that brand.')
      const { tenantId } = getSession()
      if (tenantId) void queryClient.invalidateQueries({ queryKey: ['t', tenantId, 'me'] })
    }
    throw e
  }
  storeTokens(tokens)
  queryClient.clear()
  broadcast({ type: 'switch', tenant_id: targetTenantId })
  if (oldRt) void api.POST('/auth/logout', { body: { refresh_token: oldRt } }).catch(() => undefined)
  const { tenantId } = getSession()
  return queryClient.fetchQuery(meQueryOptions(tenantId!))
}
