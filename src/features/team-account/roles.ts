/**
 * Role copy and the row-control gating for /team, mirroring the backend member rules
 * (backend apps/api/app/services/members.py `_owner_rule` / `_self_rule`). The server still
 * enforces every rule; this only hides or disables what would 403.
 */
import type { Me, Role, Schema } from '@/api/types'

export type Member = Schema<'MemberOut'>

/** Display order in selects and legends. */
export const ROLE_ORDER: readonly Role[] = ['owner', 'admin', 'operator', 'reviewer']

export const ROLE_INFO: Record<Role, { label: string; summary: string }> = {
  owner: { label: 'Owner', summary: 'Everything, including granting or removing owners.' },
  admin: { label: 'Admin', summary: 'Team, marketplace connections and settings. No listing work.' },
  operator: { label: 'Operator', summary: 'Imports products, edits and publishes listings.' },
  reviewer: { label: 'Reviewer', summary: 'Reviews and approves listings.' },
}

export interface MemberGating {
  isSelf: boolean
  /** Roles the caller may pick for this row (always includes the current role). */
  roleOptions: readonly Role[]
  canEditRole: boolean
  canToggleActive: boolean
  /** Why a control is disabled, for the tooltip. */
  roleLockedReason: string | null
  activeLockedReason: string | null
}

export function memberGating(me: Pick<Me, 'user_id' | 'role'>, member: Member): MemberGating {
  const isSelf = member.user_id === me.user_id
  if (me.role === 'owner') {
    return {
      isSelf,
      roleOptions: ROLE_ORDER,
      canEditRole: true,
      canToggleActive: true,
      roleLockedReason: null,
      activeLockedReason: null,
    }
  }
  // Non-owner (admin): never touches an owner, never grants owner, never changes its own role.
  if (member.role === 'owner') {
    const reason = 'Only an owner can change another owner.'
    return {
      isSelf,
      roleOptions: ['owner'],
      canEditRole: false,
      canToggleActive: false,
      roleLockedReason: reason,
      activeLockedReason: reason,
    }
  }
  return {
    isSelf,
    roleOptions: ROLE_ORDER.filter((r) => r !== 'owner'),
    canEditRole: !isSelf,
    canToggleActive: true,
    roleLockedReason: isSelf ? 'Only an owner can change their own role.' : null,
    activeLockedReason: null,
  }
}

export function initials(text: string) {
  const base = text.split('@')[0] ?? text
  const parts = base.split(/[\s._-]+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'
}
