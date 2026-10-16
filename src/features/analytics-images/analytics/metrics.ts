/**
 * Pure analytics logic for the dashboard: date ranges (inclusive UTC days, as the backend's
 * `resolve_range` reads them), trend buckets, rates from counts, deltas and formatting.
 * Backend reference: apps/api/app/services/analytics.py, apps/api/app/api/v1/schemas/analytics.py.
 */
import type { Schema } from '@/api/types'

export type AnalyticsSummary = Schema<'AnalyticsSummary'>
export type AnalyticsCounts = Schema<'AnalyticsCounts'>
export type MarketplaceBreakdown = Schema<'MarketplaceBreakdown'>

/** Range presets in days. The backend caps a range at 366 inclusive days. */
export const RANGE_PRESETS = [7, 30, 90, 365] as const
export type RangePreset = (typeof RANGE_PRESETS)[number]
export const isRangePreset = (v: unknown): v is RangePreset =>
  typeof v === 'number' && RANGE_PRESETS.some((p) => p === v)

export const DEFAULT_PRESET: RangePreset = 30
export const MAX_RANGE_DAYS = 366

export const PRESET_LABEL: Record<RangePreset, { short: string; long: string }> = {
  7: { short: '7D', long: 'the last 7 days' },
  30: { short: '30D', long: 'the last 30 days' },
  90: { short: '90D', long: 'the last 90 days' },
  365: { short: '12M', long: 'the last 12 months' },
}

/** Inclusive range of UTC days, as ISO `YYYY-MM-DD` strings. */
export interface DayRange {
  from: string
  to: string
}

const DAY_MS = 86_400_000

export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function parseDay(iso: string): number {
  return Date.parse(`${iso}T00:00:00Z`)
}

function addDays(iso: string, days: number): string {
  return isoDay(new Date(parseDay(iso) + days * DAY_MS))
}

/** Inclusive number of days in a range. */
export function rangeDays(r: DayRange): number {
  return Math.round((parseDay(r.to) - parseDay(r.from)) / DAY_MS) + 1
}

/** The `days` UTC days ending today (inclusive), like the backend's default window. */
export function presetRange(days: number, now: Date = new Date()): DayRange {
  const to = isoDay(now)
  return { from: addDays(to, -(days - 1)), to }
}

/** The range of equal length that ends the day before `r` starts. */
export function previousRange(r: DayRange): DayRange {
  const days = rangeDays(r)
  const to = addDays(r.from, -1)
  return { from: addDays(to, -(days - 1)), to }
}

/** How many trend buckets a range is split into (one request each, sent one at a time). */
export function bucketCount(days: number): number {
  if (days <= 14) return days
  if (days <= 31) return 6
  if (days <= 120) return 9
  return 12
}

/**
 * Splits an inclusive range into `count` contiguous, non-overlapping buckets that cover it
 * exactly; earlier buckets take the remainder days so the latest bucket is never longer.
 */
export function splitRange(r: DayRange, count: number): DayRange[] {
  const days = rangeDays(r)
  const n = Math.max(1, Math.min(count, days))
  const base = Math.floor(days / n)
  const extra = days % n
  const out: DayRange[] = []
  let start = r.from
  for (let i = 0; i < n; i++) {
    const len = base + (i < extra ? 1 : 0)
    const end = addDays(start, len - 1)
    out.push({ from: start, to: end })
    start = addDays(end, 1)
  }
  return out
}

/** A share in [0, 1] or null when its denominator is 0, as `services/analytics.rate`. */
export function rate(num: number, den: number): number | null {
  return den > 0 ? num / den : null
}

export type MetricId = 'generated' | 'approval' | 'validation' | 'publish'

export interface MetricDef {
  id: MetricId
  label: string
  kind: 'count' | 'rate'
  /** One line on what the number is computed from. */
  help: string
}

export const METRICS: readonly MetricDef[] = [
  { id: 'generated', label: 'Listings generated', kind: 'count', help: 'New listing versions generated in the period.' },
  { id: 'approval', label: 'Approval rate', kind: 'rate', help: 'Approvals out of all review decisions.' },
  { id: 'validation', label: 'First-pass validation', kind: 'rate', help: 'Listings that passed every rule on their first check.' },
  { id: 'publish', label: 'Publish success', kind: 'rate', help: 'Publish attempts the marketplace accepted.' },
]

type MetricSource = Pick<
  AnalyticsSummary,
  'listings_generated' | 'approval_rate' | 'validation_pass_rate' | 'publish_success_rate'
>

