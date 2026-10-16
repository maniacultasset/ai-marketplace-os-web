import { describe, expect, it } from 'vitest'
import { emptyGuided, mapCreateErrors, missingCritical, sectionStates, toProductCreate, validateGuided } from './guided-model'

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
})
