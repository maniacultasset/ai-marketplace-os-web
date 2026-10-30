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
import type { LoginResult, Me, TokenResponse } from '@/api/types'
import { readDeviceToken, rememberDevice } from '@/features/mfa/trusted-device'
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

/**
 * POST /auth/login. Returns the `LoginResult` as is: the caller reads `status` before anything is
 * stored (contract 2.0.0; only `signed_in` carries tokens). See features/mfa/login-flow.ts.
 *
 * When this browser is trusted for the account (contract 2.1.0), its token goes in the body; the
 * API checks it only after the password passes. The answer's rotated token (or "no longer
 * trusted") is applied before returning, so it is never lost between here and the next step.
 */
export async function signIn(email: string, password: string): Promise<LoginResult> {
  const device_token = await readDeviceToken(email)
  const result = await unwrap(api.POST('/auth/login', { body: device_token ? { email, password, device_token } : { email, password } }))
  await rememberDevice(email, result)
  return result
}

/** Store a signed-in token pair, tell other tabs, and load `me` for the new session. */
export async function finishSignIn(tokens: TokenResponse): Promise<Me> {
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
