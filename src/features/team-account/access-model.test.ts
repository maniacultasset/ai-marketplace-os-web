import { afterEach, describe, expect, it } from 'vitest'
import { envelope } from '@/test/fake-api'
import { toApiError } from '@/api/errors'
import { inviteErrorMessage, resetRefusal } from './access-errors'
import {
  inviteRoleOptions,
  inviteStash,
  linkStash,
  readLinkToken,
  resetLinkReason,
  revokeLockedReason,
  sameEmail,
  takeLinkToken,
  untilLabel,
} from './access-model'

const TOKEN = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJ0123-_6' // 43 base64url characters

afterEach(() => sessionStorage.clear())

describe('readLinkToken (the part after #)', () => {
  it('reads a 43-character base64url token', () => {
    expect(TOKEN).toHaveLength(43)
    expect(readLinkToken(`#token=${TOKEN}`)).toEqual({ kind: 'ok', token: TOKEN })
    expect(readLinkToken(`token=${TOKEN}`)).toEqual({ kind: 'ok', token: TOKEN })
    expect(readLinkToken(`#utm=x&token=${TOKEN}`)).toEqual({ kind: 'ok', token: TOKEN })
  })
  it('says missing when there is no token at all', () => {
    expect(readLinkToken('')).toEqual({ kind: 'missing' })
    expect(readLinkToken('#')).toEqual({ kind: 'missing' })
    expect(readLinkToken('#token=')).toEqual({ kind: 'missing' })
    expect(readLinkToken('#other=1')).toEqual({ kind: 'missing' })
  })
  it('refuses a cut-off, padded or foreign token without asking the server', () => {
    expect(readLinkToken(`#token=${TOKEN.slice(0, 40)}`)).toEqual({ kind: 'malformed' })
    expect(readLinkToken(`#token=${TOKEN}=`)).toEqual({ kind: 'malformed' })
    expect(readLinkToken(`#token=${TOKEN.slice(0, 42)}+`)).toEqual({ kind: 'malformed' })
    expect(readLinkToken(`#token=${TOKEN}x`)).toEqual({ kind: 'malformed' })
  })
})

describe('takeLinkToken', () => {
  it('takes the token out of the address bar and keeps it in this tab', () => {
    window.history.replaceState(null, '', `/invite?x=1#token=${TOKEN}`)
    expect(takeLinkToken(inviteStash)).toEqual({ kind: 'ok', token: TOKEN })
    expect(window.location.hash).toBe('')
    expect(window.location.pathname + window.location.search).toBe('/invite?x=1')
    expect(inviteStash.peek()).toBe(TOKEN)
  })
  it('after a reload or a sign-in, reads the kept token', () => {
    inviteStash.put(TOKEN)
    window.history.replaceState(null, '', '/invite')
    expect(takeLinkToken(inviteStash)).toEqual({ kind: 'ok', token: TOKEN })
  })
  it('a malformed link wins over a kept token, and each stash is its own', () => {
    inviteStash.put(TOKEN)
    window.history.replaceState(null, '', '/invite#token=short')
    expect(takeLinkToken(inviteStash)).toEqual({ kind: 'malformed' })
    const other = linkStash('mkos.other')
    window.history.replaceState(null, '', '/reset-password')
    expect(takeLinkToken(other)).toEqual({ kind: 'missing' })
  })
  it('never keeps a bad value', () => {
    inviteStash.put('not-a-token')
    expect(inviteStash.peek()).toBeNull()
    inviteStash.put(TOKEN)
    inviteStash.clear()
    expect(inviteStash.peek()).toBeNull()
  })
})

describe('role rules', () => {
  it('only an owner invites an owner', () => {
    expect(inviteRoleOptions('owner')).toEqual(['owner', 'admin', 'operator', 'reviewer'])
    expect(inviteRoleOptions('admin')).toEqual(['admin', 'operator', 'reviewer'])
    expect(inviteRoleOptions('operator')).toEqual([])
    expect(inviteRoleOptions(undefined)).toEqual([])
  })
  it('only an owner cancels an owner invite', () => {
    expect(revokeLockedReason('owner', 'owner')).toBeNull()
    expect(revokeLockedReason('admin', 'owner')).toMatch(/Only an owner/)
    expect(revokeLockedReason('admin', 'reviewer')).toBeNull()
  })
})

