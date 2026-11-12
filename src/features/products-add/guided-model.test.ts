import { describe, expect, it } from 'vitest'
import { emptySizeRow } from '@/features/products/intake-model'
import { emptyGuided, errorOrder, isEmptyGuided, mapCreateErrors, missingCritical, reviveGuided, sectionStates, toProductCreate, validateGuided } from './guided-model'

const filled = () => ({ ...emptyGuided(), sku: 'FSH-TEE-001', title: 'Relaxed Cotton Tee', category: 'tshirts' })

describe('guided form', () => {
  it('validates identity and category like ProductCreate', () => {
    expect(validateGuided(emptyGuided())).toMatchObject({ sku: expect.any(String), title: expect.any(String), category: expect.any(String) })
    expect(validateGuided({ ...filled(), sku: 'has space' }).sku).toBeDefined()
    expect(validateGuided({ ...filled(), category: 'T-shirts' }).category).toBeDefined()
    expect(validateGuided(filled())).toEqual({})
  })

  it('sends only filled attributes, trimmed', () => {
    const v = {
      ...filled(),
      attrs: { fabric_type: ' Cotton ', fit: '' },
      composition: [{ fibre: 'cotton', percent: '95' }, { fibre: 'Elastane', percent: '5' }],
      extra: [{ key: 'occasion', value: 'Casual' }, { key: '', value: '' }],
    }
    expect(toProductCreate(v)).toEqual({
      sku: 'FSH-TEE-001',
      title: 'Relaxed Cotton Tee',
      category: 'tshirts',
      attributes: { fabric_type: 'Cotton', fiber_composition: '95% cotton, 5% Elastane', occasion: 'Casual' },
    })
  })

  it('sends the audience and an own brand only when set (SI8)', () => {
    expect(toProductCreate({ ...filled(), gender: 'women' }).gender).toBe('women')
    expect('brand_name' in toProductCreate({ ...filled(), brandName: 'Rang' })).toBe(false)
    expect(toProductCreate({ ...filled(), ownBrand: true, brandName: ' Rang ' }).brand_name).toBe('Rang')
    expect(validateGuided({ ...filled(), ownBrand: true, brandName: '' }).brand_name).toMatch(/Enter the brand name/)
  })

  it('rejects an extra attribute that repeats a form field', () => {
    expect(validateGuided({ ...filled(), extra: [{ key: 'fit', value: 'x' }] })['extra.0.key']).toBeDefined()
  })

  it('reports completeness per section', () => {
    const s = sectionStates({ ...filled(), attrs: { fabric_type: 'Jersey' } })
    expect(s.identity).toEqual({ kind: 'done' })
    expect(s.fabric).toEqual({ kind: 'missing', count: 1 })
    expect(s.price).toEqual({ kind: 'missing', count: 1 })
    expect(s.care).toEqual({ kind: 'missing', count: 2 })
    expect(s.size).toEqual({ kind: 'todo' })
    // SI12: the Front photo is required too.
    expect(s.media).toEqual({ kind: 'missing', count: 1 })
    expect(missingCritical({ ...filled(), attrs: { fabric_type: 'Jersey' } })).toEqual(['Front photo', 'Fabric composition', 'MRP', 'Wash care', 'Iron care'])
    expect(missingCritical({ ...filled(), attrs: { fabric_type: 'Jersey' } }, { brandManufacturer: null, hasMain: true, imageCount: 1 })).not.toContain('Front photo')
    // No brand default and no own manufacturer: the manufacturer is missing too.
    const ctx = { brandManufacturer: false, hasMain: true, imageCount: 1 }
    expect(missingCritical(filled(), ctx)).toContain('Manufacturer')
    expect(missingCritical({ ...filled(), ownManufacturer: true }, ctx)).not.toContain('Manufacturer')
    expect(sectionStates(filled(), ctx).media).toEqual({ kind: 'done' })
  })

  it('makes the packed box critical when Amazon is ticked (item 15)', () => {
    const ctx = { brandManufacturer: true, hasMain: true, imageCount: 1 }
    expect(missingCritical(filled(), ctx)).not.toContain('Package size')
    const amazon = { ...ctx, amazon: true }
    expect(missingCritical(filled(), amazon)).toEqual(expect.arrayContaining(['Package size', 'Package weight']))
    expect(sectionStates(filled(), amazon).shipping).toEqual({ kind: 'missing', count: 2 })
    const boxed = { ...filled(), pkg: { length: '30', breadth: '25', height: '3', weight: '' } }
    expect(missingCritical(boxed, amazon)).not.toContain('Package size')
    expect(missingCritical(boxed, amazon)).toContain('Package weight')
    expect(missingCritical({ ...boxed, pkg: { ...boxed.pkg, weight: '250' } }, amazon)).not.toContain('Package weight')
    // Never a save error: the seller can save and add it later.
    expect(validateGuided(filled())).toEqual({})
  })

  it('maps server errors onto fields', () => {
    const v = { ...filled(), extra: [{ key: 'not_a_fact', value: 'x' }] }
    expect(mapCreateErrors({ status: 409, type: 'SKU_CONFLICT', details: [] }, v).fields.sku).toMatch(/already exists/)
    const unknown = mapCreateErrors({ status: 422, type: 'UNKNOWN_FACT_KEY', details: [{ loc: ['body', 'attributes', 'not_a_fact'], msg: 'x' }] }, v)
    expect(unknown).toEqual({ fields: { 'extra.0.key': 'Unknown attribute.' }, unmapped: false })
    expect(mapCreateErrors({ status: 422, type: 'VALIDATION_FAILED', details: [{ loc: ['query'], msg: 'x' }] }, v).unmapped).toBe(true)
  })

  it('says how to fix a SKU, product name or category', () => {
    expect(validateGuided({ ...filled(), sku: 'FSH TEE' }).sku).toMatch(/Remove the spaces/)
    expect(validateGuided({ ...filled(), sku: 'FSH]1' }).sku).toMatch(/Remove the "\]"/)
    expect(validateGuided({ ...filled(), sku: 'A'.repeat(65) }).sku).toMatch(/64 characters or fewer/)
    expect(validateGuided({ ...filled(), sku: 'FSH\u0007' }).sku).toMatch(/control character/)
    expect(validateGuided({ ...filled(), title: '12345' }).title).toMatch(/at least one letter/)
    expect(validateGuided({ ...filled(), title: '!!!' }).title).toBeDefined()
    expect(validateGuided({ ...filled(), category: '' }).category).toBe('Choose a category.')
    expect(validateGuided({ ...filled(), category: 'kurtas' }).category).toMatch(/Choose a category from the list/)
    expect(validateGuided({ ...filled(), category: 'ethnic_wear_kurta_sets' }).category).toBeUndefined()
    expect(validateGuided({ ...filled(), category: 'home_decor_lamps' }).category).toBeUndefined()
  })

  it('lets the seller skip the category only when Kuinn suggests it (SI14)', () => {
    expect(validateGuided({ ...filled(), category: '', kuinnSuggests: true }).category).toBeUndefined()
    expect(validateGuided({ ...filled(), category: '', kuinnSuggests: false }).category).toBe('Choose a category.')
    // Skipped: the create leaves the category out, so the backend classifies the product.
    expect('category' in toProductCreate({ ...filled(), category: '', kuinnSuggests: true })).toBe(false)
    // Switch off (the form clears kuinnSuggests): the body is exactly as before.
    expect(toProductCreate({ ...filled(), category: 'tshirts' }).category).toBe('tshirts')
    expect(isEmptyGuided({ ...emptyGuided(), kuinnSuggests: true })).toBe(false)
    expect(reviveGuided({ kuinnSuggests: true }).kuinnSuggests).toBe(true)
    expect(reviveGuided({}).kuinnSuggests).toBe(false)
  })

  it('accepts real product names with digits, symbols and any script', () => {
    for (const title of ['Levi’s 501 jeans', '100% cotton tee', 'boAt 2.0 earbuds', 'खादी कुर्ता', 'T-shirt (pack of 3)'])
      expect(validateGuided({ ...filled(), title }).title).toBeUndefined()
    expect(validateGuided({ ...filled(), title: 'क'.repeat(500) }).title).toBeUndefined()
    expect(validateGuided({ ...filled(), title: 'क'.repeat(501) }).title).toMatch(/500 characters or fewer/)
  })

  it('orders errors as the form shows them', () => {
    expect(
      errorOrder(['attr.wash_care', 'mrp', 'category', 'extra.0.key', 'size_chart.rows.1.chest', 'title', 'attr.fabric_type', 'sku', 'composition.rows.0.percent', 'manufacturer.city']),
    ).toEqual(['title', 'sku', 'category', 'attr.fabric_type', 'composition.rows.0.percent', 'extra.0.key', 'size_chart.rows.1.chest', 'mrp', 'attr.wash_care', 'manufacturer.city'])
  })

  it('checks the new intake fields', () => {
    const e = validateGuided({ ...filled(), mrp: '999', sellingPrice: '1299', composition: [{ fibre: 'Cotton', percent: '60' }] })
    expect(e.selling_price).toMatch(/at or below the MRP/)
    expect(e['attr.fiber_composition']).toMatch(/add up to 60%/)
    expect(validateGuided({ ...filled(), mrp: '0' }).mrp).toBeDefined()
    expect(validateGuided({ ...filled(), styleNumber: 'S'.repeat(65) }).style_number).toBeDefined()
    expect(validateGuided({ ...filled(), ownManufacturer: true })['manufacturer.legal_name']).toBeDefined()
    expect(validateGuided({ ...filled(), ownManufacturer: false })['manufacturer.legal_name']).toBeUndefined()
  })

  it('sends every V1 input in the create body', () => {
    const v = {
      ...filled(),
      styleNumber: ' KS-101 ',
      mrp: '₹1,299',
      sellingPrice: '999.5',
      sizeChart: { unit: 'cm' as const, basis: 'body' as const, rows: [emptySizeRow(), { ...emptySizeRow('M'), chest: '96' }] },
      ownManufacturer: true,
      manufacturer: { legal_name: 'Asha Textiles', address_line1: '12 MG Road', address_line2: '', city: 'Jaipur', state_code: 'RJ', postal_code: '302001', gstin: '' },
    }
    expect(toProductCreate(v, { id: 'p-1', images: [{ storage_key: 't/p-1/images/i-1', slot: 'main' }] })).toEqual({
      sku: 'FSH-TEE-001',
      title: 'Relaxed Cotton Tee',
      category: 'tshirts',
      attributes: {},
      style_number: 'KS-101',
      mrp: '1299',
      selling_price: '999.5',
      size_chart: { unit: 'cm', basis: 'body', rows: [{ size: 'M', chest: 96 }] },
      manufacturer: { legal_name: 'Asha Textiles', address_line1: '12 MG Road', city: 'Jaipur', state_code: 'RJ', postal_code: '302001', country_code: 'IN' },
      id: 'p-1',
      image_uploads: [{ storage_key: 't/p-1/images/i-1', slot: 'main' }],
    })
    expect(toProductCreate(filled(), { id: 'p-1', images: [] }).id).toBeUndefined()
  })

  it('maps new-field 422s back onto the draft rows', () => {
    const v = { ...filled(), mrp: '999', sellingPrice: '1299', sizeChart: { unit: 'in' as const, basis: 'garment' as const, rows: [emptySizeRow(), emptySizeRow('S'), emptySizeRow('M')] } }
    const r = mapCreateErrors(
      {
        status: 422,
        type: 'VALIDATION_FAILED',
        details: [
          { loc: ['body', 'size_chart', 'rows', 1, 'chest'], msg: 'too big' },
          { loc: ['body', 'selling_price'], msg: 'invalid' },
          { loc: ['body', 'attributes', 'fiber_composition'], msg: 'sum' },
          { loc: ['body', 'image_uploads', 0], msg: 'not found' },
        ],
      },
      v,
    )
    expect(r.unmapped).toBe(false)
    expect(r.fields['size_chart.rows.2.chest']).toBe('too big')
    expect(r.fields.selling_price).toMatch(/at or below/)
    expect(r.fields['attr.fiber_composition']).toBe('sum')
    expect(r.fields.images).toBeDefined()
    expect(mapCreateErrors({ status: 422, type: 'VALIDATION_FAILED', details: [{ loc: ['body', 'manufacturer', 'city'], msg: 'x' }] }, v).unmapped).toBe(true)
    // The backend refuses a chart as a whole at `size_chart`: say what to check, in the size section.
    const whole = mapCreateErrors({ status: 422, type: 'VALIDATION_FAILED', details: [{ loc: ['body', 'size_chart'], msg: 'Invalid value.' }] }, v)
    expect(whole.fields.size_chart).toMatch(/at least one measurement/)
  })

  it('revives an old draft', () => {
    const v = reviveGuided({ sku: 'A', title: 'B', category: 'c', attrs: { fiber_composition: '60% Cotton, 40% Silk', fit: 'Slim' }, extra: [] })
    expect(v.composition).toEqual([{ fibre: 'Cotton', percent: '60' }, { fibre: 'Silk', percent: '40' }])
    expect(v.attrs).toEqual({ fit: 'Slim' })
    expect(v.sizeChart.rows).toEqual([])
    expect(v.ownManufacturer).toBe(false)
  })
})

