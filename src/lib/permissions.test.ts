import { describe, expect, it } from 'vitest'
import { ACTIONS, allows, MATRIX } from './permissions'

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
