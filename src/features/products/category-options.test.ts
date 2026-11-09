import { describe, expect, it } from 'vitest'
import { brandCategoryChoices, isMappedCategory } from './category-options'

describe('brandCategoryChoices', () => {
  it('offers apparel always, and lamps only while the lamps switch is on', () => {
    expect(brandCategoryChoices(false).map((c) => c.label)).toEqual(['Kurta sets', 'T-shirts'])
    expect(brandCategoryChoices(true).map((c) => c.label)).toEqual(['Kurta sets', 'T-shirts', 'Lamps'])
    // Switch off: an existing lamps value stays visible, but it is not offered otherwise.
    expect(brandCategoryChoices(false, 'home_decor_lamps').map((c) => c.value)).toEqual(['ethnic_wear_kurta_sets', 'tshirts', 'home_decor_lamps'])
  })

  it('has no "Other", but keeps an unmapped current value visible and marked', () => {
    expect(brandCategoryChoices(false).some((c) => /other/i.test(c.label))).toBe(false)
    expect(brandCategoryChoices(false, 'kurtas').at(-1)).toEqual({ value: 'kurtas', label: 'Kurtas', mapped: false })
    // Unmapped categories are never offered for new products.
    expect(brandCategoryChoices(true).some((c) => c.value === 'kurtas')).toBe(false)
    expect(brandCategoryChoices(false, 'tshirts').filter((c) => c.value === 'tshirts')).toHaveLength(1)
  })

  it('knows which categories the agent can list', () => {
    expect(isMappedCategory(' tshirts ')).toBe(true)
    expect(isMappedCategory('ethnic_wear_kurta_sets')).toBe(true)
    expect(isMappedCategory('home_decor_lamps')).toBe(true)
    expect(isMappedCategory('kurtas')).toBe(false)
  })
})
