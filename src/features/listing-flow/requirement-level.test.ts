/**
 * Client Chrome pass 1 (12 Nov), B4 and B5.
 *
 * B4: the review's Attributes card said "Fit is required for this category" for a recommended
 * attribute, while the findings card said "not needed for approval" and the mapping page said
 * "No rule". The level is the backend's (`is_recommendation`): the card text, the mapping tag and
 * the approval gate all read it.
 *
 * B5: the Identity gate said "Not checked yet. No rule covers this yet" although the adapter
 * preview checks every sellable item's barcode or GTIN exemption.
 */
import { describe, expect, it } from 'vitest'
import { sellerFinding } from './format'
import { gateCounts, previewIdentity, rollUpGates, type ErrorItem } from './gates'
import { mappingRows } from './mapping'

const recommended = (key: string): ErrorItem => ({
  auto_fixable: false,
  error_code: 'MISSING_ATTRIBUTE',
  field: `attributes.${key}`,
  message: `Recommended attribute ${key} is missing`,
  suggestion: 'Add it on the product if you know it; shoppers use it to search and filter. Never guess it.',
  retryable: false,
  severity: 'warning',
  source: 'rules_engine',
  rule_id: null,
})

const templateRequired = (key: string): ErrorItem => ({ ...recommended(key), severity: 'error', message: `Required attribute ${key} is missing`, suggestion: null })

describe('B4: one requirement level for an attribute', () => {
  it('the card text never calls a recommended attribute required', () => {
    const s = sellerFinding(recommended('kurta_type'))
    expect(s.message).toBe('Kurta type is recommended for this category. Not needed for approval.')
    expect(s.message).not.toMatch(/required/)
    expect(s.action).toBe('Add kurta type on the product page if you know it.')
  })

  it('a required one still says required', () => {
    expect(sellerFinding(templateRequired('kurta_type')).message).toBe('Kurta type is required for this category.')
  })

  it('the mapping page tags template levels instead of "No rule"', () => {
    const rows = mappingRows({
      attributes: { color: 'Blue' },
      payload: undefined,
      rules: [],
      findings: [recommended('fit'), recommended('pattern'), templateRequired('neckline')],
      checked: true,
    })
    const tag = Object.fromEntries(rows.map((r) => [r.key, r.rule]))
    expect(tag).toEqual({ fit: 'Recommended', pattern: 'Recommended', neckline: 'Required', color: 'No rule' })
  })

  it('the approval gate does not count recommended attributes as blockers', () => {
    const listing = { status: 'needs_review', status_reason: null, marketplace_state: 'not_submitted', current_version_id: 'v1' } as const
    const gates = rollUpGates({
      listing,
      validation: null,
      rules: [],
      preview: { errors: [recommended('fit'), recommended('kurta_type'), recommended('pattern')], productType: 'KURTA' },
    })
    const attributes = gates.find((g) => g.id === 'attributes')!
    expect(attributes.state).toBe('warning')
    expect(attributes.note).toBe('3 recommended to add')
    expect(gateCounts(gates)).toMatchObject({ blocked: 0, warning: 0, recommended: 3 })
  })
})

const item = (role: 'standalone' | 'parent' | 'child', payload: Record<string, unknown>) => ({ item_role: role, payload })
const barcode = { externally_assigned_product_identifier: [{ type: 'ean', value: '4006381333931', marketplace_id: 'A21TJRUUN4KGV' }] }
const exemption = { supplier_declared_has_product_identifier_exemption: [{ value: true, marketplace_id: 'A21TJRUUN4KGV' }] }

describe('B5: the Identity gate reads the preview identifier check', () => {
  const listing = { status: 'needs_review', status_reason: null, marketplace_state: 'not_submitted', current_version_id: 'v1' } as const
  const identity = (preview: Parameters<typeof rollUpGates>[0]['preview']) => rollUpGates({ listing, validation: null, rules: [], preview }).find((g) => g.id === 'identity')!

  it('counts sellable items only', () => {
    expect(previewIdentity([item('parent', {}), item('child', barcode), item('child', exemption)])).toEqual({ sellable: 2, barcodes: 1, exempt: 1 })
    expect(previewIdentity([item('parent', {})])).toBeNull()
    expect(previewIdentity(undefined)).toBeNull()
  })

  it('passes with a barcode', () => {
    const g = identity({ errors: [], productType: 'KURTA', identity: previewIdentity([item('standalone', barcode)]) })
    expect(g).toMatchObject({ state: 'passed', note: 'Has a barcode.' })
  })

  it('passes with a confirmed exemption, and says so', () => {
    const g = identity({ errors: [], productType: 'KURTA', identity: previewIdentity([item('standalone', exemption)]) })
    expect(g).toMatchObject({ state: 'passed', note: 'No barcode: GTIN exemption confirmed. It is sent with the listing.' })
  })

  it('blocks with no barcode and no exemption (IDENTIFIER_MISSING from the preview)', () => {
    const missing: ErrorItem = {
      auto_fixable: false,
      error_code: 'IDENTIFIER_MISSING',
      error_class: 'identifier_error',
      field: 'facts.identifier',
      message: 'Amazon needs a barcode (EAN, UPC or GTIN) for KTEST-1, or mark it GTIN-exempt if Amazon approved an exemption for your brand.',
      retryable: false,
      severity: 'error',
      source: 'amazon_adapter',
    }
    const g = identity({ errors: [missing], productType: 'KURTA', identity: previewIdentity([item('standalone', {})]) })
    expect(g.state).toBe('blocked')
    expect(g.findings).toEqual([missing])
  })

  it('stays unchecked when an item has neither and nothing was refused (a live listing)', () => {
    const g = identity({ errors: [], productType: 'KURTA', identity: previewIdentity([item('standalone', {})]) })
    expect(g.state).toBe('unchecked')
  })

  it('reads the identifiers where the backend puts them: under the payload\'s `attributes`', () => {
    // adapters/amazon/mapping.py item_payload: {productType, requirements, attributes: {...}}
    const wrap = (attributes: Record<string, unknown>) => ({ productType: 'KURTA', requirements: 'LISTING', attributes })
    expect(previewIdentity([item('parent', wrap({})), item('child', wrap(barcode)), item('child', wrap(exemption))])).toEqual({ sellable: 2, barcodes: 1, exempt: 1 })
    const g = identity({ errors: [], productType: 'KURTA', identity: previewIdentity([item('standalone', wrap(exemption))]) })
    expect(g).toMatchObject({ state: 'passed', note: 'No barcode: GTIN exemption confirmed. It is sent with the listing.' })
  })

  it('stays unchecked with no mapped product type', () => {
    expect(identity({ errors: [], productType: null, identity: previewIdentity([item('standalone', barcode)]) }).state).toBe('unchecked')
  })
})
