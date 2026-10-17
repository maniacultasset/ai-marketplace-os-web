import { describe, expect, it } from 'vitest'
import { emptyGuided, errorOrder, mapCreateErrors, missingCritical, sectionStates, toProductCreate, validateGuided } from './guided-model'

const filled = () => ({ ...emptyGuided(), sku: 'FSH-TEE-001', title: 'Relaxed Cotton Tee', category: 'tshirts' })

describe('guided form', () => {
  it('validates identity and category like ProductCreate', () => {
    expect(validateGuided(emptyGuided())).toMatchObject({ sku: expect.any(String), title: expect.any(String), category: expect.any(String) })
    expect(validateGuided({ ...filled(), sku: 'has space' }).sku).toBeDefined()
    expect(validateGuided({ ...filled(), category: 'T-shirts' }).category).toBeDefined()
    expect(validateGuided(filled())).toEqual({})
  })

  it('sends only filled attributes, trimmed', () => {
    const v = { ...filled(), attrs: { fiber_composition: ' 95% cotton ', fit: '' }, extra: [{ key: 'occasion', value: 'Casual' }, { key: '', value: '' }] }
    expect(toProductCreate(v)).toEqual({
      sku: 'FSH-TEE-001',
      title: 'Relaxed Cotton Tee',
      category: 'tshirts',
      attributes: { fiber_composition: '95% cotton', occasion: 'Casual' },
    })
  })

  it('rejects an extra attribute that repeats a form field', () => {
    expect(validateGuided({ ...filled(), extra: [{ key: 'fit', value: 'x' }] })['extra.0.key']).toBeDefined()
  })

  it('reports completeness per section', () => {
    const s = sectionStates({ ...filled(), attrs: { fabric_type: 'Jersey' } })
    expect(s.identity).toEqual({ kind: 'done' })
    expect(s.attributes).toEqual({ kind: 'missing', count: 1 })
    expect(s.care).toEqual({ kind: 'missing', count: 2 })
    expect(missingCritical({ ...filled(), attrs: { fabric_type: 'Jersey' } })).toEqual(['Fabric composition', 'Wash care', 'Iron care'])
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
    expect(errorOrder(['attr.wash_care', 'category', 'extra.0.key', 'title', 'attr.fabric_type', 'sku'])).toEqual([
      'sku',
      'title',
      'category',
      'attr.fabric_type',
      'extra.0.key',
      'attr.wash_care',
    ])
  })
})
