/**
 * Home from GET /home/summary (client feedback 11 Nov 2026, item 6): pure model, unit tested.
 *
 * The backend counts every listing in one bucket (`app.services.home`), so every number here is
 * exact: no page walk, no cap and no "+". This file only words the numbers, says what each one
 * means (the tile tooltips) and says where each one leads (a filtered Products list, the Inbox
 * item, the listing review or the product).
 *
 * A tile opens Products filtered by the same listing bucket (`?listing=`, catalog-model
 * `listingBucket`, a copy of the backend's), so the list shows exactly the products that own the
 * listings the tile counts.
 */
import type { Schema } from '@/api/types'
import type { TileTone } from '@/components/la/icons'
import type { ListingFilter } from '@/features/products-add/catalog-model'
import type { ProductsSearch } from '@/features/products-add/products-search'
import type { MarketplaceTotals } from './model'
import { plural } from './model'

export type HomeSummary = Schema<'HomeSummaryOut'>
export type NeedsYouItem = Schema<'NeedsYouItem'>
export type ActivityItem = Schema<'ActivityItem'>
type Marketplace = Schema<'Marketplace'>
type MarketplaceStatus = Schema<'MarketplaceStatus'>

const n = (x: number) => x.toLocaleString('en-IN')

/** Products filtered to the ones with a listing in `bucket`: what a tile counts. */
export const listingTarget = (bucket: ListingFilter): Target => ({ to: '/products', search: { listing: bucket } })

/* ---------------------------------------------------------------------------------------------- */
/* Tiles                                                                                           */
/* ---------------------------------------------------------------------------------------------- */

/** What each number counts, in plain words (the tooltip on the tile). Mirrors the backend. */
export const DEFINITION = {
  live: 'Listings the marketplace has confirmed live, including ones with only some variants live. Each listing is one product on one marketplace.',
  progress: 'Listings Kuinn or the marketplace is working on: being written, being sent, or sent and waiting for the marketplace to confirm. Nothing to do.',
  needsYou:
    'What waits on you: listings stopped by a check or the marketplace, questions that hold a listing back, and listings ready for you to approve or publish.',
} as const

/** A link the UI turns into a router Link. */
export type Target =
  | { to: '/products'; search: ProductsSearch }
  | { to: '/inbox'; search?: { item: string } }
  | { to: '/products/$productId'; params: { productId: string } }
  | { to: '/listings/$listingId/review'; params: { listingId: string } }
  | { to: '/marketplaces'; search: { mp: Marketplace } }
  | { to: '/add' }

export interface SummaryTile {
  value: string
  caption: string
  definition: string
  /** The filtered list behind the number. */
  link: { label: string; target: Target }
  /** A second, quieter line. */
  aside?: string
}

export function liveTile(s: HomeSummary): SummaryTile {
  const l = s.listings
  const parts = [`${plural(l.live + l.partly_live, 'listing')} across ${n(l.live_products)} ${plural(l.live_products, 'product')}`]
  if (l.partly_live) parts.push(`${n(l.partly_live)} partly live`)
  return {
    value: n(l.live + l.partly_live),
    caption: parts.join(', '),
    definition: DEFINITION.live,
    link: { label: 'See live products', target: listingTarget('live') },
  }
}

export function progressTile(s: HomeSummary): SummaryTile {
  const v = s.listings.in_progress
  return {
    value: n(v),
    caption: v ? 'Kuinn or the marketplace is working. No action needed.' : 'Nothing is being written or sent right now.',
    definition: DEFINITION.progress,
    link: { label: 'See in Products', target: listingTarget('in_progress') },
  }
}

/** "1 blocked, 2 questions, 1 to approve". Empty parts are left out. */
export function needsYouCaption(y: HomeSummary['needs_you']): string {
  const out: string[] = []
  if (y.blocked) out.push(`${n(y.blocked)} blocked`)
  if (y.questions) out.push(`${n(y.questions)} ${plural(y.questions, 'question')}`)
  if (y.ready_to_approve) out.push(`${n(y.ready_to_approve)} to approve`)
  if (y.ready_to_publish) out.push(`${n(y.ready_to_publish)} to publish`)
  if (out.length) return out.join(', ')
  return y.improve ? 'Nothing blocks your listings.' : 'Nothing needs you right now.'
}

