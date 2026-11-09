/**
 * SI14 quality numbers, pure part. `QualitySummary` (GET /analytics/quality, GET /admin/quality):
 * first-pass rate, blocked rate, edit rate at approval and model cost per generated listing. A rate
 * is null when nothing was generated or approved in the range, and shows as "No data", never as 0%.
 */
import type { Schema } from '@/api/types'

export type QualitySummary = Schema<'QualitySummary'>
export type QualityMarket = Schema<'QualityMarket'>
export type QualityTenant = Schema<'QualityTenant'>

export type QualityMetricId = 'first_pass_rate' | 'blocked_rate' | 'edit_rate' | 'cost_per_listing_usd'

export interface QualityMetric {
  id: QualityMetricId
  label: string
  kind: 'rate' | 'usd'
  /** Which way is better, said in words next to the number. */
  better: 'higher' | 'lower'
  help: string
}

export const QUALITY_METRICS: readonly QualityMetric[] = [
  {
    id: 'first_pass_rate',
    label: 'First-pass rate',
    kind: 'rate',
    better: 'higher',
    help: 'Approved listings that needed no correction and no edit, out of all approved listings.',
  },
  {
    id: 'blocked_rate',
    label: 'Blocked rate',
    kind: 'rate',
    better: 'lower',
    help: 'Listings that were blocked at least once, out of the listings generated.',
  },
  {
    id: 'edit_rate',
    label: 'Edited before approval',
    kind: 'rate',
    better: 'lower',
    help: 'Approved listings a person edited first, out of all approved listings.',
  },
  {
    id: 'cost_per_listing_usd',
    label: 'Cost per listing',
    kind: 'usd',
    better: 'lower',
    help: 'Model cost of generating each listing. Category and column suggestions are not included.',
  },
]

const usd2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const usd4 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 3, maximumFractionDigits: 4 })

/** USD with enough digits to be truthful for cents and fractions of a cent. */
export function formatUsd(v: number | null | undefined): string {
  if (v == null) return 'No data'
  if (v === 0) return usd2.format(0)
  return Math.abs(v) < 0.1 ? usd4.format(v) : usd2.format(v)
}

export function formatQualityRate(r: number | null | undefined): string {
  if (r == null) return 'No data'
  const pct = Math.min(1, Math.max(0, r)) * 100
  return pct === 0 || pct === 100 ? `${pct}%` : `${pct.toFixed(1)}%`
}

export function formatQuality(kind: QualityMetric['kind'], v: number | null | undefined): string {
  return kind === 'usd' ? formatUsd(v) : formatQualityRate(v)
}

export type QualityRow = Pick<QualitySummary, QualityMetricId>

export const qualityValue = (row: Partial<QualityRow>, id: QualityMetricId): number | null => row[id] ?? null

/** Nothing generated in the range: the section says so instead of showing dashes. */
export const isEmptyQuality = (q: Pick<QualitySummary, 'listings_generated'>) => q.listings_generated === 0

/** Edited fields, most edited first, with the share of the top one for the bar length. */
export function editedFieldBars(fields: QualitySummary['edited_fields']): { path: string; count: number; share: number }[] {
  const list = [...(fields ?? [])].filter((f) => f.count > 0).sort((a, b) => b.count - a.count || a.path.localeCompare(b.path))
  const top = list[0]?.count ?? 0
  return list.map((f) => ({ ...f, share: top ? f.count / top : 0 }))
}

/** "attributes.fabric_type" -> "Fabric type"; "title" -> "Title". */
export function fieldLabel(path: string): string {
  const last = path.split('.').filter(Boolean).at(-1) ?? path
  const words = last.replace(/[_-]+/g, ' ').trim()
  return words ? words[0]!.toUpperCase() + words.slice(1) : path
}

/** A short tenant reference for the platform view (ids only, never a name). */
export const shortTenant = (id: string) => id.slice(0, 8)
