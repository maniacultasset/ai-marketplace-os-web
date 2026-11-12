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
import { categoryLabel } from '@/features/products/categories'
import { isApprovedPaused, listingChip, needsYourInfo, type ChipContext, type ChipView } from '@/lib/listing-chip'
import { draftOpen } from '@/features/marketplaces/meta'

export type Product = Schema<'ProductOut'>
export type Listing = Schema<'ListingOut'>
export type Issue = Schema<'IssueOut'>
export type Marketplace = Schema<'Marketplace'>

export const API_MARKETPLACES: readonly Marketplace[] = ['amazon', 'flipkart']

/**
 * The first marketplace this product has no listing on that a draft can start for now (Flipkart
 * only once it is connected, marketplaces/meta `draftOpen`), or null.
 */
export function firstListable(listings: Partial<Record<Marketplace, unknown>>, connected: readonly Marketplace[] | null): Marketplace | null {
  return API_MARKETPLACES.find((m) => !listings[m] && draftOpen(m, connected)) ?? null
}

/** Overall status of a product, from its listings (one word per row, p07 "Overall"). */
export type Overall = 'live' | 'partly-live' | 'ready' | 'ready-to-list' | 'paused' | 'working' | 'needs-you' | 'error' | 'draft'

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
  ready: { status: 'ready', label: 'Awaiting approval' },
  'ready-to-list': { status: 'ready', label: 'Ready to list' },
  // Approved on Amazon while Amazon publishing is switched off: nobody can send it, so nothing waits on a person.
  paused: { status: 'paused', label: 'Publishing paused' },
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
 *  3. any listing that needs_review or is blocked                    → Needs you
 *     (a listing the server marks `needs_you`, with open blocking issues, is Needs you here even
 *     when its status is validated)
 *  4. any listing validated (waiting for a person to approve)        → Awaiting approval;
 *     else any listing approved (waiting for a person to list it)     → Ready to list.
 *     Both count in the Needs-you bucket (a person acts next, nothing is running)
 *     While Amazon publishing is switched off an approved Amazon listing is not "ready to list".
 *  5. any listing generating, publishing or processing at the marketplace → Working
 *  6. any approved Amazon listing while Amazon publishing is paused       → Publishing paused
 *  7. otherwise (no listing, or only created / removed / inactive ones)   → Draft
 */
export function overallStatus(listings: readonly Listing[], ctx?: ChipContext): Overall {
  if (listings.length === 0) return 'draft'
  const chips = listings.map((l) => listingChip(l, ctx).status)
  if (chips.includes('error')) return 'error'
  const live = chips.filter((c) => c === 'live' || c === 'partly-live').length
  if (live > 0) return live === chips.length && chips.every((c) => c === 'live') ? 'live' : 'partly-live'
  if (chips.some((c) => c === 'needs-you' || c === 'blocked')) return 'needs-you'
  if (listings.some((l) => l.status === 'validated')) return 'ready'
  if (chips.includes('ready')) return 'ready-to-list'
  if (chips.includes('working')) return 'working'
  if (chips.includes('paused')) return 'paused'
  return 'draft'
}

/**
 * One listing's bucket, exactly as the backend counts it for Home (`app.services.home.listing_bucket`,
 * the same order). Home's tiles count listings in these buckets; the Products `?listing=` filter
 * shows the products that own them, so a tile and the list it opens always agree.
 */
export type ListingBucket = 'live' | 'partly_live' | 'problem' | 'in_progress' | 'ready_to_approve' | 'ready_to_publish' | 'inactive' | 'draft'

export function listingBucket(l: Pick<Listing, 'status' | 'marketplace_state'> & Partial<Pick<Listing, 'display_state' | 'needs_you_count'>>): ListingBucket {
  const state = l.marketplace_state
  if (state === 'live') return 'live'
  if (state === 'partially_live') return 'partly_live'
  if (state === 'rejected') return 'problem'
  // validated / needs_review / blocked with an open blocking issue on the current version
  if (needsYourInfo(l)) return 'problem'
  if (l.status === 'generating' || l.status === 'publishing') return 'in_progress'
  if (l.status === 'validated' || l.status === 'needs_review') return 'ready_to_approve'
  if (l.status === 'approved') return 'ready_to_publish'
  if (l.status === 'blocked' || l.status === 'failed') return 'problem'
  if (l.status === 'published') return state === 'inactive' || state === 'removed' ? 'inactive' : 'in_progress'
  return 'draft'
}

/** The listing filters Home links to (`/products?listing=`). `live` takes partly live too, as the tile does. */
export type ListingFilter = 'live' | 'in_progress' | 'problem' | 'ready_to_approve' | 'ready_to_publish'
export const LISTING_FILTERS: Record<ListingFilter, string> = {
  live: 'live or partly live',
  in_progress: 'in progress',
  problem: 'stopped',
  ready_to_approve: 'ready to approve',
  ready_to_publish: 'ready to publish',
}

/**
 * The listing is in the filter's bucket. `ready_to_publish` leaves out an approved Amazon listing
 * while Amazon publishing is paused, as Home's "to publish" count does.
 */