/** "3 listings wait" / "1 listing waits". */
const wait = (x: number) => `${n(x)} ${plural(x, 'listing')} ${x === 1 ? 'waits' : 'wait'}`

export function needsYouTile(s: HomeSummary): SummaryTile & { inbox: boolean; listings: { label: string; target: Target } | null } {
  const y = s.needs_you
  const asides: string[] = []
  if (y.improve) asides.push(`${n(y.improve)} more ${plural(y.improve, 'question')} would improve a listing.`)
  if (y.own_work) asides.push(`${wait(y.own_work)} for someone else to approve, since you made or edited ${y.own_work === 1 ? 'it' : 'them'}.`)
  if (y.publishing_paused) asides.push(`${wait(y.publishing_paused)} while publishing is paused.`)
  if (y.waiting_on_account) asides.push(`${wait(y.waiting_on_account)} for the marketplace to be connected.`)
  // Fixes with an issue and answers are in the Inbox. A listing stopped with no issue row (a failed
  // step, a marketplace rejection) and listings to approve or publish are on Products.
  const inbox = y.blocked - y.blocked_without_issue + y.questions > 0
  const products: { label: string; target: Target }[] = []
  if (y.blocked_without_issue) products.push({ label: 'See stopped listings', target: listingTarget('problem') })
  if (y.ready_to_approve) products.push({ label: 'Approve in Products', target: listingTarget('ready_to_approve') })
  if (y.ready_to_publish) products.push({ label: 'Publish in Products', target: listingTarget('ready_to_publish') })
  const inboxLink = { label: 'Open Inbox', target: { to: '/inbox' } as Target }
  return {
    value: n(y.total),
    caption: needsYouCaption(y),
    definition: DEFINITION.needsYou,
    aside: asides.join(' ') || undefined,
    link: inbox || products.length === 0 ? inboxLink : products[0]!,
    inbox,
    listings: (inbox ? products[0] : products[1]) ?? null,
  }
}

/* ---------------------------------------------------------------------------------------------- */
/* Waiting for you                                                                                 */
/* ---------------------------------------------------------------------------------------------- */

export const ACTION_LABEL: Record<NeedsYouItem['action'], string> = {
  fix: 'Fix',
  answer: 'Answer',
  approve: 'Review',
  publish: 'Publish',
}

const KIND_ICON: Record<NeedsYouItem['kind'], { icon: 'alert' | 'info' | 'check' | 'upload'; tone: TileTone }> = {
  blocked: { icon: 'alert', tone: 'fail' },
  question: { icon: 'info', tone: 'warn' },
  approve: { icon: 'check', tone: 'brand' },
  publish: { icon: 'upload', tone: 'brand' },
}

const MARKETPLACE_NAME: Record<Marketplace, string> = { amazon: 'Amazon', flipkart: 'Flipkart' }

export interface WaitingRow {
  key: string
  /** The product (its title, else its SKU). */
  title: string
  /** What is wrong, in the seller's words. */
  issue: string
  /** "KURTA-001 · Amazon · 2 issues". */
  meta: string
  action: string
  target: Target
  icon: (typeof KIND_ICON)[NeedsYouItem['kind']]
}

/** Where an item's action leads: the Inbox item, the listing review, else the product. */
export function itemTarget(i: NeedsYouItem): Target {
  if (i.kind === 'question' && i.task_id) return { to: '/inbox', search: { item: `task:${i.task_id}` } }
  if (i.kind === 'blocked' && i.issue_id) return { to: '/inbox', search: { item: `issue:${i.issue_id}` } }
  if ((i.kind === 'approve' || i.kind === 'publish') && i.listing_id) return { to: '/listings/$listingId/review', params: { listingId: i.listing_id } }
  if (i.product_id) return { to: '/products/$productId', params: { productId: i.product_id } }
  return { to: '/inbox' }
}

