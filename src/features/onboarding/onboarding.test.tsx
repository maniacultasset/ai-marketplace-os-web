import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Schema } from '@/api/types'
import { TooltipProvider } from '@/components/ui/tooltip'
import { buildPatch, rebase, toDraft } from '@/features/brand/profile-model'
import { ComplianceForm } from './compliance'
import { activeAccounts, savedClock, SETUP_STEPS, setupStepsDone } from './model'

type Account = Schema<'MarketplaceAccountOut'>
type Tenant = Schema<'TenantOut'>

const account = (marketplace: Account['marketplace'], status: Account['status']): Account => ({
  id: `0b1c2d3e-0000-4000-8000-${marketplace === 'amazon' ? '000000000001' : '000000000002'}`,
  marketplace,
  seller_id: 'A1SELLER',
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
  ...over,
})

describe('setup steps', () => {
  it('are the three hi-fi steps in order', () => {
    expect(SETUP_STEPS.map((s) => s.to)).toEqual(['/setup/brand', '/setup/compliance', '/setup/marketplaces'])
  })

  it('only marks a step done from real data, never compliance', () => {
    expect(setupStepsDone(undefined)).toEqual([false, false, false])
    expect(setupStepsDone(tenant())).toEqual([false, false, false])
    expect(setupStepsDone(tenant({ tone: 'Warm and plain' }))).toEqual([true, false, false])
    expect(setupStepsDone(tenant({ guidelines: ['No hype'] }))[1]).toBe(false)
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

describe('ComplianceForm', () => {
  it('renders every designed field disabled under one honest banner', () => {
    render(
      <TooltipProvider>
        <ComplianceForm />
      </TooltipProvider>,
    )
    expect(screen.getAllByText('Compliance defaults can’t be saved yet')).toHaveLength(1)
    for (const name of ['Customer care email', 'Customer care phone', 'Registered address', 'Name', 'Address', 'GST number']) {
      expect((screen.getByLabelText(name) as HTMLInputElement).disabled).toBe(true)
    }
    expect((screen.getByRole('switch') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole('button', { name: /Add another/ }).getAttribute('aria-disabled')).toBe('true')
  })
})
