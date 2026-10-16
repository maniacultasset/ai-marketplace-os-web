/**
 * /activity, honest v1. The API has no brand-wide activity feed (DESIGN.md "Not in the API yet"),
 * but every listing keeps its own audit history. So the page says the feed is coming, lists the
 * brand's listings, most recent activity first (GET /listings orders by last_event_at),
 * names each one by its product (GET /products/{id}, cached per product) and opens any listing's real history inline
 * (GET /listings/{id}/history), with a link to its product.
 */
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { Banner } from '@/components/la/banner'
import { LaCard } from '@/components/la/cards'
import { MarketplaceName } from '@/components/la/marketplace'
import { StatusChip } from '@/components/la/status-chip'
import { NOT_YET } from '@/components/la/unavailable'
import { EmptyState } from '@/components/states/empty-state'
import { ErrorState } from '@/components/states/error-state'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { useListingHistory, useListingsList } from '@/features/listings/api'
import { useProduct } from '@/features/products/api'
import { historyLabel, sentence, type Listing } from '@/features/listings/model'
import { formatDateTime, formatRelative } from '@/features/marketplaces/format'
import { useMe } from '@/lib/auth'
import { listingChip } from '@/lib/listing-chip'
import { auditActorLabel } from './model'

export function ActivityView() {
  const list = useListingsList({})

  return (
    <div className="flex flex-col gap-5">
      <div data-testid="activity-coming-soon">
        <Banner tone="neutral" title="Activity across your brand is coming soon">
          <span className="text-ink-2">{NOT_YET.activityFeed} Open a listing below to see what the agent and your team did.</span>
        </Banner>
      </div>

      <section aria-labelledby="listings-activity" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4">
          <h2 id="listings-activity" className="font-display text-h3 text-ink">
            Listing history
          </h2>
          <p className="text-caption text-ink-3">Most recent activity first</p>
        </div>

        {list.error && !list.rows.length ? (
          <LaCard pad="none">
            <ErrorState error={list.error} title="Couldn't load listings" onRetry={() => void list.refetch()} />
          </LaCard>
        ) : list.isPending ? (
          <LaCard pad="none" aria-busy>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3 border-b border-line px-5 py-4 last:border-b-0">
                <Skeleton className="size-7 rounded-[7px]" />
                <Skeleton className="h-4 w-40" />
                <Skeleton className="ml-auto h-[22px] w-24 rounded-full" />
              </div>
            ))}
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

function ListingActivityRow({ listing }: { listing: Listing }) {
  const [open, setOpen] = useState(false)
  const chip = listingChip(listing)
  const panelId = `history-${listing.id}`
  return (
    <li className="border-b border-line last:border-b-0" data-testid="activity-listing">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5">
        <MarketplaceName id={listing.marketplace} size="sm" className="w-32" />
        <div className="order-first min-w-0 basis-full sm:order-none sm:basis-0 sm:flex-1">
          <ListingProductName productId={listing.product_id} />
          <p className="text-caption text-ink-3 sm:truncate">
            {listing.category ? `${sentence(listing.category)} · ` : ''}Status changed{' '}
            <time dateTime={listing.status_changed_at} title={formatDateTime(listing.status_changed_at)}>
              {formatRelative(listing.status_changed_at)}
            </time>
          </p>
        </div>
        <StatusChip status={chip.status}>{chip.label}</StatusChip>
        <div className="flex basis-full items-center gap-1 sm:basis-auto">
          <Button variant="ghost" size="sm" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((o) => !o)}>
            {open ? 'Hide history' : 'Show history'}
          </Button>
          <Button variant="link" size="sm" asChild>
            <Link to="/products/$productId" params={{ productId: listing.product_id }}>
              Open product
            </Link>
          </Button>
        </div>
      </div>
      {open ? <HistoryPanel id={panelId} listingId={listing.id} /> : null}
    </li>
  )
}

/** The product's title and SKU; falls back to a neutral label if the product can't be read. */
function ListingProductName({ productId }: { productId: string }) {
  const product = useProduct(productId)
  if (product.isPending) return <Skeleton className="my-0.5 h-4 w-48" aria-label="Loading product name" />
  if (!product.data) return <p className="truncate text-body text-ink-2">Product name unavailable</p>
  return (
    <p className="text-body text-ink sm:truncate">
      <span className="font-semibold">{product.data.title}</span>
      <span className="ml-2 text-small text-ink-3">SKU {product.data.sku}</span>
    </p>
  )
}

function HistoryPanel({ id, listingId }: { id: string; listingId: string }) {
  const history = useListingHistory(listingId)
  const { data: me } = useMe()
  return (
    <div id={id} className="border-t border-line bg-canvas px-5 py-3">
      {history.error && !history.rows.length ? (
        <ErrorState compact error={history.error} title="Couldn't load this listing's history" onRetry={() => void history.refetch()} />
      ) : history.isPending ? (
        <div className="flex flex-col gap-2 py-1" aria-busy>
          <Skeleton className="h-3.5 w-64" />
          <Skeleton className="h-3.5 w-52" />
        </div>
      ) : history.rows.length === 0 ? (
        <p className="py-1 text-small text-ink-2">Nothing recorded yet. Approvals, edits and submissions appear here.</p>
      ) : (
        <ol className="flex flex-col gap-2" aria-label="History, newest first">
          {history.rows.map((e) => (
            <li key={e.id} className="flex flex-wrap items-baseline gap-x-2 text-small">
              <time dateTime={e.occurred_at} className="w-36 shrink-0 text-ink-3">
                {formatDateTime(e.occurred_at)}
              </time>
              <span className="font-semibold text-ink">{historyLabel(e.action)}</span>
              <span className="text-ink-2">by {auditActorLabel(e, me?.user_id)}</span>
              {e.reason ? <span className="text-ink-2">· {e.reason}</span> : null}
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
