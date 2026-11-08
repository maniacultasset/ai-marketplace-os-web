import { describe, expect, it } from 'vitest'
import { detailIdsToRead, NEEDS_PHOTOS_DETAIL_CAP, needsPhotos } from './needs-photos'

const img = (slot: 'main' | 'secondary') => ({ image_id: `i-${slot}`, slot, position: 0, status: 'ready', origin: 'seller' as const, compliance_status: 'passed' as const })

describe('needsPhotos', () => {
  const none = { id: 'a', images: [] }
  const withMain = { id: 'b', images: ['k1'] }
  const onlySecondary = { id: 'c', images: ['k2'] }
  const loading = { id: 'd', images: ['k3'] }

  it('lists products with no photos and those whose photos have no main', () => {
    const details = new Map([
      ['b', { image_details: [img('main')] }],
      ['c', { image_details: [img('secondary')] }],
    ])
    const r = needsPhotos([none, withMain, onlySecondary, loading], details)
    expect(r.missing.map((p) => p.id)).toEqual(['a', 'c'])
    expect(r.unknown).toBe(1)
  })

  it('reads details only for products with images, up to the cap', () => {
    const many = Array.from({ length: NEEDS_PHOTOS_DETAIL_CAP + 5 }, (_, i) => ({ id: `p${i}`, images: ['k'] }))
    expect(detailIdsToRead([none, ...many])).toHaveLength(NEEDS_PHOTOS_DETAIL_CAP)
    expect(detailIdsToRead([none])).toEqual([])
  })
})
