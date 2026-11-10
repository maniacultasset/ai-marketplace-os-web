import { describe, expect, it } from 'vitest'
import { PHOTO_CHECK_POLL_MS, PHOTO_READING_POLL_MS, isReadingPhotos, photoReadDelay, soonest, startsPhotoRead } from './photo-reading'

const img = (slot: string, compliance_status: 'pending' | 'passed' | 'failed', role: string | null = null) =>
  ({ image_id: crypto.randomUUID(), slot, role, compliance_status, position: 0, status: 'ready', origin: 'seller' }) as never

describe('photo read on upload (V1.1)', () => {
  it('only a front, back or close-up photo starts a read', () => {
    expect(startsPhotoRead({ slot: 'main' })).toBe(true)
    expect(startsPhotoRead({ slot: 'secondary', role: 'back' })).toBe(true)
    expect(startsPhotoRead({ slot: 'secondary', role: 'close_up' })).toBe(true)
    expect(startsPhotoRead({ slot: 'secondary', role: null })).toBe(false)
    expect(startsPhotoRead({ slot: 'lifestyle' })).toBe(false)
    expect(startsPhotoRead({ slot: 'size_chart' })).toBe(false)
  })

  it('polls fast while reading, slower while such a photo is checked, else not at all', () => {
    expect(photoReadDelay({ photo_reading: true, parent_product_id: null, image_details: [] })).toBe(PHOTO_READING_POLL_MS)
    expect(photoReadDelay({ photo_reading: false, parent_product_id: null, image_details: [img('main', 'pending')] })).toBe(PHOTO_CHECK_POLL_MS)
    expect(photoReadDelay({ photo_reading: false, parent_product_id: null, image_details: [img('secondary', 'pending', 'back')] })).toBe(PHOTO_CHECK_POLL_MS)
    expect(photoReadDelay({ photo_reading: false, parent_product_id: null, image_details: [img('lifestyle', 'pending'), img('main', 'passed')] })).toBe(false)
    expect(photoReadDelay({ photo_reading: false, parent_product_id: 'style', image_details: [img('main', 'pending')] })).toBe(false)
    expect(photoReadDelay(undefined)).toBe(false)
    expect(isReadingPhotos({ photo_reading: true })).toBe(true)
    expect(isReadingPhotos(null)).toBe(false)
  })

  it('takes the sooner of two delays', () => {
    expect(soonest(false, false)).toBe(false)
    expect(soonest(5000, false)).toBe(5000)
    expect(soonest(false, 2000)).toBe(2000)
    expect(soonest(5000, 2000)).toBe(2000)
  })
})
