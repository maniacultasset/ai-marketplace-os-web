import { describe, expect, it } from 'vitest'
import { ISSUE, L2, P1, summary, TASK } from '@/test/home-summary'
import {
  cardInputs,
  cardNext,
  feedRows,
  feedSummary,
  itemTarget,
  liveTile,
  needsYouCaption,
  needsYouTile,
  progressTile,
  waitingEmpty,
  waitingRow,
  type NeedsYouItem,
} from './summary-model'
import { buildCatalog, filterCatalog, listingBucket, type Listing, type ListingFilter, type Product } from '@/features/products-add/catalog-model'

describe('tiles', () => {
  it('live counts partly live listings too, with the product count, and links to live products', () => {
    const t = liveTile(summary())
    expect(t.value).toBe('4')
    expect(t.caption).toBe('listings across 2 products, 1 partly live')
    expect(t.link.target).toEqual({ to: '/products', search: { listing: 'live' } })
    expect(t.definition).toMatch(/confirmed live/)
  })

  it('in progress says nothing is needed, and links to the In progress filter', () => {
    const t = progressTile(summary())
    expect(t.value).toBe('1')
    expect(t.caption).toMatch(/No action needed/)
    expect(t.link.target).toEqual({ to: '/products', search: { listing: 'in_progress' } })
    const idle = progressTile(summary({ listings: { ...summary().listings, in_progress: 0 } }))
    expect(idle.caption).toMatch(/^Nothing is being written/)
  })

  it('numbers are exact and grouped the Indian way, never with "+"', () => {
    const big = summary({ listings: { ...summary().listings, live: 12_345, partly_live: 0 } })
    expect(liveTile(big).value).toBe('12,345')
  })

  it('needs you splits the work and links to the Inbox and to Products', () => {
    const t = needsYouTile(summary())
    expect(t.value).toBe('4')
    expect(t.caption).toBe('1 blocked, 1 question, 1 to approve, 1 to publish')
    expect(t.link).toEqual({ label: 'Open Inbox', target: { to: '/inbox' } })
    expect(t.listings).toEqual({ label: 'Approve in Products', target: { to: '/products', search: { listing: 'ready_to_approve' } } })
    expect(t.aside).toBe('2 more questions would improve a listing.')
  })

  it('with only listings to publish, the main link goes to Products', () => {
    const t = needsYouTile(summary({ needs_you: { total: 1, blocked: 0, blocked_without_issue: 0, own_work: 0, waiting_on_account: 0, questions: 0, ready_to_approve: 0, ready_to_publish: 1, publishing_paused: 2, improve: 0 } }))
    expect(t.link).toEqual({ label: 'Publish in Products', target: { to: '/products', search: { listing: 'ready_to_publish' } } })
    expect(t.listings).toBeNull()
    expect(t.aside).toBe('2 listings wait while publishing is paused.')
  })

  it('a stopped listing with no Inbox row opens Products, never an empty Inbox', () => {
    const none = summary().needs_you
    const t = needsYouTile(summary({ needs_you: { ...none, total: 1, blocked: 1, blocked_without_issue: 1, questions: 0, ready_to_approve: 0, ready_to_publish: 0 } }))
    expect(t.inbox).toBe(false)
    expect(t.link).toEqual({ label: 'See stopped listings', target: { to: '/products', search: { listing: 'problem' } } })
    // with Inbox work too, the stopped ones are the second link
    const both = needsYouTile(summary({ needs_you: { ...none, blocked: 2, blocked_without_issue: 1 } }))
    expect(both.link.target).toEqual({ to: '/inbox' })
    expect(both.listings?.target).toEqual({ to: '/products', search: { listing: 'problem' } })
  })

  it('says why listings wait: own work (maker-checker) and the marketplace account', () => {
    const none = summary().needs_you
    const t = needsYouTile(summary({ needs_you: { ...none, improve: 0, own_work: 1, waiting_on_account: 3 } }))
    expect(t.aside).toBe('1 listing waits for someone else to approve, since you made or edited it. 3 listings wait for the marketplace to be connected.')
  })

  it('an empty needs you says so', () => {
    const none = { total: 0, blocked: 0, blocked_without_issue: 0, own_work: 0, waiting_on_account: 0, questions: 0, ready_to_approve: 0, ready_to_publish: 0, publishing_paused: 0, improve: 0 }
    expect(needsYouCaption(none)).toBe('Nothing needs you right now.')
    expect(needsYouCaption({ ...none, improve: 1 })).toBe('Nothing blocks your listings.')
    expect(needsYouTile(summary({ needs_you: none })).link.target).toEqual({ to: '/inbox' })
  })
})

