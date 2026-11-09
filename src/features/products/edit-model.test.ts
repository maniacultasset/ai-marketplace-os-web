import { describe, expect, it } from 'vitest'
import type { Schema } from '@/api/types'
import { buildPatch, changedOnServer, editableAttrs, manufacturerSource, mapPatchErrors, rebaseDraft, toEditDraft, validateEdit, withHsnSuggestion } from './edit-model'
import { emptySizeRow, fromReadChart, UNIT_CHOOSE_MSG, UNIT_CONFIRM_MSG, withUnit } from './intake-model'

const product = (over: Partial<Schema<'ProductOut'>> = {}): Schema<'ProductOut'> => ({
  id: 'p1',
  sku: 'KS-1',
  title: 'Cotton kurta',
  status: 'active',
  category: 'kurtas',
  created_at: '2026-11-07T10:00:00Z',
  identifier_exemption: false, brand_name_inherited: false, size_chart_read_enabled: false, category_suggest_enabled: false,
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

  it('edits audience and brand only on a backend that sends them (SI8)', () => {
    const old = toEditDraft(product())
    expect(old.hasAudience).toBe(false)
    expect(buildPatch(old, { ...old, gender: 'men' }, false)).toEqual({})
    const base = toEditDraft(product({ gender: null, brand_name: 'Store', brand_name_inherited: true }))
    expect(base).toMatchObject({ hasAudience: true, ownBrand: false, brandName: '' })
    expect(buildPatch(base, { ...base, gender: 'men' }, false)).toEqual({ gender: 'men' })
    expect(buildPatch(base, { ...base, ownBrand: true, brandName: 'Rang' }, false)).toEqual({ brand_name: 'Rang' })
    const own = toEditDraft(product({ gender: 'women', brand_name: 'Rang', brand_name_inherited: false }))
    expect(buildPatch(own, { ...own, ownBrand: false }, false)).toEqual({ brand_name: null })
    expect(buildPatch(own, { ...own, gender: '' }, false)).toEqual({ gender: null })
    // Style level: never from a variant.
    expect(buildPatch(own, { ...own, gender: 'men' }, true)).toEqual({})
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
    expect(buildPatch(base, { ...base, barcode: { type: 'ean', value: EAN, exempt: true, touched: true } }, false, 'style')).toEqual({ identifier_exemption: true })
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

describe('SI12 seller fields in the editor', () => {
  it('reads HSN, country and package, and patches only what changed', () => {
    const base = toEditDraft(product({ hsn_code: '6109', country_of_origin: 'IN', package: { length_cm: '30.00', breadth_cm: '25.00', height_cm: '3.00', weight_g: 250 } }))
    expect(base).toMatchObject({ hsn: '6109', country: 'IN', pkg: { length: '30', breadth: '25', height: '3', weight: '250' } })
    expect(buildPatch(base, base, false)).toEqual({})
    expect(buildPatch(base, { ...base, hsn: '610910', country: 'bd', pkg: { ...base.pkg, weight: '300' } }, false)).toEqual({
      hsn_code: '610910',
      country_of_origin: 'BD',
      package: { weight_g: 300 },
    })
    expect(buildPatch(base, { ...base, hsn: '', country: '', pkg: { length: '', breadth: '', height: '', weight: '' } }, false)).toEqual({
      hsn_code: null,
      country_of_origin: null,
      package: null,
    })
  })

  it('checks HSN, country and package like the backend', () => {
    const d = toEditDraft(product())
    expect(validateEdit({ ...d, hsn: '61', country: 'India', pkg: { length: '30', breadth: '', height: '', weight: '0' } }, false)).toMatchObject({
      hsn_code: expect.any(String),
      country_of_origin: expect.any(String),
      package: expect.any(String),
      'package.weight': expect.any(String),
    })
  })

  it('offers the HSN suggestion only while the product has none', () => {
    const p = product({ hsn_code: null, suggestions: { hsn_code: { value: '6109', basis: 'category' } } })
    const d = withHsnSuggestion(toEditDraft(p), p)
    expect(d).toMatchObject({ hsn: '6109', hsnSuggested: true })
    // Saving confirms it: it is part of the patch.
    expect(buildPatch(toEditDraft(p), d, false)).toEqual({ hsn_code: '6109' })
    const own = product({ hsn_code: '6205', suggestions: { hsn_code: { value: '6109', basis: 'category' } } })
    expect(withHsnSuggestion(toEditDraft(own), own).hsn).toBe('6205')
  })

  it('sends the size-chart photo as evidence with a chart read from it, never alone', () => {
    const base = toEditDraft(product({ size_chart: null }))
    const read = { ...base, sizeChart: { unit: 'cm' as const, basis: 'garment' as const, rows: [{ ...emptySizeRow('M'), chest: '102' }] }, sizeChartImageId: 'img-1' }
    expect(buildPatch(base, read, false)).toEqual({
      size_chart: { unit: 'cm', basis: 'garment', rows: [{ size: 'M', chest: 102 }] },
      size_chart_image_id: 'img-1',
    })
    expect(buildPatch(base, { ...base, sizeChartImageId: 'img-1' }, false)).toEqual({})
  })

  it('sends a chart read from the photo only after the seller chose or confirmed its unit', () => {
    const base = toEditDraft(product({ size_chart: null }))
    const rows = [{ size: 'M', chest: 102 }]
    const unknown = { ...base, sizeChart: fromReadChart({ unit: 'unknown', basis: 'garment', rows }, null), sizeChartImageId: 'img-1' }
    expect(validateEdit(unknown, false)['size_chart.unit']).toBe(UNIT_CHOOSE_MSG)
    expect(buildPatch(base, unknown, false)).toEqual({})
    const chosen = { ...unknown, sizeChart: withUnit(unknown.sizeChart, 'in') }
    expect(validateEdit(chosen, false)['size_chart.unit']).toBeUndefined()
    expect(buildPatch(base, chosen, false)).toEqual({ size_chart: { unit: 'in', basis: 'garment', rows }, size_chart_image_id: 'img-1' })
    const read = { ...base, sizeChart: fromReadChart({ unit: 'cm', basis: 'garment', rows }, 'Size chart (cm)'), sizeChartImageId: 'img-1' }
    expect(validateEdit(read, false)['size_chart.unit']).toBe(UNIT_CONFIRM_MSG)
    expect(buildPatch(base, read, false)).toEqual({})
    expect(buildPatch(base, { ...read, sizeChart: withUnit(read.sizeChart, 'cm') }, false).size_chart).toEqual({ unit: 'cm', basis: 'garment', rows })
  })

  it('maps the server refusing a unit onto the unit picker', () => {
    const { fields } = mapPatchErrors({ type: 'VALIDATION_FAILED', details: [{ loc: ['body', 'size_chart', 'unit'], msg: 'x' }] }, toEditDraft(product()))
    expect(fields['size_chart.unit']).toBe(UNIT_CHOOSE_MSG)
  })

  it('maps package and size-chart photo errors onto their fields', () => {
    const d = toEditDraft(product())
    const { fields, unmapped } = mapPatchErrors(
      {
        type: 'VALIDATION_FAILED',
        details: [
          { loc: ['body', 'package', 'weight_g'], msg: 'too heavy' },
          { loc: ['body', 'size_chart_image_id'], msg: 'not a size chart' },
          { loc: ['body', 'hsn_code'], msg: 'bad' },
        ],
      },
      d,
    )
    expect(unmapped).toBe(false)
    expect(Object.keys(fields).sort()).toEqual(['hsn_code', 'package.weight', 'size_chart'])
  })
})
