import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Schema } from '@/api/types'
import { buildPatch, rebase, toDraft } from '@/features/brand/profile-model'
import { ComplianceAside } from './compliance'
import { activeAccounts, savedClock, SETUP_STEPS, setupStepsDone } from './model'

type Account = Schema<'MarketplaceAccountOut'>
type Tenant = Schema<'TenantOut'>

const account = (marketplace: Account['marketplace'], status: Account['status']): Account => ({
  id: `0b1c2d3e-0000-4000-8000-${marketplace === 'amazon' ? '000000000001' : '000000000002'}`,
  marketplace,
  seller_id: 'A1SELLER',
  publishing_enabled: true,
  status,
  created_at: '2026-10-01T10:00:00Z',
  expires_at: null,
  needs_reconnect_since: null,
  region: 'IN',
})

const tenant = (over: Partial<Tenant> = {}): Tenant => ({
  id: '5b0c2d3e-0000-4000-8000-000000000001',
  name: 'Loomline',
  slug: 'loomline',
  status: 'active',
  tone: null,
  guidelines: [],
  glossary: {},
  owner_self_approval: false,
  ...over,
})

describe('setup steps', () => {
  it('are only the steps that save something: brand, manufacturer, marketplaces', () => {
    expect(SETUP_STEPS.map((s) => s.to)).toEqual(['/setup/brand', '/setup/manufacturer', '/setup/marketplaces'])
  })

  it('only marks a step done from real data', () => {
    expect(setupStepsDone(undefined)).toEqual([false, false, false])
    expect(setupStepsDone(tenant())).toEqual([false, false, false])
    expect(setupStepsDone(tenant({ tone: 'Warm and plain' }))).toEqual([true, false, false])
    expect(setupStepsDone(tenant({ guidelines: ['No hype'] }), true)).toEqual([true, true, false])
    expect(setupStepsDone(tenant(), true)[1]).toBe(true)
  })
})

describe('savedClock', () => {
  it('shows hours and minutes only', () => {
    expect(savedClock(new Date(2026, 9, 16, 10, 32, 59))).toMatch(/10.32/)
  })
})

describe('activeAccounts', () => {
  it('counts only accounts that can publish now', () => {
    expect(activeAccounts([account('amazon', 'active'), account('flipkart', 'needs_reconnect'), null])).toHaveLength(1)
    expect(activeAccounts([account('flipkart', 'revoked')])).toHaveLength(0)
  })
})

describe('brand step patch (TenantPatch)', () => {
  it('sends only the changed name and tone', () => {
    const base = tenant({ guidelines: ['Keep it short'] })
    const draft = { ...toDraft(base), name: ' Loomline Studio ', tone: 'Warm and plain' }
    expect(buildPatch(base, draft)).toEqual({ name: 'Loomline Studio', tone: 'Warm and plain' })
    expect(buildPatch(base, toDraft(base))).toBeNull()
  })

  it('on STALE_VERSION keeps this person’s change on top of the newer profile', () => {
    const baseline = tenant()
    const server = tenant({ name: 'Loomline Apparel', guidelines: ['No hype'] })
    const draft = { ...toDraft(baseline), tone: 'Warm' }
    const r = rebase(baseline, server, draft)
    expect(r.conflicts).toEqual([])
    expect(buildPatch(server, r.draft)).toEqual({ tone: 'Warm' })
    expect(r.draft.name).toBe('Loomline Apparel')
  })
})

describe('ComplianceAside', () => {
  it('says where each fact is kept, with no disabled fields and no "can’t be saved" copy', () => {
    const view = render(<ComplianceAside />)
    const aside = screen.getByTestId('compliance-aside')
    expect(aside.textContent).toContain('Manufacturer')
    expect(aside.textContent).toContain('set once here')
    expect(screen.getAllByText('per product')).toHaveLength(2)
    expect(view.container.querySelectorAll('input, textarea, [aria-disabled="true"], button[disabled]')).toHaveLength(0)
    expect(view.container.textContent).not.toMatch(/can’t be saved|coming soon/i)
  })
})
