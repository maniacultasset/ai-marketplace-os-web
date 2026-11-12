import { describe, expect, it } from 'vitest'
import { versionRow, type ListingVersion } from './versions'

const v = (over: Partial<ListingVersion>): ListingVersion => ({
  id: 'v1',
  version: 1,
  origin: 'generation',
  written_by: 'kuinn',
  created_at: '2026-11-11T09:00:00Z',
  generated_by: { user_id: 'u1', name: 'Ravi Kumar' },
  edited_by: null,
  approved_by: null,
  approved_at: null,
  self_approved: false,
  ...over,
})

describe('versionRow (item 17: who made, edited and approved each version)', () => {
  it('a Kuinn draft names Kuinn and the person who started it', () => {
    expect(versionRow(v({}), 'me')).toEqual({ id: 'v1', title: 'Version 1 · Written by Kuinn', detail: 'Started by Ravi Kumar', selfApproved: false, at: '2026-11-11T09:00:00Z' })
  })

  it('an edit names the editor; an approval names the approver', () => {
    const row = versionRow(
      v({ version: 2, origin: 'edit', written_by: 'person', edited_by: { user_id: 'u2', name: 'asha@acme.test' }, approved_by: { user_id: 'u3', name: 'Priya Sharma' }, approved_at: '2026-11-11T10:00:00Z' }),
      'me',
    )
    expect(row.title).toBe('Version 2 · Edited by asha@acme.test')
    expect(row.detail).toBe('Started by Ravi Kumar · Approved by Priya Sharma')
  })

  it('says "you" for the signed-in person and marks a self-approval', () => {
    const me = { user_id: 'me', name: 'Asha Mehta' }
    const row = versionRow(v({ generated_by: me, approved_by: me, approved_at: '2026-11-11T10:00:00Z', self_approved: true }), 'me')
    expect(row.detail).toBe('Started by you · Approved by you')
    expect(row.selfApproved).toBe(true)
  })

  it('an import, a regeneration and an erased account', () => {
    expect(versionRow(v({ origin: 'import', written_by: 'person' }), 'me').title).toBe('Version 1 · Imported by Ravi Kumar')
    expect(versionRow(v({ version: 3, origin: 'regeneration' }), 'me').title).toBe('Version 3 · Rewritten by Kuinn')
    expect(versionRow(v({ generated_by: { user_id: 'gone', name: null } }), 'me').detail).toBe('Started by a former member')
  })

  it('never claims an approval that is not there', () => {
    expect(versionRow(v({ self_approved: true }), 'me').selfApproved).toBe(false)
  })
})
