/**
 * Role x action matrix, copied verbatim from the backend:
 *   backend apps/api/app/core/rbac.py  (`Action` StrEnum + `MATRIX`)
 * and each op's required action from apps/api/app/api/v1/surface.py (`OP_ACTION` below).
 * The role always comes from GET /auth/me `role` (the membership row), never from the JWT
 * `roles` claim. The server still enforces every check; UI gating only hides what would 403.
 *
 * `platform:admin` is the one policy outside the matrix (ADR-0019): no role holds it; the
 * user's own `is_platform_admin` flag (GET /auth/me) does. `can('platform:admin')` checks it.
 */
import { useCallback, type ReactNode } from 'react'
import type { Me, Role } from '@/api/types'
import { useMe } from '@/lib/auth'

export const ACTIONS = [
  'tenant:read',
  'product:import',
  'listing:generate',
  'listing:regenerate',
  'listing:edit',
  'listing:approve',
  'listing:publish',
  'marketplace:connect',
  'team:manage',
  'settings:manage',
  'analytics:read',
] as const

export type Action = (typeof ACTIONS)[number]

/** The platform admin's policy (sign-up queue). Not a role action. */
export const PLATFORM_ADMIN = 'platform:admin' as const
/** Anything `can()` checks: a role action or the platform-admin flag. */
export type Policy = Action | typeof PLATFORM_ADMIN

export const ROLES: readonly Role[] = ['owner', 'operator', 'reviewer', 'admin']

export const MATRIX: Readonly<Record<Role, ReadonlySet<Action>>> = {
  owner: new Set(ACTIONS),
  operator: new Set<Action>([
    'tenant:read',
    'product:import',
    'listing:generate',
    'listing:regenerate',
    'listing:edit',
    'listing:publish',
    'analytics:read',
  ]),
  reviewer: new Set<Action>(['tenant:read', 'listing:approve', 'listing:regenerate', 'analytics:read']),
  admin: new Set<Action>([
    'tenant:read',
    'marketplace:connect',
    'team:manage',
    'settings:manage',
    'analytics:read',
  ]),
}

/**
 * Action each tenant op requires (backend surface.py). Use it to gate a button by the op it calls:
 * `can(OP_ACTION['POST /issues/{issue_id}/dismiss'])`. Some are not obvious: dismissing an issue
 * needs `listing:approve`, cancelling a job needs `listing:generate`, a rules dry run needs
 * `listing:edit`, image upload needs `product:import`, brand documents upload/delete need
 * `settings:manage`.
 */
export const OP_ACTION = {
  'GET /auth/me': 'tenant:read',
  'POST /auth/switch-tenant': 'tenant:read',
  'POST /auth/mfa/totp/enroll': 'tenant:read',
  'POST /auth/mfa/totp/confirm': 'tenant:read',
  'GET /auth/security': 'tenant:read',
  'POST /auth/google/unlink': 'tenant:read',
  'POST /auth/mfa/recovery-codes': 'tenant:read',
  'POST /auth/mfa/step-up': 'tenant:read',
  'POST /auth/password': 'tenant:read',
  'GET /members': 'team:manage',
  'PATCH /members/{user_id}': 'team:manage',
  'GET /tenants/me': 'tenant:read',
  'PATCH /tenants/me': 'settings:manage',
  'GET /brand/documents': 'tenant:read',
  'POST /brand/documents': 'settings:manage',
  'DELETE /brand/documents/{document_id}': 'settings:manage',
  'GET /products': 'tenant:read',
  'GET /products/{product_id}': 'tenant:read',
  'POST /products': 'product:import',
  'POST /products/bulk': 'product:import',
  'GET /imports/{import_id}': 'tenant:read',
  'GET /imports/{import_id}/rows': 'tenant:read',
  'POST /imports/{import_id}/rows/retry': 'product:import',
  'POST /images/upload-url': 'product:import',
  'POST /images/upload': 'product:import',
  'GET /images/{image_id}/report': 'tenant:read',
  'GET /listings': 'tenant:read',
  'GET /listings/{listing_id}': 'tenant:read',
  'GET /listings/{listing_id}/preview': 'tenant:read',
  'GET /listings/{listing_id}/status': 'tenant:read',
  'GET /listings/{listing_id}/history': 'tenant:read',
  'GET /listings/{listing_id}/submissions': 'tenant:read',
  'POST /listings/generate': 'listing:generate',
  'POST /listings/validate': 'listing:edit',
  'PATCH /listings/{listing_id}/content': 'listing:edit',
  'POST /listings/{listing_id}/regenerate': 'listing:regenerate',
  'POST /listings/approve': 'listing:approve',
  'POST /listings/publish': 'listing:publish',
  'POST /listings/{listing_id}/publish/retry-fields': 'listing:publish',
  'POST /listings/{listing_id}/refresh-status': 'listing:publish',
  'GET /marketplaces/accounts': 'tenant:read',
  'POST /marketplaces/connect': 'marketplace:connect',
  'POST /marketplaces/connect/confirm': 'marketplace:connect',
  'POST /marketplaces/accounts/{account_id}/revoke': 'marketplace:connect',
  'GET /rules': 'tenant:read',
  'POST /rules/dry-run': 'listing:edit',
  'GET /jobs/{job_id}': 'tenant:read',
  'POST /jobs/{job_id}/cancel': 'listing:generate',
  'GET /issues': 'tenant:read',
  'POST /issues/{issue_id}/dismiss': 'listing:approve',
  'GET /tasks': 'tenant:read',
  'GET /analytics': 'analytics:read',
  'GET /analytics/summary': 'analytics:read',
  'GET /admin/signup-requests': PLATFORM_ADMIN,
  'POST /admin/signup-requests/{request_id}/approve': PLATFORM_ADMIN,
  'POST /admin/signup-requests/{request_id}/reject': PLATFORM_ADMIN,
} as const satisfies Record<string, Policy>

/** Pure check. False for an unknown/absent role (a stale or forged role never grants anything). */
export function allows(role: Role | null | undefined, action: Action): boolean {
  if (!role) return false
  return MATRIX[role]?.has(action) ?? false
}

/** True only when GET /auth/me says so. Never inferred from role (an owner is not a platform admin). */
export function isPlatformAdmin(me: Pick<Me, 'is_platform_admin'> | null | undefined): boolean {
  return me?.is_platform_admin === true
}

/** Pure policy check against a `me` payload: role actions via MATRIX, `platform:admin` via the flag. */
export function permits(me: Pick<Me, 'role' | 'is_platform_admin'> | null | undefined, policy: Policy): boolean {
  if (!me) return false
  return policy === PLATFORM_ADMIN ? isPlatformAdmin(me) : allows(me.role, policy)
}

/** `const can = useCan(); can('product:import'); can('platform:admin')` — from the live /auth/me. */
export function useCan() {
  const { data: me } = useMe()
  const role = me?.role
  const admin = me?.is_platform_admin === true
  return useCallback(
    (policy: Policy) => (policy === PLATFORM_ADMIN ? admin : allows(role, policy)),
    [role, admin],
  )
}

/** `useIsPlatformAdmin()` — shorthand for `useCan()('platform:admin')`. */
export function useIsPlatformAdmin() {
  const { data: me } = useMe()
  return isPlatformAdmin(me)
}

/** Render children only when the current user holds `action` (a role action or 'platform:admin'). */
export function Can({
  action,
  children,
  fallback = null,
}: {
  action: Policy
  children: ReactNode
  fallback?: ReactNode
}) {
  const can = useCan()
  return can(action) ? children : fallback
}
