import { describe, expect, it } from 'vitest'
import {
  barcodeCreateFields,
  barcodeFromProduct,
  barcodePatchFields,
  barcodeProblem,
  barcodeServerMessage,
  emptyBarcode,
  fitsType,
  gtinValid,
  isBarcodeErrorKey,
  normalizeBarcode,
  reviveBarcode,
  styleExemption,
  type BarcodeDraft,
} from './barcode'

const EAN13 = '4006381333931'
const EAN8 = '96385074'
const UPC = '036000291452'
const GTIN14 = '10012345678902'

const draft = (p: Partial<BarcodeDraft> = {}): BarcodeDraft => ({ ...emptyBarcode(), ...p })

describe('gtinValid (backend core/identifiers.py)', () => {
  it('accepts GTIN-8, 12, 13 and 14 with a valid check digit', () => {
    for (const v of [EAN13, EAN8, UPC, GTIN14]) expect(gtinValid(v), v).toBe(true)
  })
  it('refuses a wrong check digit, other lengths and non-digits', () => {
    expect(gtinValid('4006381333932')).toBe(false)
    expect(gtinValid('400638133393')).toBe(false) // 12 digits, wrong check digit
    for (const v of ['1234567', '123456789', '12345678901', '123456789012345', '', '40063813339a1', '４００６３８１３３３９３１']) expect(gtinValid(v), v).toBe(false)
  })
})

describe('barcodeProblem', () => {
  it('is null for blank and for a valid value of the type', () => {
    expect(barcodeProblem('ean', '')).toBeNull()
    expect(barcodeProblem('ean', '  ')).toBeNull()
    expect(barcodeProblem('ean', EAN13)).toBeNull()
    expect(barcodeProblem('ean', EAN8)).toBeNull()
    expect(barcodeProblem('upc', UPC)).toBeNull()
    for (const v of [EAN8, UPC, EAN13, GTIN14]) expect(barcodeProblem('gtin', v), v).toBeNull()
  })
  it('drops the spaces and hyphens printed on packs', () => {
    expect(normalizeBarcode(' 4006381 333931 ')).toBe(EAN13)
    expect(normalizeBarcode('4-006381-333931')).toBe(EAN13)
    expect(barcodeProblem('ean', '4 006381 333931')).toBeNull()
  })
  it('wants digits only', () => {
    expect(barcodeProblem('ean', '40063813339a1')).toBe('Use digits only.')
  })
  it('checks the length for the type (upc 12, ean 8 or 13, gtin 8/12/13/14) and names the right type', () => {
    expect(fitsType('upc', EAN13)).toBe(false)
    expect(barcodeProblem('upc', EAN13)).toBe('A UPC has 12 digits. This has 13. Choose EAN instead.')
    expect(barcodeProblem('ean', UPC)).toBe('An EAN has 8 or 13 digits. This has 12. Choose UPC instead.')
    expect(barcodeProblem('ean', GTIN14)).toBe('An EAN has 8 or 13 digits. This has 14. Choose GTIN instead.')
    expect(barcodeProblem('gtin', '123456789')).toBe('A GTIN has 8, 12, 13 or 14 digits. This has 9.')
    expect(barcodeProblem('upc', '12345')).toBe('A UPC has 12 digits. This has 5.')
  })
  it('checks the last (check) digit', () => {
    expect(barcodeProblem('ean', '4006381333932')).toMatch(/last digit/)
  })
})

describe('reading a product', () => {
  it('reads a barcode, an exemption, or nothing', () => {
    expect(barcodeFromProduct({ product_identifier: { type: 'upc', value: UPC }, identifier_exemption: false })).toEqual({ type: 'upc', value: UPC, none: false, exempt: false })
    expect(barcodeFromProduct({ product_identifier: null, identifier_exemption: true })).toEqual({ type: 'ean', value: '', none: true, exempt: true })
    expect(barcodeFromProduct({ product_identifier: null, identifier_exemption: false })).toEqual(emptyBarcode())
  })
  it('revives an old or broken draft', () => {
    expect(reviveBarcode(undefined)).toEqual(emptyBarcode())
    expect(reviveBarcode({ type: 'isbn', value: 7, exempt: 'yes' })).toEqual(emptyBarcode())
    expect(reviveBarcode({ type: 'gtin', value: GTIN14, exempt: false })).toEqual({ type: 'gtin', value: GTIN14, none: false, exempt: false })
    // A draft saved before the exemption question: its exemption was "No barcode" too.
    expect(reviveBarcode({ type: 'ean', value: '', exempt: true })).toMatchObject({ none: true, exempt: true })
    expect(reviveBarcode({ type: 'ean', value: '', none: true })).toMatchObject({ none: true, exempt: false })
  })
})

describe('create body', () => {
  it('sends the barcode, or the exemption, never both', () => {
    expect(barcodeCreateFields(draft())).toEqual({})
    expect(barcodeCreateFields(draft({ value: ' 4006381 333931' }))).toEqual({ product_identifier: { type: 'ean', value: EAN13 } })
    expect(barcodeCreateFields(draft({ value: EAN13, exempt: true }))).toEqual({ identifier_exemption: true })
  })
  it('"No barcode" sends no exemption until the seller confirms one (Chrome pass B5)', () => {
    expect(barcodeCreateFields(draft({ none: true }))).toEqual({})
    // Digits typed before choosing "No barcode" are not sent.
    expect(barcodeCreateFields(draft({ none: true, value: EAN13 }))).toEqual({})
    expect(barcodeCreateFields(draft({ none: true, exempt: true }))).toEqual({ identifier_exemption: true })
    expect(barcodeCreateFields(draft({ none: true }), 'style')).toEqual({})
  })
  it('never sends a value for a style', () => {
    expect(barcodeCreateFields(draft({ value: EAN13 }), 'style')).toEqual({})
    expect(barcodeCreateFields(draft({ exempt: true }), 'style')).toEqual({ identifier_exemption: true })
  })
})

