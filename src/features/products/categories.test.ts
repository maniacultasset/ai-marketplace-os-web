import { describe, expect, it } from 'vitest'
import { categoryChoices, categoryLabel } from './categories'

describe('categories', () => {
  it('offers the listable categories plus the product’s own', () => {
    expect(categoryChoices('tshirts').map((c) => c.label)).toEqual(['Kurta sets', 'T-shirts'])
    expect(categoryChoices('kurtas').map((c) => c.value)).toEqual(['ethnic_wear_kurta_sets', 'tshirts', 'kurtas'])
    expect(categoryLabel('home_decor_lamps')).toBe('Lamps')
    expect(categoryLabel('mens_shirts')).toBe('Mens shirts')
  })
})
