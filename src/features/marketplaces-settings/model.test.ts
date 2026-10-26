import { describe, expect, it } from 'vitest'
import { MARKETPLACES } from '@/components/la/marketplace'
import { NOT_YET } from '@/components/la/unavailable'
import type { CurrentAccounts, MarketplaceAccount } from '@/features/marketplaces/api'
import {
  AUTO_FIX_SCOPE,
  auditActorLabel,
  connectionFor,
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
    for (const w of WAITLIST) expect(w.reason).toBe(NOT_YET.waitlist)
  })
})

describe('autonomy', () => {
  it('keeps the five designed auto-fix rows in order', () => {
    expect(AUTO_FIX_SCOPE).toHaveLength(5)
    expect(AUTO_FIX_SCOPE[0]).toMatch(/^Map values/)
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
})
