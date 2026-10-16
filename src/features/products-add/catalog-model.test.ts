import { describe, expect, it } from 'vitest'
import {
  bucketCounts,
  buildCatalog,
  filterCatalog,
  humanizeSlug,
  overallStatus,
  shortId,
  variantMatrix,
  type Issue,
  type Listing,
  type Product,
} from './catalog-model'

const T0 = '2026-10-01T10:00:00Z'
let n = 0
const id = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`

function product(p: Partial<Product> = {}): Product {
  return { id: id(), sku: `SKU-${n}`, title: `Product ${n}`, category: 'ethnic_wear_kurta_sets', status: 'draft', created_at: T0, updated_at: T0, attributes: {}, images: [], parent_product_id: null, ...p }
}
function listing(productId: string, l: Partial<Listing> = {}): Listing {
  return {
    id: id(),
    product_id: productId,
    marketplace: 'amazon',
    status: 'created',
    marketplace_state: 'not_submitted',
    created_at: T0,
    updated_at: T0,
    status_changed_at: T0,
    ...l,
  }
}
const issue = (listingId: string, status: Issue['status'] = 'open') => ({ id: id(), listing_id: listingId, status }) as Issue

describe('overallStatus', () => {
  it('is draft with no listings', () => expect(overallStatus([])).toBe('draft'))
  it('error wins over live', () => {
    expect(overallStatus([listing('p', { status: 'failed' }), listing('p', { marketplace: 'flipkart', status: 'published', marketplace_state: 'live' })])).toBe('error')
  })
  it('live only when every listing is live on the marketplace', () => {
    const live = listing('p', { status: 'published', marketplace_state: 'live' })
    expect(overallStatus([live])).toBe('live')
    expect(overallStatus([live, listing('p', { marketplace: 'flipkart', status: 'generating' })])).toBe('partly-live')
    // published but not confirmed live by the marketplace is not Live
    expect(overallStatus([listing('p', { status: 'published', marketplace_state: 'processing' })])).toBe('working')
  })
  it('needs you before working', () => {
    expect(overallStatus([listing('p', { status: 'needs_review' }), listing('p', { status: 'generating' })])).toBe('needs-you')
    expect(overallStatus([listing('p', { status: 'blocked' })])).toBe('needs-you')
  })
  it('created-only listings are draft', () => expect(overallStatus([listing('p')])).toBe('draft'))
})

describe('buildCatalog', () => {
  it('groups variants under their style, joins listings and open issues', () => {
    const style = product()
    const v1 = product({ parent_product_id: style.id })
    const v2 = product({ parent_product_id: style.id })
    const solo = product()
    const orphan = product({ parent_product_id: '00000000-0000-4000-8000-999999999999' })
    const la = listing(style.id, { status: 'needs_review', updated_at: '2026-10-02T00:00:00Z' })
    const lf = listing(style.id, { marketplace: 'flipkart', status: 'generating' })
    const rows = buildCatalog([style, v1, v2, solo, orphan], [la, lf], [issue(la.id), issue(la.id), issue(lf.id, 'resolved')])
    expect(rows.map((r) => r.product.id)).toEqual([style.id, solo.id, orphan.id])
    const s = rows[0]!
    expect(s.variants).toHaveLength(2)
    expect(s.listings.amazon?.id).toBe(la.id)
    expect(s.openIssues).toBe(2)
    expect(s.overall).toBe('needs-you')
    expect(s.activityAt).toBe('2026-10-02T00:00:00Z')
    expect(rows[1]!.bucket).toBe('draft')
  })

  it('counts always sum to all', () => {
    const ps = [product(), product(), product(), product()]
    const ls = [listing(ps[0]!.id, { status: 'published', marketplace_state: 'live' }), listing(ps[1]!.id, { status: 'failed' }), listing(ps[2]!.id, { status: 'approved' })]
    const c = bucketCounts(buildCatalog(ps, ls, []))
    expect(c).toEqual({ all: 4, live: 1, progress: 1, 'needs-you': 0, error: 1, draft: 1 })
    expect(c.live + c.progress + c['needs-you'] + c.error + c.draft).toBe(c.all)
  })
})

describe('filterCatalog', () => {
  const a = product({ title: 'Linen Kurta', sku: 'KRT-1', category: 'kurtas' })
  const b = product({ title: 'Tee', sku: 'TEE-1', category: 'tees' })
  const va = product({ sku: 'KRT-1-BLK-S', parent_product_id: a.id })
  const rows = buildCatalog([a, b, va], [listing(b.id, { marketplace: 'flipkart' })], [])
  it('searches title, SKU and variant SKUs', () => {
    expect(filterCatalog(rows, { q: 'linen' }).map((r) => r.product.id)).toEqual([a.id])
    expect(filterCatalog(rows, { q: 'blk-s' }).map((r) => r.product.id)).toEqual([a.id])
  })
  it('filters by category, marketplace and bucket', () => {
    expect(filterCatalog(rows, { category: 'tees' })).toHaveLength(1)
    expect(filterCatalog(rows, { marketplace: 'flipkart' }).map((r) => r.product.id)).toEqual([b.id])
    expect(filterCatalog(rows, { bucket: 'draft' })).toHaveLength(2)
    expect(filterCatalog(rows, { bucket: 'error' })).toHaveLength(0)
  })
})

describe('helpers', () => {
  it('humanizes slugs and shortens ids', () => {
    expect(humanizeSlug('ethnic_wear_kurta_sets')).toBe('Ethnic wear kurta sets')
    expect(shortId('0b1c2d3e-0000-4000-8000-000000000201')).toBe('0B1C2D•')
  })
  it('builds a colour x size matrix when every variant has its own cell', () => {
    const m = variantMatrix([
      product({ attributes: { color: 'Black', size: 'S' } }),
      product({ attributes: { color: 'Black', size: 'M' } }),
      product({ attributes: { color: 'White', size: 'S' } }),
    ])
    expect(m.colours).toEqual(['Black', 'White'])
    expect(m.sizes).toEqual(['S', 'M'])
    expect(m.cells.size).toBe(3)
    expect(m.loose).toHaveLength(0)
  })
  it('draws a single size row for a size-only family (real import shape: attributes.size only)', () => {
    const m = variantMatrix([product({ attributes: { size: 's' } }), product({ attributes: { size: 'm' } })])
    expect(m.colours).toEqual([null])
    expect(m.sizes).toEqual(['s', 'm'])
    expect(m.cells.size).toBe(2)
  })
  it('never collapses variants that would share a cell (colour not exposed by the API)', () => {
    // Off-white S/M/L and Black S/M/L/XL: the backend returns only `size` for each child.
    const vs = ['s', 'm', 'l', 's', 'm', 'l', 'xl'].map((size) => product({ attributes: { size } }))
    const m = variantMatrix(vs)
    expect(m.cells.size).toBe(0)
    expect(m.colours).toEqual([])
    expect(m.loose).toEqual(vs)
  })
  it('lists a colour-only family (no size) one by one', () => {
    const vs = [product({ attributes: {} }), product({ attributes: {} })]
    expect(variantMatrix(vs).loose).toHaveLength(2)
  })
  it('lists everything when only some variants carry a colour', () => {
    const vs = [product({ attributes: { size: 's', color: 'Black' } }), product({ attributes: { size: 'm' } })]
    const m = variantMatrix(vs)
    expect(m.cells.size).toBe(0)
    expect(m.loose).toHaveLength(2)
  })
})
