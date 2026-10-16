/**
 * Pure catalog logic for the Products table (hi-fi p07) and product detail (p17).
 *
 * The API has no catalog read-model (LISTING-AGENT-ANALYSIS §4.1 `GET /catalog/products` is
 * missing), so the screen joins three real lists itself:
 *   GET /products        every product (styles, standalones and their variants)
 *   GET /listings        one listing per product x marketplace (styles and standalones only)
 *   GET /issues?status=open  open issues, each with its listing_id
 * Every number shown (counts, variants, issues) is computed from those responses, never invented.
 */
import type { Schema } from '@/api/types'
import type { ChipStatus } from '@/components/la/status-chip'
import { listingChip, type ChipView } from '@/lib/listing-chip'

export type Product = Schema<'ProductOut'>
export type Listing = Schema<'ListingOut'>
export type Issue = Schema<'IssueOut'>
export type Marketplace = Schema<'Marketplace'>

export const API_MARKETPLACES: readonly Marketplace[] = ['amazon', 'flipkart']

/** Overall status of a product, from its listings (one word per row, p07 "Overall"). */
export type Overall = 'live' | 'partly-live' | 'working' | 'needs-you' | 'error' | 'draft'

/** Segmented filter buckets. Every product falls in exactly one, so the counts sum to All. */
export type Bucket = 'live' | 'progress' | 'needs-you' | 'error' | 'draft'
export const BUCKETS: readonly { value: Bucket; label: string }[] = [
  { value: 'live', label: 'Live' },
  { value: 'progress', label: 'In progress' },
  { value: 'needs-you', label: 'Needs you' },
  { value: 'error', label: 'Error' },
  { value: 'draft', label: 'Draft' },
]

export const OVERALL_CHIP: Record<Overall, { status: ChipStatus; label: string }> = {
  live: { status: 'live', label: 'Live' },
  'partly-live': { status: 'partly-live', label: 'Partly live' },
  working: { status: 'working', label: 'Working' },
  'needs-you': { status: 'needs-you', label: 'Needs you' },
  error: { status: 'error', label: 'Error' },
  draft: { status: 'draft', label: 'Draft' },
}

export interface CatalogRow {
  product: Product
  /** Products whose parent_product_id is this product (loaded rows only). */
  variants: Product[]
  /** This product's listing per marketplace (at most one per pair, backend unique). */
  listings: Partial<Record<Marketplace, Listing>>
  /** Open issues across this product's listings. */
  openIssues: number
  overall: Overall
  bucket: Bucket
  /** Latest of product.updated_at and its listings' status_changed_at / updated_at. */
  activityAt: string
}

/**
 * Overall status, in priority order (hi-fi p07 rows):
 *  1. any listing in error (failed, or rejected by the marketplace)  → Error
 *  2. any live listing: every listing live → Live, else → Partly live
 *  3. any listing that needs a person (needs_review, blocked)        → Needs you
 *  4. any listing being worked on or ready (generating … publishing) → Working
 *  5. no listing, or only created / removed / inactive ones          → Draft
 */
export function overallStatus(listings: readonly Listing[]): Overall {
  if (listings.length === 0) return 'draft'
  const chips = listings.map((l) => listingChip(l).status)
  if (chips.includes('error')) return 'error'
  const live = chips.filter((c) => c === 'live' || c === 'partly-live').length
  if (live > 0) return live === chips.length && chips.every((c) => c === 'live') ? 'live' : 'partly-live'
  if (chips.some((c) => c === 'needs-you' || c === 'blocked')) return 'needs-you'
  if (chips.some((c) => c === 'working' || c === 'ready')) return 'working'
  return 'draft'
}

export function bucketOf(o: Overall): Bucket {
  switch (o) {
    case 'live':
    case 'partly-live':
      return 'live'
    case 'working':
      return 'progress'
    case 'needs-you':
      return 'needs-you'
    case 'error':
      return 'error'
    case 'draft':
      return 'draft'
  }
}

const later = (a: string, b: string) => (Date.parse(b) > Date.parse(a) ? b : a)

/**
 * Rows for the table: one per style or standalone product, newest first (the API order).
 * A variant whose parent is not among the loaded products still gets its own row, so nothing
 * loaded is ever hidden.
 */
export function buildCatalog(products: readonly Product[], listings: readonly Listing[], issues: readonly Issue[]): CatalogRow[] {
  const ids = new Set(products.map((p) => p.id))
  const variantsOf = new Map<string, Product[]>()
  for (const p of products) {
    if (p.parent_product_id && ids.has(p.parent_product_id)) {
      const list = variantsOf.get(p.parent_product_id) ?? []
      list.push(p)
      variantsOf.set(p.parent_product_id, list)
    }
  }
  const listingsOf = new Map<string, Listing[]>()
  for (const l of listings) {
    const list = listingsOf.get(l.product_id) ?? []
    list.push(l)
    listingsOf.set(l.product_id, list)
  }
  const issuesPerListing = new Map<string, number>()
  for (const i of issues) {
    if (i.status !== 'open') continue
    issuesPerListing.set(i.listing_id, (issuesPerListing.get(i.listing_id) ?? 0) + 1)
  }

  const rows: CatalogRow[] = []
  for (const p of products) {
    if (p.parent_product_id && ids.has(p.parent_product_id)) continue
    const own = listingsOf.get(p.id) ?? []
    const byMarketplace: Partial<Record<Marketplace, Listing>> = {}
    for (const l of own) {
      const prev = byMarketplace[l.marketplace]
      if (!prev || Date.parse(l.updated_at) > Date.parse(prev.updated_at)) byMarketplace[l.marketplace] = l
    }
    const kept = Object.values(byMarketplace)
    const overall = overallStatus(kept)
    let activityAt = p.updated_at
    for (const l of kept) activityAt = later(later(activityAt, l.status_changed_at), l.updated_at)
    rows.push({
      product: p,
      variants: variantsOf.get(p.id) ?? [],
      listings: byMarketplace,
      openIssues: kept.reduce((n, l) => n + (issuesPerListing.get(l.id) ?? 0), 0),
      overall,
      bucket: bucketOf(overall),
      activityAt,
    })
  }
  return rows
}

