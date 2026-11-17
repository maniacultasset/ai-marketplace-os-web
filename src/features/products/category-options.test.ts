import { describe, expect, it } from 'vitest'
import { brandCategoryChoices, groupedChoices, isMappedCategory } from './category-options'

describe('brandCategoryChoices', () => {
  it('offers apparel always, and lamps only while the lamps switch is on', () => {
    expect(brandCategoryChoices(false).map((c) => c.label)).toEqual(['Kurta sets', 'T-shirts', 'Jeans', 'Trousers', 'Track pants', 'Shorts', 'Skirts'])
    expect(brandCategoryChoices(true).map((c) => c.label)).toEqual([...['Kurta sets', 'T-shirts', 'Jeans', 'Trousers', 'Track pants', 'Shorts', 'Skirts'], 'Lamps'])
    // Switch off: an existing lamps value stays visible, but it is not offered otherwise.
    expect(brandCategoryChoices(false, 'home_decor_lamps').map((c) => c.value)).toEqual(['ethnic_wear_kurta_sets', 'tshirts', 'jeans', 'trousers', 'track_pants', 'shorts', 'skirts', 'home_decor_lamps'])
  })

  it('has no "Other", but keeps an unmapped current value visible and marked', () => {
    expect(brandCategoryChoices(false).some((c) => /other/i.test(c.label))).toBe(false)
    expect(brandCategoryChoices(false, 'kurtas').at(-1)).toEqual({ value: 'kurtas', label: 'Kurtas', mapped: false, group: 'other' })
    // Unmapped categories are never offered for new products.
    expect(brandCategoryChoices(true).some((c) => c.value === 'kurtas')).toBe(false)
    expect(brandCategoryChoices(false, 'tshirts').filter((c) => c.value === 'tshirts')).toHaveLength(1)
  })

  it('knows which categories the agent can list', () => {
    expect(isMappedCategory(' tshirts ')).toBe(true)
    expect(isMappedCategory('ethnic_wear_kurta_sets')).toBe(true)
    expect(isMappedCategory('home_decor_lamps')).toBe(true)
    expect(isMappedCategory('jeans')).toBe(true)
    expect(isMappedCategory('kurtas')).toBe(false)
  })
})

describe('groupedChoices (client feedback 17 Nov)', () => {
  it('orders the groups Topwear, Bottomwear, Ethnic, Home, Other and drops empty ones', () => {
    const groups = groupedChoices(brandCategoryChoices(true, 'kurtas'))
    expect(groups.map((g) => g.label)).toEqual(['Topwear', 'Bottomwear', 'Ethnic', 'Home', 'Other'])
    expect(groups[1]!.items.map((c) => c.value)).toEqual(['jeans', 'trousers', 'track_pants', 'shorts', 'skirts'])
    expect(groupedChoices(brandCategoryChoices(false)).map((g) => g.group)).toEqual(['topwear', 'bottomwear', 'ethnic'])
  })
})
