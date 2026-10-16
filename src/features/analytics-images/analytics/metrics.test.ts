import { describe, expect, it } from 'vitest'
import {
  bucketCount,
  countTicks,
  formatRange,
  formatRate,
  isEmptySummary,
  isRangePreset,
  metricDelta,
  metricFraction,
  metricValue,
  presetRange,
  previousRange,
  rangeDays,
  splitRange,
  type AnalyticsSummary,
} from './metrics'

const counts = {
  listings_generated: 10,
  approvals: 6,
  rejections: 2,
  validation_first_pass_passed: 7,
  validation_first_pass_total: 9,
  publish_succeeded: 3,
  publish_failed: 1,
}

const summary = (over: Partial<AnalyticsSummary> = {}): AnalyticsSummary => ({
  from: '2026-09-13',
  to: '2026-10-12',
  listings_generated: 10,
  approval_rate: 0.75,
  validation_pass_rate: 0.7778,
  publish_success_rate: 0.75,
  counts,
  by_marketplace: [],
  ...over,
})

describe('ranges', () => {
  it('presetRange is inclusive and ends today (UTC), like resolve_range', () => {
    const r = presetRange(30, new Date('2026-10-12T23:30:00Z'))
    expect(r).toEqual({ from: '2026-09-13', to: '2026-10-12' })
    expect(rangeDays(r)).toBe(30)
    expect(presetRange(365, new Date('2026-10-12T00:00:00Z')).from).toBe('2025-10-13')
  })

  it('previousRange is the same length and ends the day before', () => {
    expect(previousRange({ from: '2026-10-06', to: '2026-10-12' })).toEqual({ from: '2026-09-29', to: '2026-10-05' })
    expect(previousRange({ from: '2026-03-01', to: '2026-03-01' })).toEqual({ from: '2026-02-28', to: '2026-02-28' })
  })

  it('splitRange covers the range exactly with no gaps or overlaps', () => {
    for (const days of [7, 30, 90, 365]) {
      const r = presetRange(days, new Date('2026-10-12T00:00:00Z'))
      const b = splitRange(r, bucketCount(days))
      expect(b[0]!.from).toBe(r.from)
      expect(b[b.length - 1]!.to).toBe(r.to)
      expect(b.reduce((n, x) => n + rangeDays(x), 0)).toBe(days)
      for (let i = 1; i < b.length; i++) expect(rangeDays({ from: b[i - 1]!.to, to: b[i]!.from })).toBe(2)
    }
  })

  it('bucketCount: daily for a week, at most 12 requests', () => {
    expect(bucketCount(7)).toBe(7)
    expect(bucketCount(30)).toBe(6)
    expect(bucketCount(90)).toBe(9)
    expect(bucketCount(365)).toBe(12)
  })

  it('isRangePreset accepts only the presets', () => {
    expect(isRangePreset(30)).toBe(true)
    expect(isRangePreset(31)).toBe(false)
    expect(isRangePreset('30')).toBe(false)
  })

  it('formatRange', () => {
    expect(formatRange({ from: '2026-09-13', to: '2026-10-12' })).toBe('Sep 13 – Oct 12, 2026')
    expect(formatRange({ from: '2025-10-13', to: '2026-10-12' })).toBe('Oct 13, 2025 – Oct 12, 2026')
    expect(formatRange({ from: '2026-10-12', to: '2026-10-12' })).toBe('Oct 12, 2026')
  })
})

describe('metrics', () => {
  it('reads values and the counts behind each rate', () => {
    const s = summary()
    expect(metricValue(s, 'generated')).toBe(10)
    expect(metricValue(s, 'approval')).toBe(0.75)
    expect(metricFraction(s.counts, 'approval')).toEqual({ num: 6, den: 8 })
    expect(metricFraction(s.counts, 'validation')).toEqual({ num: 7, den: 9 })
    expect(metricFraction(s.counts, 'publish')).toEqual({ num: 3, den: 4 })
    expect(metricFraction(s.counts, 'generated')).toBeNull()
    expect(metricValue(summary({ approval_rate: undefined }), 'approval')).toBeNull()
  })

  it('isEmptySummary: a fresh tenant has no counts and null rates', () => {
    const zero = { ...counts, listings_generated: 0, approvals: 0, rejections: 0, validation_first_pass_passed: 0, validation_first_pass_total: 0, publish_succeeded: 0, publish_failed: 0 }
    expect(
      isEmptySummary(summary({ listings_generated: 0, approval_rate: null, validation_pass_rate: null, publish_success_rate: null, counts: zero })),
    ).toBe(true)
    expect(isEmptySummary(summary({ listings_generated: 0, approval_rate: null, validation_pass_rate: null, publish_success_rate: null, counts: null }))).toBe(true)
    expect(isEmptySummary(summary())).toBe(false)
    // Decisions in range on listings generated earlier still count as activity.
    expect(isEmptySummary(summary({ listings_generated: 0, validation_pass_rate: null, publish_success_rate: null }))).toBe(false)
  })

  it('metricDelta: percent for counts, points for rates, null without a base', () => {
    expect(metricDelta('count', 15, 10)).toMatchObject({ direction: 'up', label: '+50%' })
    expect(metricDelta('count', 5, 10)).toMatchObject({ direction: 'down', label: '−50%' })
    expect(metricDelta('count', 5, 0)).toBeNull()
    expect(metricDelta('rate', 0.8, 0.75)).toMatchObject({ direction: 'up', label: '+5.0 pts' })
    expect(metricDelta('rate', 0.75, 0.75)).toMatchObject({ direction: 'flat', label: '0.0 pts' })
    expect(metricDelta('rate', null, 0.5)).toBeNull()
  })

  it('formatRate', () => {
    expect(formatRate(0.7778)).toBe('77.8%')
    expect(formatRate(1)).toBe('100%')
    expect(formatRate(0)).toBe('0%')
    expect(formatRate(null)).toBe('—')
  })

  it('countTicks gives clean steps from 0', () => {
    expect(countTicks(0)).toEqual([0, 1])
    expect(countTicks(7)).toEqual([0, 2, 4, 6, 8])
    expect(countTicks(1234)).toEqual([0, 500, 1000, 1500])
    expect(countTicks(3)).toEqual([0, 1, 2, 3])
  })
})