export function bucketCounts(rows: readonly CatalogRow[]): Record<Bucket | 'all', number> {
  const c: Record<Bucket | 'all', number> = { all: rows.length, live: 0, progress: 0, 'needs-you': 0, error: 0, draft: 0 }
  for (const r of rows) c[r.bucket]++
  return c
}

export interface CatalogFilter {
  q?: string
  bucket?: Bucket | 'all'
  category?: string | null
  /** Rows with a listing on this marketplace. */
  marketplace?: Marketplace | null
}

export function filterCatalog(rows: readonly CatalogRow[], f: CatalogFilter): CatalogRow[] {
  const q = f.q?.trim().toLowerCase() ?? ''
  return rows.filter((r) => {
    if (f.bucket && f.bucket !== 'all' && r.bucket !== f.bucket) return false
    if (f.category && r.product.category !== f.category) return false
    if (f.marketplace && !r.listings[f.marketplace]) return false
    if (!q) return true
    if (r.product.title.toLowerCase().includes(q) || r.product.sku.toLowerCase().includes(q)) return true
    return r.variants.some((v) => v.sku.toLowerCase().includes(q))
  })
}

export function categoriesOf(rows: readonly CatalogRow[]): string[] {
  return [...new Set(rows.map((r) => r.product.category))].sort()
}

/** "ethnic_wear_kurta_sets" → "Ethnic wear kurta sets". */
export function humanizeSlug(slug: string): string {
  const s = slug.replace(/[_-]+/g, ' ').trim()
  return s ? s[0]!.toUpperCase() + s.slice(1) : slug
}

/** Short listing reference shown under a marketplace cell (our listing id, 6 chars + "•"). */
export function shortId(id: string): string {
  return `${id.replace(/-/g, '').slice(0, 6).toUpperCase()}•`
}

/** The chip for one marketplace cell, or "not listed" when the product has no listing there. */
export function cellChip(l: Listing | undefined): ChipView {
  return l ? listingChip(l) : { status: 'not-listed', label: 'Not listed' }
}

/**
 * Variant matrix (p17 "Variant status", p10 matrix) from the variant products' attributes.
 *
 * What the API exposes: an imported variant child carries `attributes.size` (runner.py `_child`
 * writes it with set_attribute), but its colour goes only to `variant_attributes` and the
 * colourway, neither of which ProductOut returns (services/products.py `_view`: attributes are the
 * facts). So a colour is used only when a variant really has `attributes.color`; it is never
 * guessed from the SKU.
 *
 * The grid is drawn only when it is faithful: every variant has its own (colour, size) cell. If any
 * two variants would share a cell (for example Black S and Off-white S, both size "s" with no
 * colour), or a variant has neither attribute, there is no grid and every variant is listed in
 * `loose` instead, so none is ever hidden or overwritten.
 */
export interface VariantMatrix {
  /** Row labels. `null` is the single row of a family whose variants carry no colour. */
  colours: (string | null)[]
  sizes: string[]
  /** matrixKey(colour, size) → the variant. */
  cells: Map<string, Product>
  /** Variants listed one by one (all of them when no faithful grid exists). */
  loose: Product[]
}

export const attrText = (p: Product, key: string): string | null => {
  const v = p.attributes?.[key]
  return typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : null
}

export const matrixKey = (colour: string | null, size: string) => `${colour ?? ''}\u0000${size}`

export function variantMatrix(variants: readonly Product[]): VariantMatrix {
  const colours: (string | null)[] = []
  const sizes: string[] = []
  const cells = new Map<string, Product>()
  const none: VariantMatrix = { colours: [], sizes: [], cells: new Map(), loose: [...variants] }
  for (const v of variants) {
    const size = attrText(v, 'size')
    const colour = attrText(v, 'color')
    // A grid needs sizes as columns; a colour-only family is a plain list.
    if (!size) return none
    const key = matrixKey(colour, size)
    if (cells.has(key)) return none
    if (!colours.includes(colour)) colours.push(colour)
    if (!sizes.includes(size)) sizes.push(size)
    cells.set(key, v)
  }
  // Mixing variants with and without a colour would put the colourless ones in a row of their own
  // that does not exist in the family.
  if (colours.length > 1 && colours.includes(null)) return none
  return { colours, sizes, cells, loose: [] }
}
