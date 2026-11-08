import { describe, expect, it } from 'vitest'
import { sourceLabel } from '@/components/la/source-badge'
import { chipFor, editingSource, fieldSource, toSource } from './field-sources'

describe('field sources (SI12)', () => {
  it('maps every backend kind to a chip with plain words', () => {
    const words = (['sheet', 'you', 'photo', 'confirmed', 'size_chart', 'brand'] as const).map((kind) => sourceLabel(toSource({ kind })))
    expect(words).toEqual(['From sheet', 'You', 'From photo, not confirmed', 'Confirmed', 'Size chart', 'Brand profile'])
    expect(sourceLabel({ kind: 'suggested' })).toBe('Suggested')
    expect(sourceLabel({ kind: 'needed', detail: 'Flipkart needs this' })).toBe('Flipkart needs this')
    expect(sourceLabel({ kind: 'needed' })).toBe('Needed')
  })

  it('reads a key or its aliases, and says nothing for a key it was not sent', () => {
    const p = { field_sources: { color: { kind: 'photo' as const, image_id: 'i', confidence: 0.9 }, size_measurements: { kind: 'size_chart' as const }, package_weight: { kind: 'sheet' as const } } }
    expect(fieldSource(p, 'color')).toEqual({ kind: 'photo', unconfirmed: true })
    expect(fieldSource(p, 'size_chart')).toEqual({ kind: 'size-chart' })
    expect(fieldSource(p, 'package')).toEqual({ kind: 'sheet' })
    expect(fieldSource(p, 'mrp')).toBeUndefined()
    expect(fieldSource({}, 'mrp')).toBeUndefined()
  })

  it('keeps the saved chip while the value is unchanged, and says You once it changes', () => {
    expect(editingSource({ kind: 'sheet' }, true, true)).toEqual({ kind: 'sheet' })
    expect(editingSource({ kind: 'sheet' }, false, true)).toEqual({ kind: 'you' })
    expect(editingSource(undefined, true, true)).toEqual({ kind: 'you' })
    expect(editingSource({ kind: 'sheet' }, true, false)).toBeUndefined()
  })

  it('puts a Needed chip on an empty field and marks it as needing input', () => {
    expect(chipFor(false, { needed: 'Flipkart needs this' })).toEqual({ source: { kind: 'needed', detail: 'Flipkart needs this' }, needsInput: true })
    expect(chipFor(true, { needed: 'Flipkart needs this' })).toEqual({ source: { kind: 'you' }, needsInput: false })
    expect(chipFor(true, { source: { kind: 'sheet' } })).toEqual({ source: { kind: 'sheet' }, needsInput: false })
    expect(chipFor(true, { source: null })).toEqual({ source: undefined, needsInput: false })
    expect(chipFor(false, {}, true)).toEqual({ source: undefined, needsInput: true })
  })
})
