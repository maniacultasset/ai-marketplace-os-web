import { describe, expect, it } from 'vitest'
import { FULL_HEADER } from './csv-template'
import { plainRowError, rowProblems } from './row-errors'

const e = (error_code: string, message: string, severity = 'error') => ({ error_code, message, severity })

describe('import row errors in plain words', () => {
  it('rewrites the validator text the QA pass found', () => {
    expect(plainRowError(e('PRICE_ABOVE_MRP', 'selling_price is above mrp'))).toBe('Selling price is above the MRP.')
    expect(plainRowError(e('PATTERN_MISMATCH', 'country_of_origin must be an ISO alpha-2 code'))).toBe('Country of origin: use a two-letter code like IN.')
    expect(plainRowError(e('IDENTIFIER_INVALID', 'product_identifier must be 8, 12, 13 or 14 digits'))).toBe('Barcode must be 8, 12, 13 or 14 digits.')
    expect(plainRowError(e('CROSS_FIELD_MISMATCH', 'a family needs size_name or color_name on every child'))).toBe('Each size or colour in a style needs a size or colour name.')
    expect(plainRowError(e('CROSS_FIELD_MISMATCH', 'product_name differs from the rest of its parent_style_id family'))).toBe('Product name must match the rest of its style.')
  })
  it('names any other column in words, never a raw key', () => {
    expect(plainRowError(e('PATTERN_MISMATCH', 'hsn_code must be 4, 6 or 8 digits'))).toBe('Hsn code must be 4, 6 or 8 digits.'.replace('Hsn', 'HSN'))
    expect(plainRowError(e('REQUIRED_FIELD_MISSING', 'seller_sku is required'))).toBe('SKU is required.')
  })
  it('leaves warnings out of the row problems', () => {
    expect(rowProblems([e('REQUIRED_FIELD_MISSING', 'no image URL; upload images in the product form', 'warning'), e('PRICE_ABOVE_MRP', 'x')])).toHaveLength(1)
  })
  it('the All columns template takes whole grams', () => {
    expect(FULL_HEADER).toContain('package_weight_g')
    expect(FULL_HEADER).not.toContain('package_weight')
  })
})
