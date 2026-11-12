import { describe, expect, it } from 'vitest'
import { MARKETPLACES } from '@/components/la/marketplace'
import { NOT_YET } from '@/components/la/unavailable'
import type { CurrentAccounts, MarketplaceAccount } from '@/features/marketplaces/api'
import {
  AUTO_FIX_SCOPE,
  AUTO_FIX_TRIES,
  auditActorLabel,
  mergeActivity,
  submissionEvents,
  connectionFor,
  connectedNext,
  regionText,
  defaultSelection,
  isSupported,
  isTokenExpired,
  SUPPORTED,
  WAITLIST,
} from './model'

const account = (over: Partial<MarketplaceAccount> = {}): MarketplaceAccount => ({
  id: '0b1c2d3e-0000-4000-8000-000000000301',
  marketplace: 'amazon',
  seller_id: 'A1FAKESELLER',
  publishing_enabled: true,
  region: 'eu-west-1',
  status: 'active',
  needs_reconnect_since: null,
  expires_at: '2026-10-16T12:00:00Z',
  created_at: '2026-10-01T09:00:00Z',
  ...over,
})

const current = (over: Partial<CurrentAccounts['live']> = {}, prev: Partial<CurrentAccounts['previous']> = {}): CurrentAccounts => ({
  live: { amazon: null, flipkart: null, ...over },
  previous: { amazon: null, flipkart: null, ...prev },
})

describe('connectionFor', () => {
  it('is not-connected with no live account, keeping the revoked one as context', () => {
    const prev = account({ status: 'revoked' })
    const c = connectionFor(current({}, { amazon: prev }), 'amazon')
    expect(c).toEqual({ marketplace: 'amazon', kind: 'not-connected', account: null, previous: prev })
  })
  it('maps active to connected and needs_reconnect to reconnect', () => {
    expect(connectionFor(current({ amazon: account() }), 'amazon').kind).toBe('connected')
    const f = account({ marketplace: 'flipkart', status: 'needs_reconnect', needs_reconnect_since: '2026-10-15T00:00:00Z' })
    expect(connectionFor(current({ flipkart: f }), 'flipkart').kind).toBe('reconnect')
  })
})

describe('defaultSelection', () => {
  it('falls back to Amazon while loading or when nothing is connected', () => {
    expect(defaultSelection(undefined)).toBe('amazon')
    expect(defaultSelection(current())).toBe('amazon')
  })
  it('prefers the row that needs reconnecting, then a connected one', () => {
    const f = account({ marketplace: 'flipkart', status: 'needs_reconnect' })
    expect(defaultSelection(current({ amazon: account(), flipkart: f }))).toBe('flipkart')
    expect(defaultSelection(current({ flipkart: account({ marketplace: 'flipkart' }) }))).toBe('flipkart')
  })
})

describe('isTokenExpired', () => {
  const now = new Date('2026-10-16T12:00:00Z').getTime()
  it('is true only for an active account past its expiry', () => {
    expect(isTokenExpired(account({ expires_at: '2026-10-16T11:59:00Z' }), now)).toBe(true)
    expect(isTokenExpired(account({ expires_at: '2026-10-16T12:00:00Z' }), now)).toBe(true)
    expect(isTokenExpired(account({ expires_at: '2026-10-16T13:00:00Z' }), now)).toBe(false)
    expect(isTokenExpired(account({ expires_at: null }), now)).toBe(false)
    expect(isTokenExpired(account({ status: 'needs_reconnect', expires_at: '2026-10-01T00:00:00Z' }), now)).toBe(false)
    expect(isTokenExpired(null, now)).toBe(false)
  })
})

describe('marketplace lists', () => {
  it('supported = the API Marketplace enum, and the waitlist covers every other designed marketplace', () => {
    expect(SUPPORTED).toEqual(['amazon', 'flipkart'])
    expect(isSupported('amazon')).toBe(true)
    expect(isSupported('myntra')).toBe(false)
    const designed = MARKETPLACES.map((m) => m.id)
    expect([...SUPPORTED, ...WAITLIST.map((w) => w.id)].sort()).toEqual([...designed].sort())
  })
  it('every waitlist row carries the honest reason, never an action', () => {
    for (const w of WAITLIST) expect([w.note, w.reason]).toEqual(['On the roadmap', NOT_YET.waitlist])
  })
})

describe('autonomy', () => {
  it('keeps the five designed auto-fix rows in order, each with its live mode (prod QA 9 Nov)', () => {
    expect(AUTO_FIX_SCOPE).toHaveLength(5)
    expect(AUTO_FIX_SCOPE[0]!.label).toMatch(/^Map values/)
    // data fixes run on their own; content waits for a person; the rest is planned
    expect(AUTO_FIX_SCOPE.map((r) => r.mode)).toEqual(['auto', 'auto', 'planned', 'planned', 'approval'])
    expect(AUTO_FIX_TRIES).toBe(3)
  })
})

