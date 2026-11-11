import { describe, expect, it } from 'vitest'
import { catalogChoices, mappingText, typeText, unmappedOn, type CatalogCategory } from './catalog-categories'

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
  })

  it('names a code only when it says more than the name', () => {
    expect(typeText(m('flipkart', 'table_lamp', 'Table lamp'))).toBe('Table lamp')
    expect(typeText(m('amazon', 'LAMP', 'Lamp'))).toBe('Lamp (LAMP)')
    expect(typeText(m('flipkart', 'saree', 'Ethnic saree'))).toBe('Ethnic saree (saree)')
  })

  it('offers the enabled categories and keeps an old value visible', () => {
    const items = [KURTA, LAMPS, TEES]
    expect(catalogChoices(items).map((c) => c.value)).toEqual(['ethnic_wear_kurta_sets', 'tshirts'])
    expect(catalogChoices(items, 'home_decor_lamps').at(-1)).toEqual({ value: 'home_decor_lamps', label: 'Lamps', mapped: true })
    expect(catalogChoices(items, 'kurtas').at(-1)).toEqual({ value: 'kurtas', label: 'kurtas', mapped: false })
  })
})
