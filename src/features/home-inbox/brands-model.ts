/**
 * Home's cross-brand overview (client feedback 11 Nov 2026, item 18; ADR-0032 light path): pure
 * model, unit tested. GET /home/brands counts each of the caller's brands inside that brand, so
 * every number here is that brand's own exact count; this file only words them.
 */
import type { Schema } from '@/api/types'

export type HomeBrands = Schema<'HomeBrandsOut'>
export type BrandSummary = Schema<'BrandSummary'>

/** The Home URL's brand scope (`/home?brands=all`); absent is the current brand. */
export type BrandScope = 'all' | undefined

/** The selector shows only for a person in 2+ brands; with one there is nothing to choose. */
export function showBrandScope(me: { memberships: readonly unknown[] } | undefined): boolean {
  return (me?.memberships.length ?? 0) >= 2
}

/** What each column counts, in one line (the info mark on the column). */
export const BRAND_DEFINITION = {
  live: 'Listings live or partly live on a marketplace, in this brand.',
  progress: 'Listings Kuinn or the marketplace is working on, in this brand. Nothing to do.',
  needsYou: 'What waits on you in this brand, for your role there: fixes, answers, approvals and listings to publish.',
  products: 'Products in this brand (styles and standalone products).',
} as const

export interface BrandRowView {
  tenantId: string
  name: string
  role: string
  current: boolean
  live: string
  progress: string
  needsYou: string
  needsYouCount: number
  products: string
}

const n = (x: number) => x.toLocaleString('en-IN')

export function brandRows(out: HomeBrands): BrandRowView[] {
  return out.brands.map((b) => ({
    tenantId: b.tenant_id,
    name: b.name,
    role: b.role,
    current: b.current,
    live: n(b.listings.live + b.listings.partly_live),
    progress: n(b.listings.in_progress),
    needsYou: n(b.needs_you),
    needsYouCount: b.needs_you,
    products: n(b.products),
  }))
}

/** "3 brands · 2 need you" over the overview. */
export function brandsSummary(out: HomeBrands): string {
  const waiting = out.brands.filter((b) => b.needs_you > 0).length
  const parts = [`${n(out.brands.length)} ${out.brands.length === 1 ? 'brand' : 'brands'}${out.more ? ' (the first 25)' : ''}`]
  parts.push(waiting ? `${n(waiting)} ${waiting === 1 ? 'needs' : 'need'} you` : 'nothing waits on you')
  return parts.join(' · ')
}
