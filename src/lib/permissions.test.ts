import { describe, expect, it } from 'vitest'
import openapi from '@/api/openapi.json'
import { ACTIONS, allows, isPlatformAdmin, MATRIX, OP_ACTION, permits, PLATFORM_ADMIN } from './permissions'

// Table from the backend role matrix (apps/api/app/core/rbac.py MATRIX).
const TABLE: Record<string, [boolean, boolean, boolean, boolean]> = {
  //                      owner operator reviewer admin
  'tenant:read': [true, true, true, true],
  'product:import': [true, true, false, false],
  'listing:generate': [true, true, false, false],
  'listing:regenerate': [true, true, true, false],
  'listing:edit': [true, true, false, false],
  'listing:approve': [true, false, true, false],
  'listing:publish': [true, true, false, false],
  'marketplace:connect': [true, false, false, true],
  'team:manage': [true, false, false, true],
  'settings:manage': [true, false, false, true],
  'analytics:read': [true, true, true, true],
}

describe('RBAC matrix', () => {
  it('covers all 11 actions', () => {
    expect(ACTIONS).toHaveLength(11)
    expect(Object.keys(TABLE).sort()).toEqual([...ACTIONS].sort())
  })
  it.each(Object.entries(TABLE))('%s', (action, row) => {
    const roles = ['owner', 'operator', 'reviewer', 'admin'] as const
    roles.forEach((role, i) => expect(allows(role, action as never)).toBe(row[i]))
  })
  it('denies unknown or missing roles', () => {
    expect(allows(undefined, 'tenant:read')).toBe(false)
    expect(allows('ghost' as never, 'tenant:read')).toBe(false)
    expect(MATRIX.owner.size).toBe(11)
  })
})

describe('platform admin policy', () => {
  const me = (role: 'owner' | 'admin', is_platform_admin: boolean) => ({ role, is_platform_admin })
  it('comes only from is_platform_admin, never from role', () => {
    expect(isPlatformAdmin(me('owner', false))).toBe(false)
    expect(isPlatformAdmin(me('admin', true))).toBe(true)
    expect(isPlatformAdmin(undefined)).toBe(false)
    expect(permits(me('owner', false), PLATFORM_ADMIN)).toBe(false)
    expect(permits(me('admin', true), PLATFORM_ADMIN)).toBe(true)
    expect(permits(me('admin', true), 'product:import')).toBe(false)
    expect(permits(null, 'tenant:read')).toBe(false)
  })
  it('maps every op to a known policy', () => {
    for (const p of Object.values(OP_ACTION)) {
      expect(p === PLATFORM_ADMIN || (ACTIONS as readonly string[]).includes(p)).toBe(true)
    }
  })
})

describe('OP_ACTION', () => {
  it('equals the contract x-mkos-action of every non-public op', () => {
    const paths = (openapi as unknown as { paths: Record<string, Record<string, { 'x-mkos-action'?: string }>> }).paths
    const contract: Record<string, string> = {}
    for (const [path, methods] of Object.entries(paths))
      for (const [m, op] of Object.entries(methods)) {
        const a = op['x-mkos-action']
        if (a && a !== 'public') contract[`${m.toUpperCase()} ${path.replace(/^\/api\/v1/, '')}`] = a
      }
    expect(OP_ACTION).toEqual(contract)
  })
})