describe('auditActorLabel', () => {
  it('names the signed-in user, the agent and support; others are "Your team"', () => {
    expect(auditActorLabel({ actor_type: 'user', actor_user_id: 'u1' }, 'u1')).toBe('You')
    expect(auditActorLabel({ actor_type: 'user', actor_user_id: 'u2' }, 'u1')).toBe('Your team')
    expect(auditActorLabel({ actor_type: 'user', actor_user_id: null }, undefined)).toBe('Your team')
    expect(auditActorLabel({ actor_type: 'system' }, 'u1')).toBe('Kuinn')
    expect(auditActorLabel({ actor_type: 'staff' }, 'u1')).toBe('Support team')
  })

  it('names a teammate by the name the API sends (item 17)', () => {
    expect(auditActorLabel({ actor_type: 'user', actor_user_id: 'u2', actor_name: 'Priya Sharma' }, 'u1')).toBe('Priya Sharma')
    expect(auditActorLabel({ actor_type: 'user', actor_user_id: 'u1', actor_name: 'Asha Mehta' }, 'u1')).toBe('You')
    expect(auditActorLabel({ actor_type: 'user', actor_user_id: 'u2', actor_name: '  ' }, 'u1')).toBe('Your team')
    expect(auditActorLabel({ actor_type: 'system', actor_name: 'x' }, 'u1')).toBe('Kuinn')
  })
})

describe('Activity: what the marketplace said', () => {
  const sub = (over: Partial<Parameters<typeof submissionEvents>[0][number]>) => ({
    id: 's1',
    attempt: 1,
    operation: 'create' as const,
    outcome: 'rejected' as const,
    created_at: '2026-11-08T10:00:00Z',
    sent_at: '2026-11-08T10:00:05Z',
    responded_at: '2026-11-08T10:01:00Z',
    error: { errors: [{ message: 'The value provided for color is not allowed.' }] },
    ...over,
  })
  it('shows each send and its outcome, a resend as a resend', () => {
    const rows = submissionEvents([sub({}), sub({ id: 's2', attempt: 2, operation: 'patch', outcome: 'live', sent_at: '2026-11-08T11:00:00Z', responded_at: null, resolved_at: '2026-11-08T11:05:00Z', error: null })], 'Amazon')
    expect(rows.map((r) => r.label)).toEqual(['Sent to Amazon', 'Rejected by Amazon', 'Sent the fixes to Amazon again', 'Live on Amazon'])
    expect(rows[1]!.reason).toBe('The value provided for color is not allowed.')
    const merged = mergeActivity([{ id: 'a', at: '2026-11-08T10:30:00Z', label: 'Approved', by: 'You', reason: null }], rows)
    expect(merged.map((r) => r.label)).toEqual(['Live on Amazon', 'Sent the fixes to Amazon again', 'Approved', 'Rejected by Amazon', 'Sent to Amazon'])
  })
  it('a send with no answer yet is only the send', () => {
    expect(submissionEvents([sub({ outcome: 'pending', responded_at: null })], 'Amazon').map((r) => r.label)).toEqual(['Sent to Amazon'])
  })
})

describe('regionText (Chrome pass 2: Region read "—")', () => {
  it('names the API region and marketplace id', () => {
    expect(regionText({ marketplace: 'amazon', region: 'India', marketplace_id: 'A21TJRUUN4KGV' })).toBe('India · A21TJRUUN4KGV')
  })
  it('falls back to the one region Kuinn connects when the API has none', () => {
    expect(regionText({ marketplace: 'amazon', region: null })).toBe('India')
    expect(regionText({ marketplace: 'flipkart', region: '  ', marketplace_id: null })).toBe('India')
  })
})

describe('connectedNext (Chrome pass 2: no paused note, no next step)', () => {
  it('says publishing is paused while the kill switch is off, and the next step', () => {
    const next = connectedNext({ status: 'active', publishing_enabled: false }, 'Amazon')
    expect(next?.paused).toMatch(/^Publishing to Amazon is paused by Kuinn for now\./)
    expect(next?.paused).toContain('nothing is sent')
    expect(next?.text).toContain('“Draft for Amazon”')
    expect(next?.text).toContain('nothing is sent until you approve')
  })
  it('has no paused note when publishing is on', () => {
    expect(connectedNext({ status: 'active', publishing_enabled: true }, 'Amazon')?.paused).toBeNull()
  })
  it('gives a reconnect account no next step (its banner says what to do)', () => {
    expect(connectedNext({ status: 'needs_reconnect', publishing_enabled: false }, 'Amazon')).toBeNull()
  })
})
