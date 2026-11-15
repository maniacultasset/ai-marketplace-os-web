import { describe, expect, it } from 'vitest'
import { PHOTO_TOTALS_POLL_MS, photoTotalsDelay, photoTotalsText } from './sheet-photos'

describe('import photo totals (G2)', () => {
  it('reads like "40 saved · 2 failed · 8 downloading", leaving out the zero parts', () => {
    const t = { total: 0, saved: 0, failed: 0, skipped: 0, retryable: 0, waiting: 0 }
    expect(photoTotalsText({ ...t, total: 50, saved: 40, failed: 2, retryable: 2, waiting: 8 })).toBe('40 saved · 2 failed · 8 downloading')
    expect(photoTotalsText({ ...t, total: 3, saved: 3 })).toBe('3 saved')
    expect(photoTotalsText({ ...t, total: 1200, waiting: 1200 })).toBe('1,200 downloading')
    expect(photoTotalsText({ ...t, total: 6, saved: 1, failed: 2, skipped: 3, retryable: 2 })).toBe('1 saved · 2 failed · 3 skipped')
    expect(photoTotalsText(t)).toBe('No photos yet')
  })

  it('keeps reading the report every 5 s while photos download, and stops after', () => {
    expect(photoTotalsDelay({ photos: { total: 4, saved: 1, failed: 0, skipped: 0, retryable: 0, waiting: 3 } })).toBe(PHOTO_TOTALS_POLL_MS)
    expect(PHOTO_TOTALS_POLL_MS).toBe(5000)
    expect(photoTotalsDelay({ photos: { total: 4, saved: 3, failed: 1, skipped: 0, retryable: 1, waiting: 0 } })).toBe(false)
    expect(photoTotalsDelay({ photos: null })).toBe(false)
    expect(photoTotalsDelay(undefined)).toBe(false)
  })
})
