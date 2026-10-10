/**
 * Role x action matrix, copied verbatim from the backend:
 *   backend apps/api/app/core/rbac.py  (`Action` StrEnum + `MATRIX`)
 * Mirrors the backend role matrix. The role always comes from GET /auth/me `role`
 * (the membership row), never from the JWT `roles` claim. The server still enforces every
 * check; UI gating only hides what would 403.
 */
import { useCallback, type ReactNode } from 'react'
import type { Role } from '@/api/types'
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

/** Pure check. False for an unknown/absent role (a stale or forged role never grants anything). */
export function allows(role: Role | null | undefined, action: Action): boolean {
  if (!role) return false
  return MATRIX[role]?.has(action) ?? false
}

/** `const can = useCan(); can('product:import')` — based on the live /auth/me role. */
export function useCan() {
  const { data: me } = useMe()
  const role = me?.role
  return useCallback((action: Action) => allows(role, action), [role])
}

/** Render children only when the current role holds `action`. */
export function Can({
  action,
  children,
  fallback = null,
}: {
  action: Action
  children: ReactNode
  fallback?: ReactNode
}) {
  const can = useCan()
  return can(action) ? children : fallback
}