describe('waiting for you', () => {
  const [blocked, question, approve] = summary().needs_you_items as [NeedsYouItem, NeedsYouItem, NeedsYouItem]

  it('names the product, the issue and the action', () => {
    expect(waitingRow(blocked)).toMatchObject({
      title: 'Block Print Kurta',
      issue: 'The title is longer than Amazon allows.',
      meta: 'KURTA-001 · Amazon · 2 issues',
      action: 'Fix',
    })
    expect(waitingRow(question)).toMatchObject({ title: 'Block Print Kurta', issue: 'What is the fabric?', action: 'Answer' })
    expect(waitingRow(approve).action).toBe('Review')
  })

  it('each action opens the Inbox item, the review or the product', () => {
    expect(itemTarget(blocked)).toEqual({ to: '/inbox', search: { item: `issue:${ISSUE}` } })
    expect(itemTarget(question)).toEqual({ to: '/inbox', search: { item: `task:${TASK}` } })
    expect(itemTarget(approve)).toEqual({ to: '/listings/$listingId/review', params: { listingId: L2 } })
    expect(itemTarget({ ...blocked, issue_id: null })).toEqual({ to: '/products/$productId', params: { productId: P1 } })
  })

  it('a row without a product title falls back to the SKU', () => {
    expect(waitingRow({ ...blocked, product_title: null }).title).toBe('KURTA-001')
    expect(waitingRow({ ...blocked, product_title: null }).meta).toBe('Amazon · 2 issues')
  })

  it('the empty state says how to start', () => {
    expect(waitingEmpty(summary({ products: 0 }))).toBe('add-product')
    const none = summary().marketplaces.map((m) => ({ ...m, account: 'not_connected' as const }))
    expect(waitingEmpty(summary({ marketplaces: none }))).toBe('connect')
    expect(waitingEmpty(summary())).toBe('clear')
  })
})

describe('what the agent did', () => {
  it('keeps the order, says the state and links to the product', () => {
    const rows = feedRows(summary().activity)
    expect(rows.map((r) => r.state)).toEqual(['pending', 'failed', 'completed'])
    expect(rows[0]!.target).toEqual({ to: '/products/$productId', params: { productId: P1 } })
    expect(rows[2]!.target).toBeNull()
    expect(rows[1]!.icon.tone).toBe('fail')
  })

  it('sums up what is pending or failed', () => {
    expect(feedSummary(summary().activity)).toBe('1 in progress · 1 failed')
    expect(feedSummary([])).toBeNull()
  })

  it('says an import that imported nothing as failed, and opens its failed rows (B3)', () => {
    const IMP = '0b1c2d3e-0000-4000-8000-0000000000aa'
    const at = '2026-11-12T13:00:00Z'
    const rows = feedRows([
      { kind: 'import', state: 'failed', text: 'Could not import your spreadsheet: none of its 7 rows imported', at, import_id: IMP, needs_fix: 7 },
      { kind: 'import', state: 'completed', text: 'Imported 3 of 7 rows from your spreadsheet. 4 rows need a fix', at, import_id: IMP, needs_fix: 4 },
      { kind: 'import', state: 'completed', text: 'Imported 5 rows from your spreadsheet', at, import_id: IMP, needs_fix: 0 },
    ])
    expect(rows.map((r) => [r.word, r.icon.tone])).toEqual([
      ['Failed', 'fail'],
      ['Partly done', 'warn'],
      ['Done', 'ok'],
    ])
    expect(rows[0]!.target).toEqual({ to: '/imports/$importId', params: { importId: IMP }, search: { rows: 'failed' } })
    expect(rows[1]!.target).toEqual({ to: '/imports/$importId', params: { importId: IMP }, search: { rows: 'failed' } })
    expect(rows[2]!.target).toEqual({ to: '/imports/$importId', params: { importId: IMP } })
    expect(feedSummary([
      { kind: 'import', state: 'failed', text: 'x', at, import_id: IMP, needs_fix: 7 },
      { kind: 'import', state: 'completed', text: 'y', at, import_id: IMP, needs_fix: 4 },
    ])).toBe('1 failed · 1 needs a fix')
  })
})

describe('marketplace cards', () => {
  it('reads the account and the exact totals, and names the blocked product', () => {
    const { account, totals } = cardInputs(summary(), 'amazon')
    expect(account).toEqual({ status: 'active' })
    expect(totals).toMatchObject({ listings: 6, live: 2, partly: 1, working: 1, problem: 1 })
    expect(totals.firstProblem).toEqual({ productId: P1, label: 'The title is longer than Amazon allows.' })
    expect(cardInputs(summary(), 'flipkart').totals.firstProblem).toBeUndefined()
  })

  it('a missing or expired account reads as such', () => {
    const s = summary({
      marketplaces: [
        { marketplace: 'amazon', enabled: true, account: 'needs_reconnect', publishing_enabled: true, next_step: 'reconnect' },
        { marketplace: 'flipkart', enabled: true, account: 'not_connected', publishing_enabled: true, next_step: 'connect' },
      ],
    })
    expect(cardInputs(s, 'amazon').account).toEqual({ status: 'needs_reconnect' })
    expect(cardInputs(s, 'flipkart').account).toBeNull()
  })

  it('the next step: add a product when connected and empty, else see the listings', () => {
    const status = (next_step: 'add_listing' | 'none') => ({ marketplace: 'amazon' as const, enabled: true, account: 'connected' as const, publishing_enabled: true, next_step })
    const empty = { listings: 0, live: 0, partly: 0, working: 0, problem: 0 }
    expect(cardNext('amazon', status('add_listing'), empty)).toEqual({ label: 'Add a product to list here', target: { to: '/add' } })
    expect(cardNext('amazon', status('none'), { ...empty, listings: 3, live: 3 })).toEqual({
      label: 'See 3 listings',
      target: { to: '/products', search: { marketplace: 'amazon' } },
    })
    expect(cardNext('amazon', status('none'), empty)).toBeNull()
  })
})

