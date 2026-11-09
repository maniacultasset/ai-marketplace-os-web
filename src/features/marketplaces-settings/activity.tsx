/**
 * /activity, honest v1. The API has no brand-wide activity feed (DESIGN.md "Not in the API yet"),
 * but every listing keeps its own audit history. So the page says the feed is coming, lists the
 * brand's listings, most recent activity first (GET /listings orders by last_event_at),
 * names each one by its product (GET /products/{id}, cached per product) and opens any listing's real history inline
 * (GET /listings/{id}/history, plus what the marketplace said from GET /listings/{id}/submissions),
 * with a link to its product.
 */
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { LaCard } from '@/components/la/cards'
import { Icon } from '@/components/la/icons'
import { cn } from '@/lib/utils'
import { MarketplaceName } from '@/components/la/marketplace'
import { StatusChip } from '@/components/la/status-chip'
import { EmptyState } from '@/components/states/empty-state'
import { ErrorState } from '@/components/states/error-state'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { useListingHistory, useListingsList, useListingSubmissions } from '@/features/listings/api'
import { useProduct } from '@/features/products/api'
import { historyLabel, historyReason, sentence, type Listing } from '@/features/listings/model'
import { mpName } from '@/features/listing-flow/format'
import { formatDateTime, formatRelative } from '@/features/marketplaces/format'
import { useMe } from '@/lib/auth'
import { listingChip } from '@/lib/listing-chip'
import { auditActorLabel, mergeActivity, submissionEvents, type ActivityEvent } from './model'

export function ActivityView() {
  const list = useListingsList({})

  return (
    <div className="flex flex-col gap-5">
      <section aria-labelledby="listings-activity" className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 id="listings-activity" className="font-display text-h3 text-ink">
              Listing history
            </h2>
            <p className="text-caption text-ink-3">Most recent activity first</p>
          </div>
          <p className="text-caption text-ink-3" data-testid="activity-coming-soon">
            One feed for the whole brand is coming. For now, each listing keeps its own history.
          </p>
        </div>

        {list.error && !list.rows.length ? (
          <LaCard pad="none">
            <ErrorState error={list.error} title="Couldn't load listings" onRetry={() => void list.refetch()} />
          </LaCard>
        ) : list.isPending ? (
          <LaCard pad="none" aria-busy="true">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className={cn(ROW, 'border-b border-line last:border-b-0')}>
                <Skeleton className="size-7 rounded-lg" />
                <div className="order-first basis-full space-y-1.5 sm:order-none sm:basis-auto">
                  <Skeleton className="h-4 w-48 max-w-full" />
                  <Skeleton className="h-3 w-32" />
                </div>
                <Skeleton className="h-[22px] w-24 rounded-full sm:justify-self-start" />
                <Skeleton className="h-8 w-28 rounded-control" />
              </div>
            ))}
            <span className="sr-only">Loading listings…</span>
          </LaCard>
        ) : list.rows.length === 0 ? (
          <LaCard pad="none">
            <EmptyState
              title="No listings yet"
              description="When the agent writes a listing, its history starts here."
              actions={
                <Button asChild>
                  <Link to="/add">Add products</Link>
                </Button>
              }
            />
          </LaCard>
        ) : (
          <LaCard pad="none">
            <ul aria-label="Listings">
              {list.rows.map((l) => (
                <ListingActivityRow key={l.id} listing={l} />
              ))}
            </ul>
            {list.hasNextPage ? (
              <div className="flex justify-center border-t border-line p-3">
                <Button variant="ghost" size="sm" onClick={() => void list.fetchNextPage()} disabled={list.isFetchingNextPage}>
                  {list.isFetchingNextPage ? <Spinner data-icon="inline-start" /> : null}
                  {list.isFetchingNextPage ? 'Loading…' : 'Load more'}
                </Button>
              </div>
            ) : null}
          </LaCard>
        )}
      </section>
    </div>
  )
}

/**
 * One row from lg: marketplace | product | status | actions, on fixed columns so every row's
 * chip and buttons line up down the list. Below lg (the card sits beside the sidebar and is too
 * narrow for four columns) it wraps, product first.
 */
const ROW =
  'flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5 lg:grid lg:grid-cols-[8rem_minmax(0,1fr)_9rem_auto] lg:items-center'