describe('section marks (browser findings)', () => {
  const ctx = { brandManufacturer: true, hasMain: false, imageCount: 0 }
  it('size chart: done with valid rows, error mark when its errors show, dash when empty', () => {
    const valid = { ...filled(), sizeChart: { unit: 'in' as const, basis: 'garment' as const, rows: [{ ...emptySizeRow('M'), chest: '40' }] } }
    expect(sectionStates(valid, ctx).size).toEqual({ kind: 'done' })
    const bad = { ...filled(), sizeChart: { unit: 'in' as const, basis: 'garment' as const, rows: [{ ...emptySizeRow('M'), chest: '0' }] } }
    expect(sectionStates(bad, ctx, validateGuided(bad)).size).toEqual({ kind: 'error', count: 1 })
    // Errors not shown yet (not touched): no error mark, and not done.
    expect(sectionStates(bad, ctx, {}).size).toEqual({ kind: 'todo' })
    expect(sectionStates(filled(), ctx).size).toEqual({ kind: 'todo' })
  })
  it('price: error mark while its error shows, done when valid', () => {
    const bad = { ...filled(), mrp: '999', sellingPrice: '1299' }
    expect(sectionStates(bad, ctx, validateGuided(bad)).price).toEqual({ kind: 'error', count: 1 })
    expect(sectionStates({ ...filled(), mrp: '1299' }, ctx).price).toEqual({ kind: 'done' })
  })
  it('a composition row with a percent and no fibre is incomplete', () => {
    const v = { ...filled(), attrs: { fabric_type: 'Cotton' }, composition: [{ fibre: 'Cotton', percent: '95' }, { fibre: '', percent: '5' }] }
    expect(missingCritical(v, ctx)).toContain('Fabric composition')
    expect(sectionStates(v, ctx).fabric).not.toEqual({ kind: 'done' })
    expect(validateGuided(v)['composition.rows.1.fibre']).toBeDefined()
    expect(toProductCreate({ ...v, composition: [{ fibre: 'Cotton', percent: '100' }] }).attributes?.fiber_composition).toBe('100% Cotton')
  })
})

