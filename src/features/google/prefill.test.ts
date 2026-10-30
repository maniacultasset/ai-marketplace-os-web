import { describe, expect, it } from 'vitest'
import { NAME_MAX } from '@/lib/validation'
import { brandNameFrom, ownerNameFrom } from './prefill'

describe('Google sign-up prefill', () => {
  it('takes the owner name from Google, else the given and family name', () => {
    expect(ownerNameFrom({ owner_name: '  Meera   Iyer ', given_name: 'M', family_name: 'I' })).toBe('Meera Iyer')
    expect(ownerNameFrom({ owner_name: null, given_name: 'Meera', family_name: 'Iyer' })).toBe('Meera Iyer')
    expect(ownerNameFrom({ given_name: 'Meera' })).toBe('Meera')
    expect(ownerNameFrom({})).toBe('')
    expect(ownerNameFrom({ owner_name: 'x'.repeat(NAME_MAX + 5) })).toHaveLength(NAME_MAX)
  })

  it('uses the API brand suggestion only when it fits the field', () => {
    expect(brandNameFrom({ suggested_brand_name: 'Acme Naturals' })).toBe('Acme Naturals')
    expect(brandNameFrom({ suggested_brand_name: null })).toBe('')
    expect(brandNameFrom({})).toBe('')
    expect(brandNameFrom({ suggested_brand_name: 'A' })).toBe('')
    expect(brandNameFrom({ suggested_brand_name: 'x'.repeat(NAME_MAX + 1) })).toBe('')
  })
})
