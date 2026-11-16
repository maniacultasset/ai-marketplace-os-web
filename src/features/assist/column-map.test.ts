import { describe, expect, it } from 'vitest'
import { confirmBody, duplicatePositions, FIELD_CHOICES, fieldChoices, headerText, mappableHeaders, needsAnswer, unanswered, usedColumns, type ColumnMap } from './column-map'

const map: Pick<ColumnMap, 'mappings'> = {
  mappings: [
    { position: 1, header_shown: 'seller_sku', key: 'seller_sku', method: 'exact', confidence: 1, needs_review: false },
    { position: 2, header_shown: 'Product Title', key: 'product_name', method: 'alias', confidence: 1, needs_review: false },
    { position: 3, header_shown: 'categry', key: 'category', method: 'fuzzy', confidence: 0.86, needs_review: false },
    { position: 4, header_shown: 'colour shade', key: 'color_name', method: 'ai', confidence: 0.62, needs_review: true },
    { position: 5, header_shown: 'column 5', key: null, method: 'none', confidence: 0, needs_review: true },
  ],
}

describe('column map review', () => {
  it('asks for every match below 80%, and for every unmatched column', () => {
    expect(map.mappings.filter(needsAnswer).map((e) => e.position)).toEqual([4, 5])
    expect(unanswered(map, {}).map((e) => e.position)).toEqual([4, 5])
    expect(unanswered(map, { 4: 'color_name', 5: null }).length).toBe(0)
    // A confidence under 0.80 waits even when the server did not flag it.
    expect(needsAnswer({ ...map.mappings[2]!, confidence: 0.79 })).toBe(true)
  })

  it('finds two columns filling one field', () => {
    expect([...duplicatePositions(map, { 4: 'category' })].sort()).toEqual([3, 4])
    expect(duplicatePositions(map, { 4: 'color_name', 5: null }).size).toBe(0)
  })

  it('confirms every column by position, with the seller’s answers', () => {
    expect(confirmBody(map, { 4: 'color_name', 5: null })).toEqual({
      mappings: [
        { position: 1, key: 'seller_sku' },
        { position: 2, key: 'product_name' },
        { position: 3, key: 'category' },
        { position: 4, key: 'color_name' },
        { position: 5, key: null },
      ],
    })
  })

  it('sends only headers the backend accepts', () => {
    expect(mappableHeaders(['seller_sku', 'Product Title'])).toBe(true)
    expect(mappableHeaders([])).toBe(false)
    expect(mappableHeaders(['sku', ''])).toBe(false)
    expect(mappableHeaders(['SKU', ' sku '])).toBe(false)
    expect(mappableHeaders(['x'.repeat(121)])).toBe(false)
  })

  it('offers the stored template fields', () => {
    expect(FIELD_CHOICES).toContain('seller_sku')
    expect(FIELD_CHOICES).toContain('category')
    expect(new Set(FIELD_CHOICES).size).toBe(FIELD_CHOICES.length)
  })
  it('shows the seller’s own header when the file is at hand, else the API’s name (W4)', () => {
    const entry = map.mappings[4]!
    expect(headerText(entry, ['a', 'b', 'c', 'd', '\uFEFF Weight (g) '])).toBe('Weight (g)')
    expect(headerText(entry)).toBe('column 5')
    expect(headerText(entry, ['a', 'b'])).toBe('column 5')
  })
  it('counts the columns the import fills a field from (W1)', () => {
    expect(usedColumns(map)).toBe(4)
    expect(usedColumns(map, { 4: null, 5: 'fit' })).toBe(4)
    expect(usedColumns(map, { 4: null })).toBe(3)
  })
})

describe('column map targets with sheet photos (G2)', () => {
  it('offers the photo link columns only while their photos are downloaded', () => {
    expect(FIELD_CHOICES).not.toContain('main_image')
    expect(fieldChoices()).toEqual(FIELD_CHOICES)
    const on = fieldChoices({ sheetPhotos: true })
    expect(on).toContain('main_image')
    expect(on).toContain('additional_images')
    expect(on.indexOf('main_image')).toBe(on.indexOf('size_chart') + 1)
    expect(on.filter((k) => k !== 'main_image' && k !== 'additional_images')).toEqual([...FIELD_CHOICES])
  })
})