describe('guided barcode', () => {
  const EAN = '4006381333931'

  it('sends the barcode or the exemption, never both', () => {
    expect(toProductCreate({ ...filled(), barcode: { type: 'ean', value: ' 4006381 333931 ', none: false, exempt: false } }).product_identifier).toEqual({ type: 'ean', value: EAN })
    const exempt = toProductCreate({ ...filled(), barcode: { type: 'ean', value: EAN, none: true, exempt: true } })
    expect(exempt.identifier_exemption).toBe(true)
    expect(exempt.product_identifier).toBeUndefined()
    const blank = toProductCreate(filled())
    expect('product_identifier' in blank || 'identifier_exemption' in blank).toBe(false)
  })

  it('checks the barcode in the identity section', () => {
    const e = validateGuided({ ...filled(), barcode: { type: 'upc', value: EAN, none: false, exempt: false } })
    expect(e.barcode).toMatch(/A UPC has 12 digits/)
    expect(errorOrder(['category', 'barcode', 'sku'])).toEqual(['sku', 'barcode', 'category'])
  })

  it('keeps a draft saved before barcodes existed', () => {
    expect(reviveGuided({ sku: 'A' }).barcode).toEqual({ type: 'ean', value: '', none: false, exempt: false })
  })

  it('maps a refused barcode onto the field', () => {
    const v = { ...filled(), barcode: { type: 'ean' as const, value: EAN, none: false, exempt: false } }
    const r = mapCreateErrors({ status: 422, type: 'VALIDATION_FAILED', details: [{ loc: ['body', 'product_identifier', 'value'], msg: 'x' }] }, v)
    expect(r.fields.barcode).toMatch(/already has this barcode/)
    expect(r.unmapped).toBe(false)
  })
})