function ListingActivityRow({ listing }: { listing: Listing }) {
  const [open, setOpen] = useState(false)
  const chip = listingChip(listing)
  const panelId = `history-${listing.id}`
  return (
    <li className="border-b border-line last:border-b-0" data-testid="activity-listing">
      <div className={ROW}>
        <MarketplaceName id={listing.marketplace} size="sm" className="w-32 lg:w-auto" />
        <div className="order-first min-w-0 basis-full lg:order-none lg:basis-auto">
          <ListingProductName productId={listing.product_id} />
          <p className="text-caption text-ink-3 lg:truncate">
            {listing.category ? `${sentence(listing.category)} · ` : ''}Status changed{' '}
            <time dateTime={listing.status_changed_at} title={formatDateTime(listing.status_changed_at)}>
              {formatRelative(listing.status_changed_at)}
            </time>
          </p>
        </div>
        <StatusChip status={chip.status} className="lg:justify-self-start">
          {chip.label}
        </StatusChip>
        <div className="flex basis-full items-center gap-1 lg:basis-auto">
          <Button variant="ghost" size="sm" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((o) => !o)}>
            History
            <Icon
              name="chev"
              size={16}
              aria-hidden
              className={cn('transition-transform duration-200 motion-reduce:transition-none', open && 'rotate-180')}
            />
          </Button>
          <Button variant="link" size="sm" asChild>
            <Link to="/products/$productId" params={{ productId: listing.product_id }}>
              Open product
              <Icon name="arrow" size={14} />
            </Link>
          </Button>
        </div>
      </div>
      {open ? <HistoryPanel id={panelId} listingId={listing.id} marketplace={listing.marketplace} /> : null}
    </li>
  )
}

/** The product's title and SKU; falls back to a neutral label if the product can't be read. */
function ListingProductName({ productId }: { productId: string }) {
  const product = useProduct(productId)
  if (product.isPending) return <Skeleton className="my-0.5 h-4 w-48" aria-label="Loading product name" />
  if (!product.data) return <p className="truncate text-body text-ink-2">Product name unavailable</p>
  return (
    <p className="text-body text-ink lg:truncate">
      <span className="font-semibold">{product.data.title}</span>
      <span className="ml-2 text-small text-ink-3">SKU {product.data.sku}</span>
    </p>
  )
}

function HistoryPanel({ id, listingId, marketplace }: { id: string; listingId: string; marketplace: string }) {
  const history = useListingHistory(listingId)
  const submissions = useListingSubmissions(listingId)
  const { data: me } = useMe()
  const mp = mpName(marketplace)
  const people: ActivityEvent[] = history.rows.map((e) => ({
    id: e.id,
    at: e.occurred_at,
    label: historyLabel(e.action),
    by: auditActorLabel(e, me?.user_id),
    reason: historyReason(e),
  }))
  // The marketplace's answers live on submissions, not in the audit history.
  const rows = mergeActivity(people, submissionEvents(submissions.rows, mp))
  const pending = history.isPending || submissions.isPending
  return (
    // Fades in (200ms, opacity only) when opened; reduced motion shows it at once.
    <div
      id={id}
      className="border-t border-line bg-sunken px-5 py-3 shadow-inset-sm transition-opacity duration-200 ease-out starting:opacity-0 motion-reduce:transition-none"
    >
      {history.error && !history.rows.length ? (
        <ErrorState compact error={history.error} title="Couldn't load this listing's history" onRetry={() => void history.refetch()} />
      ) : pending ? (
        <div className="flex flex-col gap-2 py-1" aria-busy="true">
          <Skeleton className="h-3.5 w-64" />
          <Skeleton className="h-3.5 w-52" />
        </div>
      ) : rows.length === 0 ? (
        <p className="py-1 text-small text-ink-2">Nothing recorded yet. Approvals, edits and what {mp} said appear here.</p>
      ) : (
        <ol className="flex flex-col gap-2" aria-label="History, newest first">
          {rows.map((e) => (
            <li key={e.id} className="flex flex-wrap items-baseline gap-x-2 text-small">
              <time dateTime={e.at} className="w-36 shrink-0 text-ink-3">
                {formatDateTime(e.at)}
              </time>
              <span className="font-semibold text-ink">{e.label}</span>
              {e.by !== mp ? <span className="text-ink-2">by {e.by}</span> : null}
              {e.reason ? <span className="min-w-0 text-ink-2">· {e.reason}</span> : null}
            </li>
          ))}
          {history.hasNextPage ? (
            <li>
              <Button variant="link" size="sm" onClick={() => void history.fetchNextPage()} disabled={history.isFetchingNextPage}>
                {history.isFetchingNextPage ? 'Loading…' : 'Older events'}
              </Button>
            </li>
          ) : null}
        </ol>
      )}
    </div>
  )
}
