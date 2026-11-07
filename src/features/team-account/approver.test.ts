import { describe, expect, it } from 'vitest'
import { otherApproverExists } from './approver'

const me = '00000000-0000-4000-8000-000000000001'
const other = '00000000-0000-4000-8000-000000000002'
type Row = Parameters<typeof otherApproverExists>[0][number]
const m = (user_id: string, role: Row['role'], is_active = true): Row => ({ user_id, role, is_active })

describe('otherApproverExists (maker-checker)', () => {
  it('a solo owner has nobody else to approve', () => {
    expect(otherApproverExists([m(me, 'owner')], me, true)).toBe(false)
  })
  it('another active owner or reviewer can approve', () => {
    expect(otherApproverExists([m(me, 'owner'), m(other, 'reviewer')], me, true)).toBe(true)
    expect(otherApproverExists([m(me, 'owner'), m(other, 'owner')], me, true)).toBe(true)
  })
  it('an operator is enough: they make drafts and the owner approves them', () => {
    expect(otherApproverExists([m(me, 'owner'), m(other, 'operator')], me, true)).toBe(true)
  })
  it('admins and inactive members neither make nor approve drafts', () => {
    expect(otherApproverExists([m(me, 'owner'), m(other, 'admin')], me, true)).toBe(false)
    expect(otherApproverExists([m(me, 'owner'), m(other, 'reviewer', false)], me, true)).toBe(false)
  })
  it('says "don’t know" while more pages are unread', () => {
    expect(otherApproverExists([m(me, 'owner')], me, false)).toBeNull()
    expect(otherApproverExists([m(me, 'owner'), m(other, 'reviewer')], me, false)).toBe(true)
  })
})
