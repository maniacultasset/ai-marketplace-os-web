import { describe, expect, it } from 'vitest'
import { emptySizeRow } from '@/features/products/intake-model'
import { emptyGuided, errorOrder, mapCreateErrors, missingCritical, reviveGuided, sectionStates, toProductCreate, validateGuided } from './guided-model'

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
    expect(missingCritical({ ...filled(), attrs: { fabric_type: 'Jersey' } })).toEqual(['Fabric composition', 'MRP', 'Wash care', 'Iron care'])
    // No brand default and no own manufacturer: the manufacturer is missing too.
    const ctx = { brandManufacturer: false, hasMain: true, imageCount: 1 }
    expect(missingCritical(filled(), ctx)).toContain('Manufacturer')
    expect(missingCritical({ ...filled(), ownManufacturer: true }, ctx)).not.toContain('Manufacturer')
    expect(sectionStates(filled(), ctx).media).toEqual({ kind: 'done' })
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
    expect(validateGuided({ ...filled(), category: 'Kurtas' }).category).toBe('Use lowercase letters in the category: kurtas.')
    expect(validateGuided({ ...filled(), category: 'kurta sets' }).category).toBe('Use _ between words in the category: kurta_sets.')
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