describe('SI12 tax and shipping', () => {
  it('sends HSN, country and package on create, and leaves them out when empty', () => {
    expect(toProductCreate(filled())).not.toHaveProperty('hsn_code')
    const v = { ...filled(), hsn: '6109', hsnSuggested: true, country: 'in', pkg: { length: '30', breadth: '25', height: '3', weight: '250' } }
    expect(validateGuided(v)).toEqual({})
    expect(toProductCreate(v)).toMatchObject({ hsn_code: '6109', country_of_origin: 'IN', package: { length_cm: 30, breadth_cm: 25, height_cm: 3, weight_g: 250 } })
  })

  it('files their errors under Tax and shipping', () => {
    const e = validateGuided({ ...filled(), hsn: '12', pkg: { length: '30', breadth: '', height: '', weight: '' } })
    expect(Object.keys(e).sort()).toEqual(['hsn_code', 'package'])
    expect(sectionStates({ ...filled(), hsn: '12' }, undefined, e).shipping).toEqual({ kind: 'error', count: 2 })
    const { fields } = mapCreateErrors({ status: 422, type: 'VALIDATION_FAILED', details: [{ loc: ['body', 'package', 'length_cm'], msg: 'm' }] }, filled())
    expect(fields).toEqual({ 'package.length': 'm' })
  })

  it('reads an older draft without them', () => {
    const v = reviveGuided({ sku: 'A', title: 'B' })
    expect(v).toMatchObject({ hsn: '', hsnSuggested: false, country: '', pkg: { length: '', breadth: '', height: '', weight: '' } })
  })
})