describe('resetLinkReason', () => {
  const owner = { user_id: 'me', role: 'owner' as const }
  const admin = { user_id: 'me', role: 'admin' as const }
  const m = (role: 'owner' | 'reviewer', is_active = true, user_id = 'u2') => ({ user_id, role, is_active })
  it('allows an eligible teammate while everyone signs in with a code', () => {
    expect(resetLinkReason(owner, m('reviewer'), 'all')).toBeNull()
    expect(resetLinkReason(owner, m('owner'), 'all')).toBeNull()
    expect(resetLinkReason(admin, m('reviewer'), 'all')).toBeNull()
  })
  it('never for yourself: Security is the place', () => {
    expect(resetLinkReason(owner, m('owner', true, 'me'), 'all')).toMatch(/Settings > Security/)
  })
  it('an admin never resets an owner', () => {
    expect(resetLinkReason(admin, m('owner'), 'all')).toMatch(/Only an owner/)
  })
  it('an inactive member first needs access back', () => {
    expect(resetLinkReason(owner, m('reviewer', false), 'all')).toMatch(/access back on/)
  })
  it('no link while login codes are off (the code is what stops a takeover)', () => {
    expect(resetLinkReason(owner, m('reviewer'), 'off')).toMatch(/login code/)
    // Not known yet: let the server decide rather than guess.
    expect(resetLinkReason(owner, m('reviewer'), undefined)).toBeNull()
  })
})

describe('untilLabel and sameEmail', () => {
  const now = Date.parse('2026-11-08T10:00:00Z')
  it('counts down in the largest whole unit', () => {
    expect(untilLabel('2026-11-15T10:00:00Z', now)).toBe('in 7 days')
    expect(untilLabel('2026-11-09T09:00:00Z', now)).toBe('in 23 hours')
    expect(untilLabel('2026-11-08T11:00:00Z', now)).toBe('in 1 hour')
    expect(untilLabel('2026-11-08T10:01:30Z', now)).toBe('in 1 minute')
    expect(untilLabel('2026-11-08T09:00:00Z', now)).toBe('now')
    expect(untilLabel('nope', now)).toBe('')
  })
  it('compares emails as the backend stores them', () => {
    expect(sameEmail(' Meera@Kalakar.in', 'meera@kalakar.in ')).toBe(true)
    expect(sameEmail('a@x.in', 'b@x.in')).toBe(false)
    expect(sameEmail(undefined, 'a@x.in')).toBe(false)
  })
})

describe('refusals in words', () => {
  const err = (status: number, type: string, details: unknown[] | null = null) =>
    envelope(status, type, 'm', details)
      .json()
      .then((body) => toApiError(new Response(null, { status }), body))
  it('invite: a member or the 50 limit lands on email; an owner role on role', async () => {
    expect(inviteErrorMessage(await err(422, 'VALIDATION_FAILED', [{ loc: ['body', 'email'], msg: 'x', type: 'x' }]))?.field).toBe('email')
    expect(inviteErrorMessage(await err(403, 'PERMISSION_DENIED'), 'owner')).toMatchObject({ field: 'role', message: 'Only an owner can invite an owner.' })
    expect(inviteErrorMessage(await err(429, 'RATE_LIMITED'), 'reviewer')?.message).toMatch(/Wait a minute/)
    expect(inviteErrorMessage(await err(500, 'INTERNAL_ERROR'), 'reviewer')).toBeNull()
  })
  it('invite: a 403 for any other role is not about owners (the generic sentence)', async () => {
    expect(inviteErrorMessage(await err(403, 'PERMISSION_DENIED'), 'reviewer')).toBeNull()
  })
  it('reset: a 403 sends the owner to Kuinn support', async () => {
    expect(resetRefusal(await err(403, 'PERMISSION_DENIED'), { myRole: 'owner', targetRole: 'reviewer' })).toMatchObject({ support: true })
    expect(resetRefusal(await err(422, 'VALIDATION_FAILED'), { myRole: 'owner', targetRole: 'reviewer' }).message).toMatch(/Security/)
    expect(resetRefusal(await err(404, 'NOT_FOUND'), { myRole: 'owner', targetRole: 'reviewer' }).message).toMatch(/no longer in this brand/)
  })
  it('reset: an admin refused on an owner hears the owner rule, not support', async () => {
    const r = resetRefusal(await err(403, 'PERMISSION_DENIED'), { myRole: 'admin', targetRole: 'owner' })
    expect(r.message).toBe('Only an owner can make a reset link for an owner.')
    expect(r.support).toBeFalsy()
  })
  it('reset: a step-up 403 keeps its own sentence', async () => {
    expect(resetRefusal(await err(403, 'MFA_STEP_UP_REQUIRED'), { myRole: 'owner', targetRole: 'reviewer' }).support).toBeFalsy()
  })
})
