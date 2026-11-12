import { describe, expect, it } from 'vitest'
import { ApiError } from '@/api/errors'
import { addBrandBody, addBrandErrorMessage, canAddBrand, ownsAnotherBrand } from './add-brand'

type Caps = NonNullable<Parameters<typeof canAddBrand>[1]>
const caps = (tenant_create_enabled: boolean) => ({ capabilities: { tenant_create_enabled } }) as unknown as Caps
const on = caps(true)
const off = caps(false)
const member = (tenant_id: string, role: 'owner' | 'admin' | 'operator' | 'reviewer') => ({ tenant_id, tenant_name: tenant_id, role })

describe('canAddBrand', () => {
  it('is an owner of the current brand with the switch on', () => {
    expect(canAddBrand({ role: 'owner' }, on)).toBe(true)
    expect(canAddBrand({ role: 'owner' }, off)).toBe(false)
    expect(canAddBrand({ role: 'owner' }, undefined)).toBe(false)
    expect(canAddBrand({ role: 'owner' }, {} as Caps)).toBe(false)
    for (const role of ['admin', 'operator', 'reviewer'] as const) expect(canAddBrand({ role }, on)).toBe(false)
    expect(canAddBrand(undefined, on)).toBe(false)
  })
})

describe('ownsAnotherBrand', () => {
  it('is true only for someone who owns a brand other than the current one', () => {
    const memberships = [member('a', 'operator'), member('b', 'owner')]
    expect(ownsAnotherBrand({ role: 'operator', tenant_id: 'a', memberships })).toBe(true)
    expect(ownsAnotherBrand({ role: 'operator', tenant_id: 'a', memberships: [member('a', 'operator'), member('c', 'admin')] })).toBe(false)
    expect(ownsAnotherBrand({ role: 'owner', tenant_id: 'b', memberships })).toBe(false)
    expect(ownsAnotherBrand(undefined)).toBe(false)
  })
})

describe('addBrandBody', () => {
  it('trims the name and sends a website only when typed, with https added to a bare host', () => {
    expect(addBrandBody('  Kalakar Home ', '')).toEqual({ name: 'Kalakar Home' })
    expect(addBrandBody('Kalakar', '  ')).toEqual({ name: 'Kalakar' })
    expect(addBrandBody('Kalakar', 'kalakar.in')).toEqual({ name: 'Kalakar', website: 'https://kalakar.in' })
    expect(addBrandBody('Kalakar', 'HTTP://kalakar.in')).toEqual({ name: 'Kalakar', website: 'http://kalakar.in' })
  })
})

describe('addBrandErrorMessage', () => {
  it('shows the rule a 403 names, and plain words for a 501', () => {
    const cap = new ApiError({ type: 'PERMISSION_DENIED', status: 403, message: 'You own the most brands allowed. Contact support to add more.' })
    expect(addBrandErrorMessage(cap)).toBe('You own the most brands allowed. Contact support to add more.')
    expect(addBrandErrorMessage(new ApiError({ type: 'NOT_IMPLEMENTED', status: 501, message: 'x' }))).toMatch(/not open yet/)
    expect(addBrandErrorMessage(new ApiError({ type: 'MFA_STEP_UP_REQUIRED', status: 403, message: 'x' }))).toBeNull()
    expect(addBrandErrorMessage(new ApiError({ type: 'RATE_LIMITED', status: 429, message: 'x' }))).toBeNull()
    expect(addBrandErrorMessage(new Error('x'))).toBeNull()
  })
})
