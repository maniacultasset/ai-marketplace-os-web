import { describe, expect, it } from 'vitest'
import { categoryChoices, categoryGroup, categoryLabel } from './categories'

describe('categories', () => {
  it('offers the listable categories plus the product’s own', () => {
    expect(categoryChoices('tshirts').map((c) => c.label)).toEqual(['Kurta sets', 'T-shirts', 'Jeans', 'Trousers', 'Track pants', 'Shorts', 'Skirts'])
    expect(categoryChoices('kurtas').map((c) => c.value)).toEqual(['ethnic_wear_kurta_sets', 'tshirts', 'jeans', 'trousers', 'track_pants', 'shorts', 'skirts', 'kurtas'])
    expect(categoryLabel('track_pants')).toBe('Track pants')
    expect(categoryLabel('home_decor_lamps')).toBe('Lamps')
    expect(categoryLabel('mens_shirts')).toBe('Mens shirts')
  })
})

describe('categoryGroup (client feedback 17 Nov)', () => {
  it('takes the backend group when known, else the built-in one, else other', () => {
    expect(categoryGroup('tshirts')).toBe('topwear')
    expect(categoryGroup('jeans')).toBe('bottomwear')
    expect(categoryGroup('skirts')).toBe('bottomwear')
    expect(categoryGroup('ethnic_wear_kurta_sets')).toBe('ethnic')
    expect(categoryGroup('home_decor_lamps')).toBe('home')
    expect(categoryGroup('sarees')).toBe('other')
    expect(categoryGroup('sarees', 'ethnic')).toBe('ethnic')
    expect(categoryGroup('jeans', 'nonsense')).toBe('bottomwear')
    expect(categoryGroup('jeans', null)).toBe('bottomwear')
  })
})
