import { describe, expect, it } from 'vitest'
import { FULL_HEADER } from './csv-template'
import { photoLinkStatus, photoLinkText, plainRowError, rowNotes, rowProblems, type PhotoLink } from './row-errors'

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
  it('reads the prod bulk test messages in plain words, never a column key (15 Nov)', () => {
    expect(plainRowError(e('DUPLICATE_SKU_IN_FILE', 'seller_sku repeats an earlier row'))).toBe('This SKU is already on an earlier row of the file. Give this row its own SKU.')
    expect(plainRowError(e('PATTERN_MISMATCH', 'package_weight_g must be whole grams'))).toBe('Package weight in grams must be a whole number, like 500, with no unit.')
    expect(plainRowError(e('VALUE_NOT_ALLOWED', 'package_weight_g must be 1 to 2000000 grams'))).toBe('Package weight (grams) must be 1 to 2000000 grams.')
    expect(plainRowError(e('VALUE_NOT_ALLOWED', 'fiber_composition must list fibres whose percents add up to 100'))).toBe('Fiber composition must list fibres whose percents add up to 100.')
    expect(plainRowError(e('VALUE_NOT_ALLOWED', 'tax_rate must be from 0 to 100'))).toBe('GST rate must be from 0 to 100.')
    const gst = 'tax_rate is not a GST rate (0, 0.1, 0.25, 1, 1.5, 3, 5, 6, 7.5, 12, 18, 28 or 40); it was not saved, so set the GST rate on the product'
    expect(plainRowError(e('VALUE_NOT_ALLOWED', gst, 'warning'))).toMatch(/^The GST rate is not one of the GST rates .* Set the GST rate on the product\.$/)
    const fibre = 'fiber_composition has no percents (60% cotton, 40% viscose); it was not saved, so add the fabric composition on the product'
    expect(plainRowError(e('VALUE_NOT_ALLOWED', fibre, 'warning'))).toBe('The fabric composition has no percents (like 60% cotton, 40% viscose), so it was not saved. Add it on the product.')
    expect(plainRowError(e('REQUIRED_FIELD_MISSING', 'no image URL; upload images in the product form', 'warning'))).toBe('No photo yet. Add photos on the product’s Media tab.')
  })
  it('keeps warnings apart as notes', () => {
    const errors = [e('REQUIRED_FIELD_MISSING', 'no image URL; upload images in the product form', 'warning'), e('PRICE_ABOVE_MRP', 'x')]
    expect(rowNotes(errors).map((n) => n.error_code)).toEqual(['REQUIRED_FIELD_MISSING'])
    expect(rowProblems(errors).map((n) => n.error_code)).toEqual(['PRICE_ABOVE_MRP'])
  })
  it('leaves warnings out of the row problems', () => {
    expect(rowProblems([e('REQUIRED_FIELD_MISSING', 'no image URL; upload images in the product form', 'warning'), e('PRICE_ABOVE_MRP', 'x')])).toHaveLength(1)
  })
  it('the All columns template takes whole grams', () => {
    expect(FULL_HEADER).toContain('package_weight_g')
    expect(FULL_HEADER).not.toContain('package_weight')
  })
})

const link = (over: Partial<PhotoLink>): PhotoLink => ({
  link_id: '00000000-0000-4000-8000-000000000901',
  position: 2,
  column: 'additional_images',
  status: 'failed',
  retryable: true,
  ...over,
})

describe('photo links in plain words (G2)', () => {
  it('prefixes Photo N and uses the server sentence as it comes, never the problem code', () => {
    const t = photoLinkText(link({ problem: 'not_found', http_status: 404, message: 'The link returned 404. Check the link is right and public.' }))
    expect(t).toBe('Photo 2: The link returned 404. Check the link is right and public.')
    expect(t).not.toMatch(/not_found/)
    expect(photoLinkText(link({ status: 'skipped', retryable: false, problem: 'removed_by_seller', message: 'You removed this photo earlier, so it was not downloaded again.' }))).toBe(
      'Photo 2: You removed this photo earlier, so it was not downloaded again.',
    )
  })

  it('says a waiting link is waiting, and what a saved one became', () => {
    expect(photoLinkText(link({ status: 'queued', retryable: false }))).toBe('Photo 2: waiting to download')
    expect(photoLinkText(link({ status: 'downloading', retryable: false }))).toBe('Photo 2: downloading')
    expect(photoLinkText(link({ position: 1, column: 'main_image', status: 'saved', view: 'front', retryable: false }))).toBe('Photo 1: Saved as Front')
    expect(photoLinkStatus(link({ status: 'saved', view: 'close_up' }))).toBe('Saved as Close-up')
    expect(photoLinkStatus(link({ status: 'saved', view: 'extra' }))).toBe('Saved as an extra photo')
    expect(photoLinkStatus(link({ status: 'saved', view: null, message: 'Saved, then removed from the product.' }))).toBe('Saved, then removed from the product.')
  })

  it('never shows a blank line for a failed link without a message', () => {
    expect(photoLinkText(link({ message: null }))).toBe('Photo 2: It could not be downloaded.')
  })

  it('reads the no-photo note as no photo link while photos are downloaded', () => {
    const w = e('REQUIRED_FIELD_MISSING', 'no image URL; upload images in the product form', 'warning')
    expect(plainRowError(w, { sheetPhotos: true })).toBe('No photo link in the file. Add photos on the product’s Media tab.')
    expect(plainRowError(w, { sheetPhotos: false })).toBe('No photo yet. Add photos on the product’s Media tab.')
  })
})