export function waitingRow(i: NeedsYouItem): WaitingRow {
  const title = i.product_title?.trim() || i.product_sku || (i.kind === 'question' ? 'A question for you' : 'A listing')
  const meta = [
    i.product_title ? i.product_sku : null,
    i.marketplace ? MARKETPLACE_NAME[i.marketplace] : null,
    i.kind === 'blocked' && (i.issue_count ?? 0) > 1 ? `${n(i.issue_count ?? 0)} issues` : null,
  ]
    .filter(Boolean)
    .join(' · ')
  return {
    key: `${i.kind}:${i.task_id ?? i.issue_id ?? i.listing_id ?? i.product_id ?? i.at}`,
    title,
    issue: i.issue,
    meta,
    action: ACTION_LABEL[i.action],
    target: itemTarget(i),
    icon: KIND_ICON[i.kind],
  }
}

export type WaitingEmpty = 'add-product' | 'connect' | 'clear'

/** Why the list is empty, so the empty state can say how to go on. */
export function waitingEmpty(s: HomeSummary): WaitingEmpty {
  if (s.products === 0) return 'add-product'
  if (!s.marketplaces.some((m) => m.account !== 'not_connected')) return 'connect'
  return 'clear'
}

/* ---------------------------------------------------------------------------------------------- */
/* What the agent did                                                                              */
/* ---------------------------------------------------------------------------------------------- */

export const STATE_WORD: Record<ActivityItem['state'], string> = { completed: 'Done', failed: 'Failed', pending: 'In progress' }

const STATE_ICON: Record<ActivityItem['state'], { icon: 'check' | 'alert' | 'clock'; tone: TileTone }> = {
  completed: { icon: 'check', tone: 'ok' },
  failed: { icon: 'alert', tone: 'fail' },
  pending: { icon: 'clock', tone: 'brand' },
}

export interface FeedRow {
  key: string
  text: string
  state: ActivityItem['state']
  at: string
  icon: (typeof STATE_ICON)[ActivityItem['state']]
  /** The product the action was about, when there is one. */
  target: Target | null
}

export function feedRows(items: readonly ActivityItem[]): FeedRow[] {
  return items.map((a, i) => ({
    key: `${a.at}-${a.kind}-${i}`,
    text: a.text,
    state: a.state,
    at: a.at,
    icon: STATE_ICON[a.state],
    target: a.product_id ? { to: '/products/$productId', params: { productId: a.product_id } } : null,
  }))
}

/** "2 pending · 1 failed" over the feed, or null when every action finished well. */
export function feedSummary(items: readonly ActivityItem[]): string | null {
  const pending = items.filter((a) => a.state === 'pending').length
  const failed = items.filter((a) => a.state === 'failed').length
  const out = [pending ? `${pending} in progress` : null, failed ? `${failed} failed` : null].filter(Boolean)
  return out.length ? out.join(' · ') : null
}

/* ---------------------------------------------------------------------------------------------- */
/* Marketplace cards                                                                               */
/* ---------------------------------------------------------------------------------------------- */

/** The existing card's inputs, from the summary: the account and the exact totals. */
export function cardInputs(
  s: HomeSummary,
  m: Marketplace,
): { account: { status: 'active' | 'needs_reconnect' } | null; totals: MarketplaceTotals; status: MarketplaceStatus | undefined } {
  const status = s.marketplaces.find((x) => x.marketplace === m)
  const c = s.by_marketplace.find((x) => x.marketplace === m)
  const account = !status || status.account === 'not_connected' ? null : { status: status.account === 'needs_reconnect' ? ('needs_reconnect' as const) : ('active' as const) }
  const first = s.needs_you_items.find((i) => i.kind === 'blocked' && i.marketplace === m && i.product_id)
  const totals: MarketplaceTotals = {
    listings: c?.listings ?? 0,
    live: c?.live ?? 0,
    partly: c?.partly_live ?? 0,
    working: c?.in_progress ?? 0,
    problem: c?.problem ?? 0,
    ...(first?.product_id ? { firstProblem: { productId: first.product_id, label: first.issue } } : {}),
  }
  return { account, totals, status }
}

/** The card's last line: the one next step that is not connect, reconnect or a fix. */
export function cardNext(m: Marketplace, status: MarketplaceStatus | undefined, totals: MarketplaceTotals): { label: string; target: Target } | null {
  if (status?.next_step === 'add_listing') return { label: 'Add a product to list here', target: { to: '/add' } }
  if (status?.next_step === 'none' && totals.listings > 0) {
    return { label: `See ${n(totals.listings)} ${plural(totals.listings, 'listing')}`, target: { to: '/products', search: { marketplace: m } } }
  }
  return null
}
