import { describe, expect, it } from 'vitest'
import type { Schema } from '@/api/types'
import { buildPatch, changedOnServer, editableAttrs, manufacturerSource, mapPatchErrors, rebaseDraft, toEditDraft, validateEdit } from './edit-model'
import { emptySizeRow } from './intake-model'

const product = (over: Partial<Schema<'ProductOut'>> = {}): Schema<'ProductOut'> => ({
  id: 'p1',
  sku: 'KS-1',
  title: 'Cotton kurta',
  status: 'active',
  category: 'kurtas',
  created_at: '2026-11-07T10:00:00Z',
  identifier_exemption: false,
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

describe('stale version rebase (409)', () => {
  it('keeps my changes on top of theirs and never reverts their fields', () => {
    const original = product()
    const mine = { ...toEditDraft(original), title: 'My new title' }
    const theirs = product({ mrp: '999.00', updated_at: '2026-11-07T11:00:00Z' })
    const rebased = rebaseDraft(toEditDraft(original), mine, toEditDraft(theirs))
    expect(rebased.title).toBe('My new title')
    expect(rebased.mrp).toBe('999.00')
    // The retry sends only my change against their version.
    expect(buildPatch(toEditDraft(theirs), rebased, false)).toEqual({ title: 'My new title' })
  })
  it('rebases nested fields one by one', () => {
    const original = toEditDraft(product())
    const mine = { ...original, attrs: { ...original.attrs, fit: 'Slim' } }
    const theirs = toEditDraft(product({ attributes: { ...product().attributes, fabric_type: 'Linen' } }))
    const r = rebaseDraft(original, mine, theirs)
    expect(r.attrs.fit).toBe('Slim')
    expect(r.attrs.fabric_type).toBe('Linen')
  })
})

describe('manufacturerSource', () => {
  const m = product().manufacturer!
  it('reads brand, style and own', () => {
    expect(manufacturerSource(product(), null)).toBe('brand')
    expect(manufacturerSource(product({ manufacturer: null }), null)).toBe('none')
    const own = product({ manufacturer: { ...m, inherited: false } })
    expect(manufacturerSource(own, null)).toBe('own')
    // A variant whose party is its style's effective one inherits it from the style.
    const variant = product({ parent_product_id: 's1', manufacturer: { ...m, id: 'm9', inherited: false } })
    expect(manufacturerSource(variant, product({ id: 's1', manufacturer: { ...m, id: 'm9', inherited: false } }))).toBe('style')
    expect(manufacturerSource(variant, product({ id: 's1', manufacturer: { ...m, id: 'm8', inherited: false } }))).toBe('own')
    // Parent not loaded: unknown, so no clear action is offered.
    expect(manufacturerSource(variant, undefined)).toBe('unknown')
  })
  it('does not treat a style-inherited manufacturer as own in the draft', () => {
    const variant = product({ parent_product_id: 's1', manufacturer: { ...m, id: 'm9', inherited: false } })
    expect(toEditDraft(variant, 'style').ownManufacturer).toBe(false)
    expect(toEditDraft(variant, 'own').ownManufacturer).toBe(true)
  })
})

describe('changedOnServer', () => {
  it('tells a real save from a no-op', () => {
    expect(changedOnServer(product(), product({ updated_at: 'later' }), false)).toBe(false)
    expect(changedOnServer(product(), product({ mrp: '1499.00' }), false)).toBe(true)
    expect(changedOnServer(product(), product({ manufacturer: { ...product().manufacturer!, id: 'm2' } }), false)).toBe(true)
  })
})

describe('category edit', () => {
  it('sends a changed category on a style or standalone product, never on a variant', () => {
    const base = toEditDraft(product({ category: 'ethnic_wear_kurta_sets' }))
    expect(buildPatch(base, { ...base, category: 'tshirts' }, false)).toEqual({ category: 'tshirts' })
    expect(buildPatch(base, { ...base, category: 'tshirts' }, true)).toEqual({})
    expect(buildPatch(base, base, false)).toEqual({})
  })

  it('maps the 422 at category to the listing rule', () => {
    const d = toEditDraft(product())
    const out = mapPatchErrors({ type: 'VALIDATION_FAILED', details: [{ loc: ['body', 'category'], msg: 'Value error' }] }, d)
    expect(out.fields.category).toBe('The category can’t change once the product has a listing.')
    expect(out.unmapped).toBe(false)
  })

  it('keeps the person’s category when someone else saved meanwhile', () => {
    const original = toEditDraft(product({ category: 'ethnic_wear_kurta_sets' }))
    const fresh = toEditDraft(product({ category: 'ethnic_wear_kurta_sets', title: 'New title' }))
    const out = rebaseDraft(original, { ...original, category: 'tshirts' }, fresh)
    expect(out.category).toBe('tshirts')
    expect(out.title).toBe('New title')
  })
})

describe('barcode edit', () => {
  const EAN = '4006381333931'

  it('reads the barcode or the exemption into the draft', () => {
    expect(toEditDraft(product({ product_identifier: { type: 'ean', value: EAN } })).barcode).toEqual({ type: 'ean', value: EAN, exempt: false })
    expect(toEditDraft(product({ identifier_exemption: true })).barcode.exempt).toBe(true)
  })

  it('checks the barcode, and not while exempt', () => {
    const d = toEditDraft(product())
    expect(validateEdit({ ...d, barcode: { type: 'ean', value: '4006381333932', exempt: false } }, false).barcode).toMatch(/last digit/)
    expect(validateEdit({ ...d, barcode: { type: 'ean', value: '4006381333932', exempt: true } }, false).barcode).toBeUndefined()
  })

  it('patches the barcode, never together with the exemption, and only the exemption on a style', () => {
    const base = toEditDraft(product())
    expect(buildPatch(base, { ...base, barcode: { type: 'ean', value: EAN, exempt: false } }, false)).toEqual({ product_identifier: { type: 'ean', value: EAN } })
    expect(buildPatch(base, { ...base, barcode: { type: 'ean', value: EAN, exempt: true } }, false)).toEqual({ identifier_exemption: true })
    expect(buildPatch(base, { ...base, barcode: { type: 'ean', value: EAN, exempt: true } }, false, 'style')).toEqual({ identifier_exemption: true })
    expect(buildPatch(base, { ...base, barcode: { type: 'ean', value: EAN, exempt: false } }, false, 'style')).toEqual({})
  })

  it('maps a refused barcode onto the field', () => {
    const d = { ...toEditDraft(product()), barcode: { type: 'ean' as const, value: EAN, exempt: false } }
    expect(mapPatchErrors({ type: 'VALIDATION_FAILED', details: [{ loc: ['body', 'product_identifier', 'value'], msg: 'x' }] }, d).fields).toEqual({
      barcode: 'Another product in this brand already has this barcode. Check the number.',
    })
    const style = mapPatchErrors({ type: 'FACT_LEVEL_INVALID', details: [{ loc: ['body', 'product_identifier'], msg: 'x' }] }, d)
    expect(style.fields.barcode).toMatch(/each variant/)
    expect(style.unmapped).toBe(false)
  })

  it('keeps the person’s barcode change on a stale rebase', () => {
    const original = toEditDraft(product())
    const mine = { ...original, barcode: { type: 'upc' as const, value: '036000291452', exempt: false } }
    const theirs = toEditDraft(product({ title: 'Renamed' }))
    const out = rebaseDraft(original, mine, theirs)
    expect(out.barcode).toEqual(mine.barcode)
    expect(out.title).toBe('Renamed')
  })
})