export function listingMatches(l: Listing, f: ListingFilter, ctx?: ChipContext): boolean {
  const b = listingBucket(l)
  if (f === 'live') return b === 'live' || b === 'partly_live'
  if (f === 'ready_to_publish') return b === 'ready_to_publish' && !isApprovedPaused(l, ctx)
  return b === f
}

export function bucketOf(o: Overall): Bucket {
  switch (o) {
    case 'live':
    case 'partly-live':
      return 'live'
    case 'working':
    case 'paused':
      return 'progress'
    case 'needs-you':
    case 'ready':
    case 'ready-to-list':
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
export function buildCatalog(products: readonly Product[], listings: readonly Listing[], issues: readonly Issue[], ctx?: ChipContext): CatalogRow[] {
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
    const overall = overallStatus(kept, ctx)
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
  /** Rows with a listing in this bucket (on `marketplace`, when one is set). */
  listing?: ListingFilter | null
  /** For `listing: 'ready_to_publish'`: what the publish switches allow now. */
  ctx?: ChipContext
}

export function filterCatalog(rows: readonly CatalogRow[], f: CatalogFilter): CatalogRow[] {
  const q = f.q?.trim().toLowerCase() ?? ''
  return rows.filter((r) => {
    if (f.bucket && f.bucket !== 'all' && r.bucket !== f.bucket) return false
    if (f.category && r.product.category !== f.category) return false
    if (f.marketplace && !r.listings[f.marketplace]) return false
    if (f.listing) {
      const own = f.marketplace ? [r.listings[f.marketplace]] : Object.values(r.listings)
      if (!own.some((l) => l && listingMatches(l, f.listing!, f.ctx))) return false
    }
    if (!q) return true
    if (r.product.title.toLowerCase().includes(q) || r.product.sku.toLowerCase().includes(q)) return true
    return r.variants.some((v) => v.sku.toLowerCase().includes(q))
  })
}

export function categoriesOf(rows: readonly CatalogRow[]): string[] {
  return [...new Set(rows.flatMap((r) => (r.product.category ? [r.product.category] : [])))].sort()
}

/** Shown for a product saved without a category (SI14), until the seller picks one. */
export const NO_CATEGORY_LABEL = 'No category yet'

/**
 * A product's category in the words the editor uses ("ethnic_wear_kurta_sets" → "Kurta sets",
 * "tshirts" → "T-shirts"); null (no category yet) reads as such.
 */
export function productCategoryLabel(slug: string | null | undefined): string {
  return slug == null ? NO_CATEGORY_LABEL : categoryLabel(slug)
}

/** "fabric_type" → "Fabric type"; null reads as "No category yet". */
export function humanizeSlug(slug: string | null): string {
  if (slug === null) return NO_CATEGORY_LABEL
  const s = slug.replace(/[_-]+/g, ' ').trim()
  return s ? s[0]!.toUpperCase() + s.slice(1) : slug
}

/** Short listing reference shown under a marketplace cell (our listing id, 6 chars + "•"). */
export function shortId(id: string): string {
  return `${id.replace(/-/g, '').slice(0, 6).toUpperCase()}•`
}

/** The chip for one marketplace cell, or "not listed" when the product has no listing there. */
export function cellChip(l: Listing | undefined, ctx?: ChipContext): ChipView {
  return l ? listingChip(l, ctx) : { status: 'not-listed', label: 'Not listed' }
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

/** Letter sizes a seller means in capitals (`m`, `xl`, `2xl`, `xxxl`, `free size`). */
const LETTER_SIZE = /^(?:xxs|xs|s|m|l|x{1,4}l|[2-6]xl|free\s*size)$/i

/** A size as the seller sees it: standard letter sizes in capitals, anything else as entered. */
export const sizeLabel = (size: string): string => (LETTER_SIZE.test(size.trim()) ? size.trim().toUpperCase() : size.trim())

/**
 * A variant's colour or size: its own axis (SI8 `variant_attributes`) first, then the fact of the
 * same name (older backends send only `attributes.size`). The size axis is the lower-cased matrix
 * key (`m`), so a size reads the seller's own spelling from the fact when it is the same size, and
 * standard letter sizes show in capitals (prod Chrome pass 12 Nov, B8: "m" and "l" headers).
 */
export const variantAxis = (p: Product, key: 'color' | 'size'): string | null => {
  const raw = p.variant_attributes?.[key]
  const own = typeof raw === 'string' && raw.trim() ? raw.trim() : null
  const fact = attrText(p, key)
  if (key === 'color') return own ?? fact
  const seller = fact && (!own || fact.toLowerCase() === own.toLowerCase()) ? fact : null
  const size = seller ?? own ?? fact
  return size === null ? null : sizeLabel(size)
}

export const matrixKey = (colour: string | null, size: string) => `${colour ?? ''}\u0000${size}`

export function variantMatrix(variants: readonly Product[]): VariantMatrix {
  const colours: (string | null)[] = []
  const sizes: string[] = []
  const cells = new Map<string, Product>()
  const none: VariantMatrix = { colours: [], sizes: [], cells: new Map(), loose: [...variants] }
  for (const v of variants) {
    const size = variantAxis(v, 'size')
    const colour = variantAxis(v, 'color')
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
