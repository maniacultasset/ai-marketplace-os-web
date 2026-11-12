import { describe, expect, it } from 'vitest'
import { brands } from '@/test/home-brands'
import { brandRows, brandsSummary, showBrandScope } from './brands-model'

describe('cross-brand overview model (client feedback item 18)', () => {
  it('shows the selector only to a person in two or more brands', () => {
    expect(showBrandScope(undefined)).toBe(false)
    expect(showBrandScope({ memberships: [{}] })).toBe(false)
    expect(showBrandScope({ memberships: [{}, {}] })).toBe(true)
  })

  it('words each brand from its own counts: live takes partly live too', () => {
    expect(brandRows(brands())).toEqual([
      { tenantId: 't1', name: 'Acme', role: 'owner', current: true, live: '4', progress: '2', needsYou: '4', needsYouCount: 4, products: '1,284' },
      { tenantId: 't2', name: 'Bharat', role: 'reviewer', current: false, live: '0', progress: '0', needsYou: '0', needsYouCount: 0, products: '1' },
    ])
  })

  it('sums up how many brands wait on the person, and says when the list is cut', () => {
    expect(brandsSummary(brands())).toBe('2 brands · 1 needs you')
    expect(brandsSummary(brands({ brands: brands().brands.map((b) => ({ ...b, needs_you: 0 })) }))).toBe('2 brands · nothing waits on you')
    expect(brandsSummary(brands({ more: true }))).toBe('2 brands (the first 25) · 1 needs you')
  })
})
