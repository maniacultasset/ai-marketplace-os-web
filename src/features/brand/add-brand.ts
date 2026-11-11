/**
 * "Add another brand" (backend ADR-0032, op `tenants_create`). An owner of the current brand adds
 * a trial brand they own, with no new sign-up review: POST /tenants (Idempotency-Key; a login code
 * first under `MFA_ENFORCEMENT=all`, which the client asks for and replays), then
 * POST /auth/switch-tenant into it. Each brand keeps its own data; nothing is copied across.
 */
import { api, unwrap } from '@/api/client'
import { isApiError } from '@/api/errors'
import { idempotencyHeader } from '@/api/idempotency'
import type { Me, Schema } from '@/api/types'
import { normalizeWebsite } from '@/lib/validation'

export type TenantCreated = Schema<'TenantCreated'>
type TenantOut = Schema<'TenantOut'>

/** Where a new brand starts: the first setup step. */
export const NEW_BRAND_START = '/setup/brand' as const

/**
 * Who sees "Add another brand": an owner of the current brand, while the deployment has it on
 * (`capabilities.tenant_create_enabled`). The server checks again (and the cap, and a suspended
 * brand) on every call.
 */
export function canAddBrand(me: Pick<Me, 'role'> | undefined, tenant: Pick<TenantOut, 'capabilities'> | null | undefined): boolean {
  return me?.role === 'owner' && tenant?.capabilities?.tenant_create_enabled === true
}

/** An owner elsewhere who is not an owner here: they can add a brand after switching. */
export function ownsAnotherBrand(me: Pick<Me, 'role' | 'tenant_id' | 'memberships'> | undefined): boolean {
  if (!me || me.role === 'owner') return false
  return me.memberships.some((m) => m.tenant_id !== me.tenant_id && m.role === 'owner')
}

/** The request body: the trimmed name, and the website only when one was typed. */
export function addBrandBody(name: string, website: string): { name: string; website?: string } {
  const site = normalizeWebsite(website)
  return site ? { name: name.trim(), website: site } : { name: name.trim() }
}

export const createBrand = (body: { name: string; website?: string }, key: string): Promise<TenantCreated> =>
  unwrap(api.POST('/tenants', { params: { header: idempotencyHeader(key) }, body }))

/**
 * The words for a refusal that is not a field error. A 403 carries the rule that refused (not an
 * owner here, a suspended brand, the brand limit) in its message, so it is shown as sent.
 */
export function addBrandErrorMessage(e: unknown): string | null {
  if (!isApiError(e)) return null
  if (e.status === 403 && e.type === 'PERMISSION_DENIED') return e.message
  if (e.status === 501) return 'Adding a brand is not open yet. Ask us to turn it on.'
  return null
}
