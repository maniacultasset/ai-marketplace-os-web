import { describe, expect, it } from 'vitest'
import type { Schema } from '@/api/types'
import { buildPatch, editableAttrs, mapPatchErrors, toEditDraft, validateEdit } from './edit-model'
import { emptySizeRow } from './intake-model'

const product = (over: Partial<Schema<'ProductOut'>> = {}): Schema<'ProductOut'> => ({
  id: 'p1',
  sku: 'KS-1',
  title: 'Cotton kurta',
  status: 'active',
  category: 'kurtas',
  created_at: '2026-11-07T10:00:00Z',
  updated_at: '2026-11-07T10:00:00Z',
  attributes: { fabric_type: 'Cotton', fiber_composition: '60% Cotton, 40% Polyester', occasion: 'Casual' },
  fiber_composition: [{ fibre: 'cotton', percent: 60 }, { fibre: 'polyester', percent: 40 }],
  style_number: 'ST-1',
  mrp: '1299.00',
  selling_price: '999.00',
  size_chart: { unit: 'in', basis: 'garment', rows: [{ size: 'M', chest: 40 }] },
  manufacturer: { id: 'm1', legal_name: 'Brand Mfr', address_line1: '1 Road', city: 'Jaipur', state_code: 'RJ', postal_code: '302001', country_code: 'IN', inherited: true },
  ...over,
})

describe('product edit', () => {
  it('reads a product into a draft', () => {
    const d = toEditDraft(product())
    expect(d.styleNumber).toBe('ST-1')
    expect(d.composition).toEqual([{ fibre: 'Cotton', percent: '60' }, { fibre: 'Polyester', percent: '40' }])
    expect(d.ownManufacturer).toBe(false)
    expect(d.sizeChart.rows[0]).toEqual({ ...emptySizeRow('M'), chest: '40' })
  })

  it('sends nothing when nothing changed (money compared by value)', () => {
    const base = toEditDraft(product())
    expect(buildPatch(base, { ...base, mrp: '1299', sellingPrice: '₹999' }, false)).toEqual({})
  })

  it('sends only changed fields and null to clear', () => {
    const base = toEditDraft(product())
    const d = {
      ...base,
      styleNumber: '',
      mrp: '1499',
      attrs: { ...base.attrs, fabric_type: '', color: 'Blue' },
      composition: [{ fibre: 'Cotton', percent: '100' }],
      sizeChart: { ...base.sizeChart, rows: [] },
    }
    expect(buildPatch(base, d, false)).toEqual({
      style_number: null,
      mrp: '1499',
      attributes: { fabric_type: null, color: 'Blue', fiber_composition: '100% Cotton' },
      size_chart: null,
    })
  })

  it('sets and clears an own manufacturer', () => {
    const base = toEditDraft(product())
    const own = { ...base, ownManufacturer: true, manufacturer: { ...base.manufacturer, legal_name: 'Own Mfr' } }
    expect(buildPatch(base, own, false).manufacturer).toMatchObject({ legal_name: 'Own Mfr', state_code: 'RJ' })
    const ownBase = toEditDraft(product({ manufacturer: { ...product().manufacturer!, inherited: false } }))
    expect(buildPatch(ownBase, { ...ownBase, ownManufacturer: false }, false)).toEqual({ manufacturer: null })
  })

  it('never sends style-owned fields on a variant', () => {
    const base = toEditDraft(product({ parent_product_id: 'style-1' }))
    const d = { ...base, styleNumber: 'X', attrs: { ...base.attrs, color: 'Red', fit: 'Slim' }, sizeChart: { ...base.sizeChart, rows: [] } }
    expect(buildPatch(base, d, true)).toEqual({ attributes: { fit: 'Slim' } })
    expect(editableAttrs(true)).not.toContain('color')
  })

  it('validates like the create form', () => {
    const base = toEditDraft(product())
    expect(validateEdit(base, false)).toEqual({})
    expect(validateEdit({ ...base, title: '' }, false).title).toBeDefined()
    expect(validateEdit({ ...base, sellingPrice: '1500' }, false).selling_price).toMatch(/at or below/)
    expect(validateEdit({ ...base, ownManufacturer: true, manufacturer: { ...base.manufacturer, postal_code: '1' } }, false)['manufacturer.postal_code']).toBeDefined()
  })

  it('maps 422s, including the variant level error', () => {
    const base = toEditDraft(product())
    const r = mapPatchErrors({ type: 'FACT_LEVEL_INVALID', details: [{ loc: ['body', 'style_number'], msg: 'x' }] }, base)
    expect(r).toEqual({ fields: { style_number: 'This is set on the style, not on a single variant.' }, unmapped: false })
    expect(mapPatchErrors({ type: 'VALIDATION_FAILED', details: [{ loc: ['body', 'size_chart', 'rows', 0, 'chest'], msg: 'big' }] }, base).fields).toEqual({
      'size_chart.rows.0.chest': 'big',
    })
    expect(mapPatchErrors({ type: 'VALIDATION_FAILED', details: [{ loc: ['header', 'If-Match'], msg: 'x' }] }, base).unmapped).toBe(true)
  })
})
