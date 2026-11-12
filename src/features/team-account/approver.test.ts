import { describe, expect, it } from 'vitest'
import { answerApprovalLine, approvalsNote, approverNoticeFor, otherApproverExists, sendBackRewriteLine, soloState } from './approver'

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

describe('soloState (owner approval, ADR-0031)', () => {
  it('an owner alone is fine once owner approval is on, and can turn it on while it is off', () => {
    expect(soloState('owner', true)).toBe('ok')
    expect(soloState('owner', false)).toBe('owner_alone')
  })
  it('waits for the brand read, and says nothing when it failed', () => {
    expect(soloState('owner', undefined)).toBe('loading')
    expect(soloState('owner', undefined, true)).toBe('unknown')
  })
  it('never lets anyone but an owner approve alone', () => {
    expect(soloState('admin', true)).toBe('alone')
    expect(soloState('admin', false)).toBe('alone')
    expect(soloState(undefined, true)).toBe('alone')
  })
})

describe('approverNoticeFor (Review)', () => {
  it('follows the server’s hint for this listing', () => {
    expect(approverNoticeFor({ can_approve: false, approve_hint: 'owner_can_enable' }, 'ok')).toBe('owner_alone')
    expect(approverNoticeFor({ can_approve: false, approve_hint: 'no_other_approver' }, 'ok')).toBe('alone')
    expect(approverNoticeFor({ can_approve: false, approve_hint: 'own_work' }, 'alone')).toBeNull()
    expect(approverNoticeFor({ can_approve: false, approve_hint: 'not_approver' }, 'alone')).toBeNull()
  })
  it('never shows a blocker the server does not see (owner approval on, approve allowed)', () => {
    expect(approverNoticeFor({ can_approve: true, approve_hint: null }, 'alone')).toBeNull()
    expect(approverNoticeFor({ can_approve: true, approve_hint: null }, 'owner_alone')).toBeNull()
  })
  it('falls back to the team read on a backend that sends no answer', () => {
    expect(approverNoticeFor({ can_approve: null, approve_hint: null }, 'alone')).toBe('alone')
    expect(approverNoticeFor({}, 'owner_alone')).toBe('owner_alone')
    expect(approverNoticeFor({}, 'ok')).toBeNull()
    expect(approverNoticeFor({}, 'unknown')).toBeNull()
  })
})

describe('approval copy follows owner approval (item 17)', () => {
  const teammate = /teammate|someone else|second person/i

  it('send back with a rewrite', () => {
    expect(sendBackRewriteLine(false)).toBe('A new version comes back for review. You become its maker, so someone else approves it.')
    expect(sendBackRewriteLine(true)).toBe('A new version comes back for review. Owner approval is on, so you can approve it yourself. This is recorded.')
    expect(sendBackRewriteLine(true)).not.toMatch(teammate)
  })

  it('an answer that makes a new version', () => {
    expect(answerApprovalLine({ ownApproval: false, resend: false })).toBe('A teammate then approves it.')
    expect(answerApprovalLine({ ownApproval: false, resend: true })).toBe('A teammate then approves the resend.')
    expect(answerApprovalLine({ ownApproval: true, resend: false })).toBe('You can then approve it yourself.')
    expect(answerApprovalLine({ ownApproval: true, resend: true })).toBe('You can then approve the resend yourself.')
  })

  it('the team page note', () => {
    expect(approvalsNote(false)).toMatch(/^Approvals need a second person/)
    expect(approvalsNote(true)).toBe('Owner approval is on: an owner can approve their own listings, and each one is recorded. Reviewers never approve their own work.')
    expect(approvalsNote(true)).not.toMatch(teammate)
  })
})