describe('a tile and the list it opens agree', () => {
  // One fixture for both sides: the backend counts listings by `listingBucket` (a copy of
  // app.services.home.listing_bucket), and the tile's link filters Products by the same bucket.
  const T = '2026-11-11T09:00:00Z'
  let k = 0
  const uid = () => `00000000-0000-4000-8000-${String(++k).padStart(12, '0')}`
  const product = (): Product =>
    ({ id: uid(), sku: `S-${k}`, title: `P ${k}`, category: null, status: 'draft', created_at: T, updated_at: T, attributes: {}, images: [], parent_product_id: null }) as unknown as Product
  const listing = (p: Product, l: Partial<Listing>): Listing =>
    ({ id: uid(), product_id: p.id, marketplace: 'amazon', status: 'created', display_state: 'draft', needs_you_count: 0, marketplace_state: 'not_submitted', created_at: T, updated_at: T, status_changed_at: T, ...l }) as Listing

  const [a, b, c, d, e, f] = [product(), product(), product(), product(), product(), product()]
  const listings = [
    // live on Amazon, failed on Flipkart: Live counts it, Products' overall says Error
    listing(a, { status: 'published', marketplace_state: 'live' }),
    listing(a, { marketplace: 'flipkart', status: 'failed' }),
    listing(b, { status: 'published', marketplace_state: 'partially_live' }),
    listing(b, { marketplace: 'flipkart', status: 'generating' }),
    listing(c, { status: 'published', marketplace_state: 'processing' }),
    listing(c, { marketplace: 'flipkart', status: 'approved' }),
    // approved on Amazon while Amazon publishing is paused: in no "to publish" count
    listing(d, { status: 'approved' }),
    listing(e, { status: 'validated', display_state: 'needs_you', needs_you_count: 2 }),
    listing(e, { marketplace: 'flipkart', status: 'needs_review' }),
    listing(f, { status: 'published', marketplace_state: 'rejected' }),
  ]
  const ctx = { amazonPublishingPaused: true }
  const rows = buildCatalog([a, b, c, d, e, f], listings, [], ctx)
  const counts = (fn: (l: Listing) => boolean) => listings.filter(fn).length
  const productsOf = (fn: (l: Listing) => boolean) => new Set(listings.filter(fn).map((l) => l.product_id))
  const shown = (search: { listing?: ListingFilter }) => new Set(filterCatalog(rows, { listing: search.listing, ctx }).map((r) => r.product.id))
  const target = (t: { target: unknown }) => (t.target as { search: { listing?: ListingFilter } }).search

  const live = (l: Listing) => ['live', 'partly_live'].includes(listingBucket(l))
  const working = (l: Listing) => listingBucket(l) === 'in_progress'
  const s = summary({
    listings: {
      ...summary().listings,
      live: counts((l) => listingBucket(l) === 'live'),
      partly_live: counts((l) => listingBucket(l) === 'partly_live'),
      live_products: productsOf(live).size,
      in_progress: counts(working),
    },
  })

  it('Live: the list shows exactly the products of the live listings, one row per product', () => {
    const t = liveTile(s)
    expect(t.value).toBe('2')
    expect(shown(target(t.link))).toEqual(productsOf(live))
    expect(shown(target(t.link)).size).toBe(s.listings.live_products)
    expect(rows.find((r) => r.product.id === a.id)?.bucket).toBe('error') // and still listed under Live
  })

  it('In progress: the same listings, never the paused approved one', () => {
    const t = progressTile(s)
    expect(t.value).toBe(String(counts(working)))
    expect(shown(target(t.link))).toEqual(productsOf(working))
    expect(shown(target(t.link)).has(d.id)).toBe(false)
  })

  it('stopped, to approve and to publish open their own listings', () => {
    expect(shown({ listing: 'problem' })).toEqual(new Set([a.id, e.id, f.id]))
    expect(shown({ listing: 'ready_to_approve' })).toEqual(new Set([e.id]))
    // Flipkart's approved listing can be sent; Amazon's waits while publishing is paused
    expect(shown({ listing: 'ready_to_publish' })).toEqual(new Set([c.id]))
  })
})
