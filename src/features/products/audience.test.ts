import { describe, expect, it } from 'vitest'
import { audienceServerMessage, brandNameProblem, brandView, hasAudience, photoReadView, variantAxes, variantAxesText } from './audience'

describe('audience and brand', () => {
  it('knows when the backend sends the fields', () => {
    expect(hasAudience({ gender: null })).toBe(true)
    expect(hasAudience({})).toBe(false)
  })
  it('reads the effective brand and its source', () => {
    expect(brandView({ brand_name: 'Kuinn Basics', brand_name_inherited: true })).toEqual({ name: 'Kuinn Basics', inherited: true })
    expect(brandView({ brand_name: '  ', brand_name_inherited: false })).toEqual({ name: null, inherited: false })
  })
  it('checks an own brand name', () => {
    expect(brandNameProblem('')).toMatch(/Enter the brand name/)
    expect(brandNameProblem('a'.repeat(101))).toMatch(/100/)
    expect(brandNameProblem('Rang')).toBeNull()
  })
  it('explains server refusals', () => {
    expect(audienceServerMessage('brand_name', 'VALUE_NOT_ALLOWED', 'x')).toMatch(/store name/)
    expect(audienceServerMessage('gender', 'VALIDATION_FAILED', 'Extra inputs are not permitted')).toMatch(/can’t be saved here yet/)
  })
})

describe('variant axes', () => {
  it('orders colour before size and skips blanks', () => {
    expect(variantAxes({ variant_attributes: { size: 'M', color: 'Navy', fit: '' } })).toEqual([
      { key: 'color', label: 'Colour', value: 'Navy' },
      { key: 'size', label: 'Size', value: 'M' },
    ])
    expect(variantAxesText({ variant_attributes: { size: 'M', color: 'Navy' } })).toBe('Navy · M')
    expect(variantAxesText({})).toBeNull()
  })
})

describe('photoReadView', () => {
  const at = '2026-11-08T10:00:00Z'
  it('says what the read did', () => {
    expect(photoReadView({ status: 'read', at, written: 3, asked: 1 })).toMatchObject({ chip: 'live', detail: '3 details filled, 1 question for you.' })
    expect(photoReadView({ status: 'read', at, written: 0, asked: 0 }).detail).toMatch(/Nothing new/)
    expect(photoReadView({ status: 'unchanged', at, written: 0, asked: 0 }).label).toBe('Photos unchanged')
    expect(photoReadView({ status: 'failed', at, written: 0, asked: 0 })).toMatchObject({ chip: 'error', label: 'Photo read failed' })
    expect(photoReadView({ status: 'not_read', at, written: 0, asked: 0 }).label).toBe('Photos not read')
  })
})