describe('patch body', () => {
  const none = draft()
  const ean = draft({ value: EAN13 })
  const exempt = draft({ exempt: true })

  it('is empty when nothing changed', () => {
    expect(barcodePatchFields(none, none)).toEqual({})
    expect(barcodePatchFields(ean, draft({ value: '4006 381 333931' }))).toEqual({})
    expect(barcodePatchFields(exempt, exempt)).toEqual({})
    // Changing only the type of an empty value changes nothing.
    expect(barcodePatchFields(none, draft({ type: 'upc' }))).toEqual({})
  })
  it('sets, changes and clears a barcode', () => {
    expect(barcodePatchFields(none, ean)).toEqual({ product_identifier: { type: 'ean', value: EAN13 } })
    expect(barcodePatchFields(ean, draft({ type: 'gtin', value: EAN13 }))).toEqual({ product_identifier: { type: 'gtin', value: EAN13 } })
    expect(barcodePatchFields(ean, none)).toEqual({ product_identifier: null })
  })
  it('moves between a barcode and the exemption with one field, never both', () => {
    expect(barcodePatchFields(ean, draft({ value: EAN13, exempt: true }))).toEqual({ identifier_exemption: true })
    expect(barcodePatchFields(exempt, ean)).toEqual({ product_identifier: { type: 'ean', value: EAN13 } })
    expect(barcodePatchFields(exempt, none)).toEqual({ identifier_exemption: false })
    for (const [a, b] of [
      [none, ean],
      [ean, exempt],
      [exempt, ean],
      [exempt, none],
      [none, exempt],
    ] as const) {
      const body = barcodePatchFields(a, b)
      expect('product_identifier' in body && 'identifier_exemption' in body).toBe(false)
    }
  })
  it('"No barcode" without an exemption clears what is stored and sets nothing', () => {
    const noneChosen = draft({ none: true })
    expect(barcodePatchFields(ean, noneChosen)).toEqual({ product_identifier: null })
    expect(barcodePatchFields(exempt, noneChosen)).toEqual({ identifier_exemption: false })
    expect(barcodePatchFields(none, noneChosen)).toEqual({})
    expect(barcodePatchFields(none, draft({ none: true, value: EAN13 }))).toEqual({})
    expect(barcodePatchFields(none, draft({ none: true, exempt: true }))).toEqual({ identifier_exemption: true })
  })
  it('on a style sends only the exemption, which reaches its variants', () => {
    expect(barcodePatchFields(none, { ...exempt, touched: true }, 'style')).toEqual({ identifier_exemption: true })
    expect(barcodePatchFields(exempt, { ...none, touched: true }, 'style')).toEqual({ identifier_exemption: false })
    expect(barcodePatchFields(none, ean, 'style')).toEqual({})
  })
  it('on a style sends the chosen value whenever the person set it, even if it matches what was read', () => {
    // One variant has a barcode, so the style reads not exempt; turning it on again must still send.
    expect(barcodePatchFields(exempt, { ...exempt, touched: true }, 'style')).toEqual({ identifier_exemption: true })
    expect(barcodePatchFields(none, { ...none, touched: true }, 'style')).toEqual({ identifier_exemption: false })
    expect(barcodePatchFields(none, exempt, 'style')).toEqual({})
  })
})

describe('styleExemption (from the variants)', () => {
  const v = (over: { product_identifier?: { type: 'ean'; value: string } | null; identifier_exemption?: boolean }) => ({
    product_identifier: null,
    identifier_exemption: false,
    ...over,
  })
  it('is on when every variant without a barcode is exempt', () => {
    expect(styleExemption([v({ identifier_exemption: true }), v({ product_identifier: { type: 'ean', value: EAN13 } })])).toEqual({
      exempt: true,
      exemptCount: 1,
      total: 2,
    })
  })
  it('is off when any variant without a barcode is not exempt, or none lacks one', () => {
    expect(styleExemption([v({ identifier_exemption: true }), v({})]).exempt).toBe(false)
    expect(styleExemption([v({ product_identifier: { type: 'ean', value: EAN13 } })]).exempt).toBe(false)
    expect(styleExemption([])).toEqual({ exempt: false, exemptCount: 0, total: 0 })
  })
  it('never counts a variant with a barcode as exempt', () => {
    expect(styleExemption([v({ product_identifier: { type: 'ean', value: EAN13 }, identifier_exemption: true }), v({})]).exemptCount).toBe(0)
  })
})

describe('server errors', () => {
  it('lands every identifier path on the barcode field', () => {
    for (const k of ['product_identifier', 'product_identifier.value', 'identifier_exemption']) expect(isBarcodeErrorKey(k), k).toBe(true)
    expect(isBarcodeErrorKey('sku')).toBe(false)
  })
  it('explains a style, a bad value and a barcode taken in this brand', () => {
    expect(barcodeServerMessage('FACT_LEVEL_INVALID', draft({ value: EAN13 }))).toMatch(/each variant/)
    expect(barcodeServerMessage('VALIDATION_FAILED', draft({ value: '4006381333932' }))).toMatch(/last digit/)
    expect(barcodeServerMessage('VALIDATION_FAILED', draft({ value: EAN13 }))).toMatch(/already has this barcode/)
  })
})