/** The value of one metric in a summary (or a marketplace breakdown). */
export function metricValue(s: MetricSource, id: MetricId): number | null {
  switch (id) {
    case 'generated':
      return s.listings_generated
    case 'approval':
      return s.approval_rate ?? null
    case 'validation':
      return s.validation_pass_rate ?? null
    case 'publish':
      return s.publish_success_rate ?? null
  }
}

/** The counts a metric's rate is computed from, for its "n of m" line. */
export function metricFraction(c: AnalyticsCounts | null | undefined, id: MetricId): { num: number; den: number } | null {
  if (!c) return null
  switch (id) {
    case 'generated':
      return null
    case 'approval':
      return { num: c.approvals, den: c.approvals + c.rejections }
    case 'validation':
      return { num: c.validation_first_pass_passed, den: c.validation_first_pass_total }
    case 'publish':
      return { num: c.publish_succeeded, den: c.publish_succeeded + c.publish_failed }
  }
}

/** True when nothing happened in the range: no listing generated and no decision, check or publish. */
export function isEmptySummary(s: AnalyticsSummary): boolean {
  if (s.listings_generated > 0) return false
  if (s.approval_rate != null || s.validation_pass_rate != null || s.publish_success_rate != null) return false
  const c = s.counts
  if (!c) return true
  return (
    c.listings_generated + c.approvals + c.rejections + c.validation_first_pass_total + c.publish_succeeded + c.publish_failed ===
    0
  )
}

export interface Delta {
  /** Signed change: a percentage for counts, percentage points for rates. */
  value: number
  direction: 'up' | 'down' | 'flat'
  label: string
}

/**
 * Change against the previous period. Counts compare as a percentage (null when the previous
 * count is 0, since any growth from 0 is not a percentage); rates as percentage points (null when
 * either side has nothing to rate).
 */
export function metricDelta(kind: MetricDef['kind'], current: number | null, previous: number | null): Delta | null {
  if (current == null || previous == null) return null
  if (kind === 'count') {
    if (previous === 0) return null
    const pct = ((current - previous) / previous) * 100
    const rounded = Math.round(pct)
    return {
      value: pct,
      direction: rounded > 0 ? 'up' : rounded < 0 ? 'down' : 'flat',
      label: `${rounded > 0 ? '+' : rounded < 0 ? '−' : ''}${Math.abs(rounded).toLocaleString('en-US')}%`,
    }
  }
  const pts = (current - previous) * 100
  const rounded = Math.round(pts * 10) / 10
  return {
    value: pts,
    direction: rounded > 0 ? 'up' : rounded < 0 ? 'down' : 'flat',
    label: `${rounded > 0 ? '+' : rounded < 0 ? '−' : ''}${Math.abs(rounded).toFixed(1)} pts`,
  }
}

const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })
const whole = new Intl.NumberFormat('en-US')

export function formatCount(n: number): string {
  return n >= 10_000 ? compact.format(n) : whole.format(n)
}

/** 0.8123 -> "81.2%", 1 -> "100%", null -> "—". */
export function formatRate(r: number | null | undefined): string {
  if (r == null) return '—'
  const pct = r * 100
  if (pct === 100 || pct === 0) return `${pct}%`
  return `${pct.toFixed(1)}%`
}

export function formatMetric(kind: MetricDef['kind'], v: number | null): string {
  if (v == null) return '—'
  return kind === 'count' ? formatCount(v) : formatRate(v)
}

const dayFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
const dayYearFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

export function formatDay(iso: string, withYear = false): string {
  return (withYear ? dayYearFmt : dayFmt).format(new Date(parseDay(iso)))
}

/** "Mar 3 – Apr 1, 2026" (one day: "Apr 1, 2026"). */
export function formatRange(r: DayRange): string {
  if (r.from === r.to) return formatDay(r.to, true)
  const sameYear = r.from.slice(0, 4) === r.to.slice(0, 4)
  return `${formatDay(r.from, !sameYear)} – ${formatDay(r.to, true)}`
}

/** Short x-axis label for a bucket: its first day. */
export function bucketLabel(r: DayRange): string {
  return formatDay(r.from)
}

/** Clean y-axis ticks from 0 to a rounded max (counts). At least [0, 1]. */
export function countTicks(max: number, target = 4): number[] {
  if (max <= 0) return [0, 1]
  const raw = max / target
  const pow = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? 10 * pow
  const s = Math.max(1, step)
  const top = Math.ceil(max / s) * s
  const ticks: number[] = []
  for (let v = 0; v <= top + 1e-9; v += s) ticks.push(Math.round(v * 100) / 100)
  return ticks
}

export const RATE_TICKS = [0, 0.25, 0.5, 0.75, 1] as const
