import { describe, expect, it } from 'vitest'
import { missingNeeds, missingSummary, needText, neededText, productFilled, type Requirements } from './needs'
import type { Product } from './api'

const req: Requirements = {
  category: 'tshirts',
  amazon: ['brand_name', 'color', 'country_of_origin', 'gender', 'identifier', 'manufacturer', 'mrp', 'selling_price'],
  flipkart: ['color', 'country_of_origin', 'hsn_code', 'manufacturer', 'mrp', 'package_dimensions', 'package_weight', 'product_dimensions', 'selling_price'],
}

describe('Needed chips', () => {
  it('names the marketplaces in plain words', () => {
    expect(neededText([])).toBeNull()
    expect(neededText(['flipkart'])).toBe('Flipkart needs this')
    expect(neededText(['amazon', 'flipkart'])).toBe('Amazon and Flipkart need this')
  })

  it('shows only empty fields, and only for the marketplaces ticked in Sell on', () => {
    const filled = { hsn_code: false, package_size: false, country_of_origin: false, identifier: false, mrp: true }
    const both = missingNeeds(req, ['amazon', 'flipkart'], filled)
    expect(both.map((n) => [n.field.id, n.text])).toEqual([
      ['identifier', 'Amazon needs this'],
      ['hsn_code', 'Flipkart needs this'],
      ['package_size', 'Flipkart needs this'],
      ['country_of_origin', 'Amazon and Flipkart need this'],
    ])
    expect(missingSummary(both)).toBe('4 missing for Amazon and Flipkart')
    const amazonOnly = missingNeeds(req, ['amazon'], filled)
    expect(amazonOnly.map((n) => n.field.id)).toEqual(['identifier', 'country_of_origin'])
    expect(needText(amazonOnly, 'country_of_origin')).toBe('Amazon needs this')
    expect(needText(amazonOnly, 'hsn_code')).toBeUndefined()
    expect(missingNeeds(req, [], filled)).toEqual([])
    expect(missingNeeds(undefined, ['amazon'], filled)).toEqual([])
    expect(missingSummary([])).toBeNull()
  })

  it('reads a saved product: a style holds no barcode and a variant takes colour from its style', () => {
    const p = {
      id: 'p',
      sku: 's',
      title: 't',
      category: 'tshirts',
      status: 'active',
      created_at: 'x',
      updated_at: 'x',
      brand_name_inherited: false, size_chart_read_enabled: false, category_suggest_enabled: false,
      identifier_exemption: false,
      attributes: { fabric_type: 'Cotton' },
      mrp: '999.00',
      package: { weight_g: 200 },
    } as Product
    const f = productFilled(p, { isVariant: false, isStyle: true })
    expect(f).toMatchObject({ identifier: true, fabric_type: true, color: false, mrp: true, selling_price: false, package_size: false, package_weight: true, hsn_code: false })
    expect(productFilled(p, { isVariant: true, isStyle: false }).color).toBe(true)
  })
})
