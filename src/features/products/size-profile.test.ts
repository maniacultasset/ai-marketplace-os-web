import { describe, expect, it } from 'vitest'
import { COMMON_SIZES, DEFAULT_MEASURES, emptySizeRow, measuresInUse } from './intake-model'
import { categoryGroup, DEFAULT_SIZE_PROFILE, levelsName, showsForCategory, sizeProfileFor } from './size-profile'
import { HSN_BY_CATEGORY, PACKAGE_RANGES } from './seller-fields'

const WAIST = ['26', '28', '30', '32', '34', '36', '38', '40', '42', '44']

describe('size profile', () => {
  it('keeps today’s chart for tshirts, kurta sets, lamps and no category', () => {
    for (const c of ['tshirts', 'ethnic_wear_kurta_sets', 'home_decor_lamps', 'uncategorized', '', null]) {
      const p = sizeProfileFor(c)
      expect(p.sizes).toEqual([...COMMON_SIZES])
      expect(p.measures).toEqual([...DEFAULT_MEASURES])
    }
    expect(sizeProfileFor('tshirts')).toBe(DEFAULT_SIZE_PROFILE)
  })

  it('falls back to the contract table for bottomwear while the backend has no field', () => {
    expect(sizeProfileFor('jeans')).toEqual({ sizeSystem: 'waist', sizes: WAIST, measures: ['waist', 'hip', 'inseam', 'length'] })
    expect(sizeProfileFor('trousers').sizes).toEqual(WAIST)
    expect(sizeProfileFor('track_pants')).toEqual({ sizeSystem: 'alpha', sizes: [...COMMON_SIZES], measures: ['waist', 'hip', 'inseam', 'length'] })
    expect(sizeProfileFor('shorts')).toEqual({ sizeSystem: 'waist', sizes: WAIST.slice(0, 8), measures: ['waist', 'hip', 'length'] })
    expect(sizeProfileFor('skirts').measures).toEqual(['waist', 'hip', 'length'])
    // A requirements answer from a backend without the field still falls back.
    expect(sizeProfileFor('jeans', { category: 'jeans' }).sizes).toEqual(WAIST)
  })

  it('takes the backend profile when present; null keeps today’s chart', () => {
    const req = { category: 'jeans', size_profile: { size_system: 'waist' as const, sizes: ['30', '32'], measures: ['waist', 'inseam'] as ('waist' | 'inseam')[] } }
    expect(sizeProfileFor('jeans', req)).toEqual({ sizeSystem: 'waist', sizes: ['30', '32'], measures: ['waist', 'inseam'] })
    expect(sizeProfileFor('jeans', { category: 'jeans', size_profile: null })).toBe(DEFAULT_SIZE_PROFILE)
    // A stale answer for another category is not used.
    expect(sizeProfileFor('tshirts', req)).toBe(DEFAULT_SIZE_PROFILE)
  })

  it('a switch of category keeps filled columns and drops empty ones the new category does not list', () => {
    const chart = { unit: 'in' as const, basis: 'garment' as const, rows: [{ ...emptySizeRow('M'), chest: '40' }] }
    expect(measuresInUse(chart)).toEqual(['chest', 'waist', 'hip', 'length'])
    expect(measuresInUse(chart, [], sizeProfileFor('jeans').measures)).toEqual(['waist', 'hip', 'inseam', 'length', 'chest'])
    expect(measuresInUse({ ...chart, rows: [emptySizeRow('32')] }, [], sizeProfileFor('jeans').measures)).toEqual(['waist', 'hip', 'inseam', 'length'])
  })

  it('groups categories and shows garment-part fields by group', () => {
    expect(categoryGroup('jeans')).toBe('bottomwear')
    expect(categoryGroup('tshirts')).toBe('topwear')
    expect(categoryGroup('nope')).toBeNull()
    expect(showsForCategory('top', 'neckline', 'tshirts', '')).toBe(true)
    expect(showsForCategory('top', 'neckline', 'jeans', '')).toBe(false)
    expect(showsForCategory('top', 'neckline', 'jeans', 'Round')).toBe(true)
    expect(showsForCategory('top', 'neckline', 'jeans', '', { amazon: { neckline: 'recommended' } })).toBe(true)
    expect(showsForCategory('bottom', 'rise', 'tshirts', '')).toBe(false)
    expect(showsForCategory('bottom', 'rise', 'shorts', '')).toBe(true)
    expect(levelsName({ amazon: { rise: 'unsupported' } }, 'rise')).toBe(false)
  })

  it('suggests HSN and package ranges for bottomwear', () => {
    expect(HSN_BY_CATEGORY).toMatchObject({ jeans: '6203', trousers: '6203', shorts: '6203', track_pants: '6103', skirts: '6204', tshirts: '6109' })
    expect(PACKAGE_RANGES.jeans).toBe(PACKAGE_RANGES.tshirts)
  })
})
