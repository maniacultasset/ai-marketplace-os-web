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

describe('tiles', () => {
  it('live counts partly live listings too, with the product count, and links to live products', () => {
    const t = liveTile(summary())
    expect(t.value).toBe('4')
    expect(t.caption).toBe('listings across 2 products, 1 partly live')
    expect(t.link.target).toEqual({ to: '/products', search: { status: 'live' } })
    expect(t.definition).toMatch(/confirmed live/)
  })

  it('in progress says nothing is needed, and links to the In progress filter', () => {
    const t = progressTile(summary())
    expect(t.value).toBe('1')
    expect(t.caption).toMatch(/No action needed/)
    expect(t.link.target).toEqual({ to: '/products', search: { status: 'progress' } })
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
    expect(t.listings).toEqual({ label: 'Approve in Products', target: { to: '/products', search: { status: 'needs-you' } } })
    expect(t.aside).toBe('2 more questions would improve a listing.')
  })

  it('with only listings to publish, the main link goes to Products', () => {
    const t = needsYouTile(summary({ needs_you: { total: 1, blocked: 0, questions: 0, ready_to_approve: 0, ready_to_publish: 1, publishing_paused: 2, improve: 0 } }))
    expect(t.link).toEqual({ label: 'Publish in Products', target: { to: '/products', search: { status: 'needs-you' } } })
    expect(t.listings).toBeNull()
    expect(t.aside).toBe('2 approved listings wait while publishing is paused.')
  })

  it('an empty needs you says so', () => {
    const none = { total: 0, blocked: 0, questions: 0, ready_to_approve: 0, ready_to_publish: 0, publishing_paused: 0, improve: 0 }
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
