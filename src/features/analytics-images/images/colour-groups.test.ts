import { describe, expect, it } from 'vitest'
import { ALL_COLOURS, colourGroups, colourHasMain, coloursWithoutPhotos, type ColourSource } from './colour-groups'
import { uploadForm } from './upload'

const T = '11111111-1111-4111-8111-111111111111'
const P = '22222222-2222-4222-8222-222222222222'
const id = (n: number) => `33333333-3333-4333-8333-33333333333${n}`
const key = (n: number) => `${T}/${P}/images/${id(n)}`
const BLACK = '44444444-4444-4444-8444-444444444441'
const WHITE = '44444444-4444-4444-8444-444444444442'

const product = (over: Partial<ColourSource> = {}): ColourSource => ({
  images: [key(1), key(2), key(3)],
  image_details: [
    { image_id: id(1), slot: 'main', position: 0, status: 'ready', origin: 'seller' as const, compliance_status: 'passed' },
    { image_id: id(2), slot: 'main', position: 0, status: 'ready', origin: 'seller' as const, compliance_status: 'passed', colourway_id: BLACK },
    { image_id: id(3), slot: 'secondary', position: 1, status: 'ready', origin: 'seller' as const, compliance_status: 'pending', colourway_id: BLACK },
  ],
  colourways: [
    { id: BLACK, colour: 'Black', colour_sku: 'BLK' },
    { id: WHITE, colour: 'White', colour_sku: 'WHT' },
  ],
  ...over,
})

describe('colourGroups', () => {
  it('puts every-colour images first, then each colour in the style order', () => {
    const g = colourGroups(product())
    expect(g.map((x) => [x.key, x.label, x.keys.length, x.hasMain])).toEqual([
      [ALL_COLOURS, 'All colours', 1, true],
      [BLACK, 'Black', 2, true],
      [WHITE, 'White', 0, false],
    ])
  })

  it('keeps a product with no colourways as one group', () => {
    const g = colourGroups(product({ colourways: [] }))
    expect(g).toHaveLength(2)
    expect(g[1]).toMatchObject({ label: 'Other colour', keys: [key(2), key(3)] })
  })

  it('treats an image with no detail as every colour', () => {
    const g = colourGroups({ images: [key(1)], colourways: [] })
    expect(g).toEqual([{ key: ALL_COLOURS, colourwayId: null, label: 'All colours', keys: [key(1)], hasMain: false }])
  })

  it('knows which colour already has a main and which have no photos', () => {
    expect(colourHasMain(product(), BLACK)).toBe(true)
    expect(colourHasMain(product(), WHITE)).toBe(false)
    expect(colourHasMain(product(), null)).toBe(true)
    expect(coloursWithoutPhotos(product()).map((x) => x.label)).toEqual(['White'])
  })
})

describe('uploadForm', () => {
  it('sends colourway_id only when a colour is picked', () => {
    const withColour = uploadForm({ product_id: P, slot: 'main', colourway_id: BLACK, storage_key: key(1) })
    expect(withColour.get('colourway_id')).toBe(BLACK)
    expect(withColour.get('storage_key')).toBe(key(1))
    expect(withColour.has('file')).toBe(false)
    const plain = uploadForm({ product_id: P, slot: 'secondary', colourway_id: null }, new File(['x'], 'a.jpg', { type: 'image/jpeg' }))
    expect(plain.has('colourway_id')).toBe(false)
    expect(plain.get('file')).toBeInstanceOf(File)
  })
})
