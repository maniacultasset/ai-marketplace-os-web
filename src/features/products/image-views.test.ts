import { describe, expect, it, vi } from 'vitest'
import { mainView, throttled, VIEW_ERROR_RETRY_MS, VIEW_REFRESH_LEAD_MS, VIEW_REFRESH_MIN_MS, viewRefreshDelay, viewsById } from './image-views'

const NOW = Date.parse('2026-11-09T10:00:00Z')
const at = (s: number) => new Date(NOW + s * 1000).toISOString()
const detail = (id: string, url: string | null, expires: string | null, slot: 'main' | 'secondary' = 'secondary') => ({
  image_id: id,
  slot,
  position: 0,
  status: 'checked',
  origin: 'seller' as const,
  fixes: [],
  compliance_status: 'passed' as const,
  view_url: url,
  view_expires_at: expires,
})

describe('viewRefreshDelay', () => {
  it('reads again a minute before the earliest link expires', () => {
    const p = { image_details: [detail('a', 'u1', at(570)), detail('b', 'u2', at(300))], thumbnail_url: 't', thumbnail_expires_at: at(570) }
    expect(viewRefreshDelay([p], NOW)).toBe(300_000 - VIEW_REFRESH_LEAD_MS)
  })

  it('covers every product of a list, and never polls faster than the floor', () => {
    const rows = [{ thumbnail_url: 't1', thumbnail_expires_at: at(570) }, { thumbnail_url: 't2', thumbnail_expires_at: at(10) }]
    expect(viewRefreshDelay(rows, NOW)).toBe(VIEW_REFRESH_MIN_MS)
  })

  it('does not poll when nothing holds a link', () => {
    expect(viewRefreshDelay([{ image_details: [detail('a', null, null)] }, undefined, { thumbnail_url: null }], NOW)).toBe(false)
  })
})

describe('views', () => {
  it('maps image ids to links and picks the main photo', () => {
    const p = { image_details: [detail('a', 'ua', at(1)), detail('m', 'um', at(1), 'main'), detail('x', null, null)] }
    expect([...viewsById(p)]).toEqual([
      ['a', 'ua'],
      ['m', 'um'],
    ])
    expect(mainView(p)).toBe('um')
    expect(mainView({ ...p, thumbnail_url: 'thumb' })).toBe('thumb')
    expect(mainView(undefined)).toBeUndefined()
  })
})

describe('throttled', () => {
  it('runs once per key within the retry window', () => {
    const run = vi.fn()
    expect(throttled('k-test', run, NOW)).toBe(true)
    expect(throttled('k-test', run, NOW + 1000)).toBe(false)
    expect(throttled('k-other', run, NOW + 1000)).toBe(true)
    expect(throttled('k-test', run, NOW + VIEW_ERROR_RETRY_MS)).toBe(true)
    expect(run).toHaveBeenCalledTimes(3)
  })
})
