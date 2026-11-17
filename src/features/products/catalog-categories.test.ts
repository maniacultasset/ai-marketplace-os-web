import { describe, expect, it } from 'vitest'
import { catalogChoices, mappingText, pickerChoices, typeText, unmappedOn, unmappedText, type CatalogCategory } from './catalog-categories'

const m = (marketplace: 'amazon' | 'flipkart', product_type: string, product_type_name: string) => ({
  marketplace,
  product_type,
  product_type_name,
  external_category_id: null,
  template_version: 1,
})
const KURTA: CatalogCategory = {
  category: 'ethnic_wear_kurta_sets',
  label: 'Kurta sets',
  enabled: true,
  marketplaces: [m('amazon', 'KURTA', 'Kurta'), m('flipkart', 'kurta', 'Kurta')],
}
const TEES: CatalogCategory = {
  category: 'tshirts',
  label: 'T-shirts',
  enabled: true,
  marketplaces: [m('amazon', 'SHIRT', 'Shirt'), m('flipkart', 't_shirt', 'T-shirt')],
}
const LAMPS: CatalogCategory = { category: 'home_decor_lamps', label: 'Lamps', enabled: false, marketplaces: [m('amazon', 'LAMP', 'Lamp')] }

describe('category picker mapping (client feedback 11 Nov)', () => {
  it('reads the marketplace mapping in plain words', () => {
    expect(mappingText(KURTA, ['amazon', 'flipkart'])).toBe('On Amazon: Kurta (KURTA) · On Flipkart: Kurta')
    expect(mappingText(TEES, ['flipkart'])).toBe('On Flipkart: T-shirt')
    expect(mappingText(TEES, ['amazon'])).toBe('On Amazon: Shirt (SHIRT)')
  })

  it('shows every mapped marketplace while none is ticked, and nothing for an unknown category', () => {
    expect(mappingText(KURTA, [])).toBe('On Amazon: Kurta (KURTA) · On Flipkart: Kurta')
    expect(mappingText(LAMPS, ['flipkart'])).toBeNull()
    expect(mappingText(undefined, ['amazon'])).toBeNull()
    expect(unmappedOn(LAMPS, ['amazon', 'flipkart'])).toEqual(['flipkart'])
    expect(unmappedText(LAMPS, ['amazon', 'flipkart'])).toBe('Flipkart can’t list this category yet.')
    expect(unmappedText(KURTA, ['amazon', 'flipkart'])).toBeNull()
    expect(unmappedText(LAMPS, [])).toBeNull()
    expect(unmappedText(undefined, ['flipkart'])).toBeNull()
  })

  it('names a code only when it says more than the name', () => {
    expect(typeText(m('flipkart', 'table_lamp', 'Table lamp'))).toBe('Table lamp')
    expect(typeText(m('amazon', 'LAMP', 'Lamp'))).toBe('Lamp (LAMP)')
    expect(typeText(m('flipkart', 'saree', 'Ethnic saree'))).toBe('Ethnic saree (saree)')
  })

  it('offers the enabled categories and keeps an old value visible', () => {
    const items = [KURTA, LAMPS, TEES]
    expect(catalogChoices(items).map((c) => c.value)).toEqual(['ethnic_wear_kurta_sets', 'tshirts'])
    expect(catalogChoices(items, 'home_decor_lamps').at(-1)).toEqual({ value: 'home_decor_lamps', label: 'Lamps', mapped: true, group: 'home' })
    expect(catalogChoices(items, 'kurtas').at(-1)).toEqual({ value: 'kurtas', label: 'kurtas', mapped: false, group: 'other' })
  })

  it('client feedback 17 Nov: groups by the backend `group`, deriving it when an older backend leaves it out', () => {
    const jeans: CatalogCategory = { category: 'jeans', label: 'Jeans', enabled: true, marketplaces: [] }
    const saree: CatalogCategory = { category: 'sarees', label: 'Sarees', enabled: true, group: 'ethnic', marketplaces: [] }
    expect(catalogChoices([TEES, jeans, saree]).map((c) => [c.value, c.group])).toEqual([
      ['tshirts', 'topwear'],
      ['jeans', 'bottomwear'],
      ['sarees', 'ethnic'],
    ])
    // No catalog yet: the built-in list, with the five bottomwear categories.
    expect(pickerChoices(null, false).filter((c) => c.group === 'bottomwear').map((c) => c.label)).toEqual(['Jeans', 'Trousers', 'Track pants', 'Shorts', 'Skirts'])
    expect(pickerChoices([TEES], false).map((c) => c.value)).toEqual(['tshirts'])
  })
})
