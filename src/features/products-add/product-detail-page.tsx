/**
 * Product detail (hi-fi p17) with tabs Overview, Variants, Media, Content, Marketplaces, Validation
 * and Activity (`?tab=`). Reads:
 *   GET /products/{id}                       the product (exact number literals kept)
 *   GET /products (walk)                     its variants (parent_product_id) and parent
 *   GET /listings?product_id=…               its listing per marketplace
 *   GET /issues?status=open (walk)           open issues of those listings
 *   GET /issues?status=auto_fixed&listing_id= what Kuinn fixed on each listing's current version
 *   GET /listings/{id}                       validation summary (Validation tab)
 *   GET /listings/{id}/history               per-listing history (Activity tab)
 * Writes: POST /listings/generate ("List on …", AddMarketplaceDialog); image upload in the Media tab.
 */
import { useQueries } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { isNotFound } from '@/api/errors'
import { Page } from '@/components/app/page-header'
import {
  ComingSoon,
  AttentionCard,
  CardHead,
  CONCEPT_ICON,
  DashedCard,
  Icon,
  IconGlyph,
  LaCard,
  MARKETPLACES,
  MarketplaceName,
  NOT_YET,
  StatusChip,
  TagChip,
  UnavailableButton,
  VariantCell,
  type MarketplaceInfo,
} from '@/components/la'
import { EmptyState } from '@/components/states/empty-state'
import { ErrorState } from '@/components/states/error-state'
import { NotFound } from '@/components/states/not-found'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ProductImagesCard } from '@/features/analytics-images/images/images-card'
import { useFixCounts } from '@/features/home-inbox/api'
import { AutoFixedChip } from '@/features/listing-flow/auto-fix'
import { listingDetailQuery, useListingHistory } from '@/features/listings/api'
import { recallJob } from '@/features/listings/job-memory'
import { historyLabel, isBusy } from '@/features/listings/model'
import { draftClosedReason, draftOpen } from '@/features/marketplaces/meta'
import { useProduct, type ProductDetail } from '@/features/products/api'
import { RelativeTime } from '@/features/products/format'
import { Can, OP_ACTION, useCan } from '@/lib/permissions'
import { useKeys } from '@/lib/query-keys'
import { cn } from '@/lib/utils'
import { AddMarketplaceDialog } from './add-marketplace-dialog'
import { useAllListings, useAllProducts, useOpenIssues } from './catalog'
import {
  cellChip,
  firstListable,
  humanizeSlug,
  variantAxis,
  matrixKey,
  OVERALL_CHIP,
  overallStatus,
  shortId,
  variantMatrix,
  type Listing,
  type Marketplace,
  type Product,
} from './catalog-model'
import { useConnectedMarketplaces } from './list-on'
import { ProductDetailsCard, ProductDetailsEditor } from './product-details'
import { useProductEditSession, type ProductEditSession } from './product-edit-session'
import { manufacturerSource } from '@/features/products/edit-model'
import { DETAIL_TABS, type DetailTab } from './detail-tabs'
import { ProductThumb } from './products-page'
import { marketplaceLink } from '@/features/listings/external-link'
import { recategorizeState } from '@/features/products/recategorize'
import { ChangeCategoryButton } from '@/features/products/recategorize-dialog'
import { isNotBuyable, NOT_BUYABLE_NEXT } from '@/lib/listing-chip'

const TAB_LABEL: Record<DetailTab, string> = {
  overview: 'Overview',
  variants: 'Variants',
  media: 'Media',
  content: 'Content',
  marketplaces: 'Marketplaces',
  validation: 'Validation',
  activity: 'Activity',
}

/** Same frame as the loaded page (header, tabs, the deep-linked tab's body) so nothing jumps. */
function DetailSkeleton({ tab }: { tab: DetailTab }) {
  return (
    <Page>
      <div aria-busy="true" aria-label="Loading product">
        <div className="flex flex-col gap-4 pb-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3.5">
            <Skeleton className="size-16 shrink-0 rounded-card" />
            <div className="flex min-w-0 flex-col gap-2">
              <Skeleton className="h-7 w-72 max-w-full" />
              <Skeleton className="h-4 w-56 max-w-full" />
            </div>
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 w-24 rounded-control" />
            <Skeleton className="h-9 w-24 rounded-control" />
          </div>
        </div>
        <div className="mb-5 flex h-[42px] items-center gap-6 overflow-hidden border-b border-line">
          {DETAIL_TABS.map((t) => (
            // Each bar about as wide as its label, so the real tabs land where the bars were.
            <Skeleton key={t} className="h-4 shrink-0" style={{ width: `${TAB_LABEL[t].length * 0.5 + 0.5}rem` }} />
          ))}
        </div>
        <DetailSkeletonBody tab={tab} />
      </div>
    </Page>
  )
}

function DetailSkeletonBody({ tab }: { tab: DetailTab }) {
  switch (tab) {
    case 'overview':
      return (
        <div className="flex flex-col gap-4">
          <PendingSupportedGrid />
          <MoreMarketplaces />
          <div className="grid gap-4 lg:grid-cols-2">
            <Skeleton className="h-56 rounded-card" />
            <Skeleton className="h-56 rounded-card" />
          </div>
        </div>
      )
    case 'marketplaces':
      return (
        <div className="flex flex-col gap-4">
          <PendingSupportedGrid detailed />
          <MoreMarketplaces />
        </div>
      )
    case 'media':
      return (
        <div className="max-w-4xl">
          <ImagesCardSkeleton />
        </div>
      )
    case 'variants':
      return (
        <LaCard pad="none" className="overflow-hidden">
          <div className="p-5">
            <CardHead title="Variants" sub="Each size and colour you make, as its own SKU. The colour is in each variant’s SKU." />
          </div>
          <VariantRowsSkeleton />
        </LaCard>
      )
    case 'content':
    case 'validation':
    case 'activity':
      return <TabCardsSkeleton />
  }
}

function PendingSupportedGrid({ detailed }: { detailed?: boolean }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {SUPPORTED.map((m) => (
        <PendingMarketplaceCard key={m.id} m={m} detailed={detailed} />
      ))}
    </div>
  )
}

/** The Media tab's images card while the product loads: head, drop zone, two image rows. */
function ImagesCardSkeleton() {
  return (
    <Card className="gap-0 py-0" aria-busy="true" aria-label="Loading images">
      <CardHeader className="flex h-12 flex-row items-center justify-between gap-3 border-b py-0 [.border-b]:pb-0">
        <CardTitle>Images</CardTitle>
      </CardHeader>
      <div className="flex flex-col gap-3 p-4 sm:p-5">
        <Skeleton className="h-9 w-40 rounded-control" />
        <Skeleton className="min-h-28 rounded-lg" />
      </div>
      <ul className="divide-y divide-border/70 border-t">
        {[0, 1].map((i) => (
          <li key={i} className="flex min-h-16 items-center gap-3 px-5 py-3">
            <Skeleton className="size-10 shrink-0 rounded-md" />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-56 max-w-full" />
            </div>
            <Skeleton className="h-[22px] w-20 shrink-0 rounded-full" />
          </li>
        ))}
      </ul>
    </Card>
  )
}

/** Three table rows at the variants table's real row height. */
function VariantRowsSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading variants">
      <div className="h-[38px] bg-sunken" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex h-12 items-center gap-6 border-t border-line px-5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-8" />
          <Skeleton className="ml-auto hidden h-3 w-14 sm:block" />
        </div>
      ))}
    </div>
  )
}

/** Skeleton for inside text (a <p>, a link): a span, so the markup stays valid. */
function InlineSkeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cn('skeleton inline-block rounded-md bg-subtle align-middle', className)} />
}

/** A tab's cards while its listings load: two card-shaped placeholders. */
function TabCardsSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2" aria-busy="true" aria-label="Loading">
      {[0, 1].map((i) => (
        <LaCard key={i} className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <Skeleton className="h-6 w-28" />
            <Skeleton className="h-[22px] w-20 rounded-full" />
          </div>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="mt-1 h-[30px] w-28 rounded-control" />
        </LaCard>
      ))}
    </div>
  )
}

interface DetailData {
  product: ProductDetail
  parent: Product | null
  variants: Product[]
  listings: Partial<Record<Marketplace, Listing>>
  issuesByListing: Map<string, number>
  /** Fixes Kuinn made on each listing's current version. A failed read counts none (the chip is extra). */
  autoFixByListing: Map<string, number>
  /** The fix counts are still on their first read: the cards hold their placeholders. */
  autoFixPending: boolean
  listingsPending: boolean
  /** The listings read failed with nothing loaded: whether the product has one is unknown. */
  listingsFailed: boolean
  retryListings: () => void
  /** Open issues: counts show only when 'ready', 'Unknown' on 'error'. */
  issuesState: 'pending' | 'error' | 'ready'
  /** The product walk that finds variants and the parent; nothing says "no variants" before it lands. */
  variantsPending: boolean
  variantsError: unknown
  retryVariants: () => void
  isVariant: boolean
}

const NO_LISTINGS: Listing[] = []

export function ProductDetailPage({ productId, tab }: { productId: string; tab: DetailTab }) {
  const q = useProduct(productId)
  const all = useAllProducts()
  const listingsQ = useAllListings({ productId })
  const issuesQ = useOpenIssues()
  // Fix counts per listing (current version); a listing re-read keeps the same rows array.
  const autoFix = useFixCounts(listingsQ.data?.rows ?? NO_LISTINGS)
  const refetchAll = all.refetch
  const refetchListings = listingsQ.refetch
  const tabsRef = useRef<HTMLDivElement>(null)

  // Keep the active tab in view when the row scrolls sideways (phones). 'nearest' never moves the page.
  useEffect(() => {
    tabsRef.current?.querySelector<HTMLElement>('[data-state="active"]')?.scrollIntoView?.({ inline: 'nearest', block: 'nearest' })
  }, [tab])

  const data = useMemo<DetailData | null>(() => {
    if (!q.data) return null
    const p = q.data
    const rows = all.data?.rows ?? []
    const listings: Partial<Record<Marketplace, Listing>> = {}
    for (const l of listingsQ.data?.rows ?? []) {
      const prev = listings[l.marketplace]
      if (!prev || Date.parse(l.updated_at) > Date.parse(prev.updated_at)) listings[l.marketplace] = l
    }
    const issuesByListing = new Map<string, number>()
    for (const i of issuesQ.data?.rows ?? []) issuesByListing.set(i.listing_id, (issuesByListing.get(i.listing_id) ?? 0) + 1)
    return {
      product: p,
      parent: p.parent_product_id ? (rows.find((r) => r.id === p.parent_product_id) ?? null) : null,
      variants: rows.filter((r) => r.parent_product_id === p.id),
      listings,
      issuesByListing,
      autoFixByListing: autoFix.counts,
      autoFixPending: autoFix.pending,
      listingsPending: listingsQ.isPending,
      listingsFailed: !listingsQ.data && !!listingsQ.error,
      retryListings: () => void refetchListings(),
      issuesState: issuesQ.data ? 'ready' : issuesQ.error ? 'error' : 'pending',
      variantsPending: all.isPending,
      variantsError: all.data ? null : all.error,
      retryVariants: () => void refetchAll(),
      isVariant: !!p.parent_product_id,
    }
  }, [q.data, all.data, all.isPending, all.error, refetchAll, listingsQ.data, listingsQ.isPending, listingsQ.error, refetchListings, issuesQ.data, issuesQ.error, autoFix])

  if (q.isPending) return <DetailSkeleton tab={tab} />
  if (q.error || !data) {
    if (isNotFound(q.error) || (q.error && q.error.status === 422))
      return (
        <Page>
          <NotFound title="Product not found" description="There is no product with this ID in this brand." backTo="/products" backLabel="Back to products" />
        </Page>
      )
    return (
      <Page>
        <LaCard pad="none">
          <ErrorState error={q.error} title="Couldn’t load this product" onRetry={() => void q.refetch()} />
        </LaCard>
      </Page>
    )
  }

  return <LoadedDetail key={data.product.id} data={data} tab={tab} tabsRef={tabsRef} />
}

/**
 * The page once the product is loaded. The product editor's draft lives here, above the tabs,
 * so switching tabs while editing keeps it.
 */
function LoadedDetail({ data, tab, tabsRef }: { data: DetailData; tab: DetailTab; tabsRef: React.RefObject<HTMLDivElement | null> }) {
  const navigate = useNavigate()
  const can = useCan()
  const canEdit = can(OP_ACTION['PATCH /products/{product_id}'])
  const productId = data.product.id
  // A variant's manufacturer may be its style's: read the style (lists carry no manufacturer).
  const parentQ = useProduct(data.product.parent_product_id)
  const source = manufacturerSource(data.product, data.isVariant ? parentQ.data : null)
  const session = useProductEditSession(data.product, data.isVariant, source, !data.isVariant && data.variants.length > 0, data.variants)
  const editing = session.editing
  const p = data.product
  const overall = OVERALL_CHIP[overallStatus(Object.values(data.listings))]
  // The header's one primary action: the first listing a person has to look at, if any.
  const review = data.listingsPending ? undefined : listingsIn(data).find(needsReview)
  const setTab = (t: string) =>
    void navigate({ to: '/products/$productId', params: { productId }, search: t === 'overview' ? {} : { tab: t as DetailTab }, replace: true })

  return (
    <Page>
      <header className="flex flex-col gap-4 pb-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3.5">
          <ProductThumb size={64} className="shrink-0 rounded-card" />
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <h1 className="truncate font-display text-h1 text-ink" data-testid="product-title">
                {p.title}
              </h1>
              {data.isVariant ? null : data.listingsPending ? (
                <Skeleton className="h-[22px] w-20 shrink-0 rounded-full" />
              ) : (
                <StatusChip status={overall.status} className="shrink-0">
                  {overall.label}
                </StatusChip>
              )}
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-body text-ink-2">
              <span data-testid="product-sku">{p.sku}</span>
              <span aria-hidden>·</span>
              <span data-testid="product-category">{humanizeSlug(p.category)}</span>
              {data.isVariant ? null : data.variantsPending ? (
                <>
                  <span aria-hidden>·</span>
                  <InlineSkeleton className="h-4 w-20" />
                </>
              ) : data.variants.length ? (
                <>
                  <span aria-hidden>·</span>
                  <span>
                    {data.variants.length} {data.variants.length === 1 ? 'variant' : 'variants'}
                  </span>
                </>
              ) : null}
              {data.isVariant ? (
                <>
                  <span aria-hidden>·</span>
                  <span>
                    Variant of{' '}
                    <Link to="/products/$productId" params={{ productId: p.parent_product_id! }} className="font-semibold text-brand hover:underline">
                      {data.variantsPending ? (
                        <InlineSkeleton className="h-4 w-20" />
                      ) : (
                        (data.parent?.sku ?? 'its style')
                      )}
                    </Link>
                  </span>
                </>
              ) : null}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canEdit && !editing ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setTab('overview')
                session.start()
              }}
              data-testid="header-edit"
            >
              <IconGlyph icon={CONCEPT_ICON.edit} size={16} />
              Edit
            </Button>
          ) : null}
          {review ? (
            <Button asChild data-testid="header-review">
              <Link to="/listings/$listingId/review" params={{ listingId: review.id }}>
                Review {marketplaceName(review.marketplace)}
              </Link>
            </Button>
          ) : null}
          <HeaderListOn data={data} variant={review ? 'secondary' : 'primary'} />
        </div>
      </header>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList ref={tabsRef} variant="line" aria-label="Product sections">
          {DETAIL_TABS.map((t) => (
            <TabsTrigger key={t} value={t} data-testid={`tab-${t}`}>
              {TAB_LABEL[t]}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="overview">
          <OverviewTab data={data} session={session} onEdit={canEdit ? session.start : undefined} />
        </TabsContent>
        <TabsContent value="variants">
          <VariantsTab data={data} />
        </TabsContent>
        <TabsContent value="media">
          <div className="max-w-4xl">
            <ProductImagesCard product={p} />
          </div>
        </TabsContent>
        <TabsContent value="content">
          <ContentTab data={data} />
        </TabsContent>
        <TabsContent value="marketplaces">
          <MarketplaceCards data={data} detailed />
        </TabsContent>
        <TabsContent value="validation">
          <ValidationTab data={data} />
        </TabsContent>
        <TabsContent value="activity">
          <ActivityTab data={data} />
        </TabsContent>
      </Tabs>
    </Page>
  )
}

/* ---------------------------------------------------------------------------------------------- */

/** One key column for every key-value list on this page, so values line up across cards. */
const KV_GRID = 'grid grid-cols-[minmax(96px,max-content)_minmax(0,1fr)] items-baseline gap-x-3 gap-y-2'

function KV({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className={cn('mt-3 text-small', KV_GRID)}>
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="whitespace-nowrap text-ink-2">{k}</dt>
          <dd className="min-w-0 truncate text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Card action row: pinned to the card's bottom so buttons line up across a grid row. */
const CARD_ACTIONS = 'mt-auto flex flex-wrap gap-2 pt-3'
const CARD_FRAME = 'flex h-full flex-col'

/**
 * The first supported marketplace this product has no listing on, if the user may start one.
 * Flipkart only once it is connected (marketplaces/meta `draftOpen`).
 */
function useFirstUnlisted(data: DetailData): MarketplaceInfo | 'pending' | null {
  const can = useCan()
  const { connected } = useConnectedMarketplaces()
  if (!can('listing:generate') || data.isVariant) return null
  if (data.listingsPending || connected === null) return 'pending'
  const id = firstListable(data.listings, connected)
  return id ? (MARKETPLACES.find((m) => m.id === id) ?? null) : null
}

/** A listing that waits for a person: needs review, blocked, or ready to approve. */
function needsReview(l: Listing): boolean {
  const s = cellChip(l).status
  return s === 'needs-you' || s === 'blocked' || l.status === 'validated'
}

const SUPPORTED = MARKETPLACES.filter((m) => m.supported)
const UNSUPPORTED = MARKETPLACES.filter((m) => !m.supported)
const marketplaceName = (id: Marketplace) => MARKETPLACES.find((m) => m.id === id)?.name ?? id

function HeaderListOn({ data, variant = 'primary' }: { data: DetailData; variant?: 'primary' | 'secondary' }) {
  const first = useFirstUnlisted(data)
  const [open, setOpen] = useState(false)
  if (first === 'pending') return <Skeleton className="h-9 w-32 rounded-control" />
  if (!first) return null
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)} data-testid="header-list-on">
        List on {first.name}
      </Button>
      {open ? (
        <AddMarketplaceDialog
          open
          onOpenChange={setOpen}
          products={[data.product]}
          listingsOf={() => data.listings}
          initial={[first.id as Marketplace]}
        />
      ) : null}
    </>
  )
}

function MarketplaceCards({ data, detailed }: { data: DetailData; detailed?: boolean }) {
  const can = useCan()
  const { connected } = useConnectedMarketplaces()
  const [adding, setAdding] = useState<Marketplace | null>(null)
  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 md:grid-cols-2" data-testid="marketplace-cards">
          {SUPPORTED.map((m) => (
            <MarketplaceCard
              key={m.id}
              m={m}
              data={data}
              detailed={detailed}
              onList={can('listing:generate') && !data.isVariant ? setAdding : null}
              connected={connected}
            />
          ))}
        </div>
        <MoreMarketplaces />
      </div>
      {adding ? (
        <AddMarketplaceDialog
          open
          onOpenChange={(v) => {
            if (!v) setAdding(null)
          }}
          products={[data.product]}
          listingsOf={() => data.listings}
          initial={[adding]}
        />
      ) : null}
    </>
  )
}

/**
 * Marketplaces not supported yet, one quiet row each (DESIGN p17 keeps every marketplace, its chip
 * and its waitlist control). No data needed, so the loading frame shows the same strip.
 */
export function MoreMarketplaces() {
  return (
    <DashedCard pad="sm" data-testid="more-marketplaces">
      <h3 className="text-small font-semibold text-ink">More marketplaces</h3>
      <ul className="mt-2 grid gap-x-6 md:grid-cols-2">
        {UNSUPPORTED.map((m) => (
          <li key={m.id} className="flex min-h-11 items-center justify-between gap-3 border-b border-line py-1.5 last:border-b-0 md:[&:nth-last-child(2):nth-child(odd)]:border-b-0">
            <MarketplaceName id={m.id} size="xs" className="gap-2 text-small" />
            {m.id === 'meesho' ? (
              // On the roadmap (client input, 8 Nov): the same "Coming soon" as the Sell on list.
              <span className="flex shrink-0 items-center" data-testid="more-marketplaces-soon-meesho">
                <ComingSoon />
              </span>
            ) : (
              <span className="flex shrink-0 items-center gap-3">
                <StatusChip status="not-listed">Not available</StatusChip>
                <UnavailableButton variant="link" size="xs" reason={NOT_YET.waitlist}>
                  Join waitlist
                </UnavailableButton>
              </span>
            )}
          </li>
        ))}
      </ul>
    </DashedCard>
  )
}

/** A supported marketplace while its listing loads: the real header, then placeholders at card height. */
function PendingMarketplaceCard({ m, detailed }: { m: MarketplaceInfo; detailed?: boolean }) {
  return (
    <LaCard pad="sm" className={CARD_FRAME} aria-busy="true">
      <div className="flex items-center justify-between gap-2">
        <MarketplaceName id={m.id} />
        <Skeleton className="h-[22px] w-20 rounded-full" />
      </div>
      {detailed ? (
        <div className="mt-3 flex flex-col gap-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className={cn('h-4', i % 2 ? 'w-3/4' : 'w-full')} />
          ))}
        </div>
      ) : (
        <Skeleton className="mt-3.5 h-3 w-48 max-w-full" />
      )}
      <div className={CARD_ACTIONS}>
        <Skeleton className="h-[30px] w-28 rounded-control" />
      </div>
    </LaCard>
  )
}

function MarketplaceCard({
  m,
  data,
  detailed,
  onList,
  connected,
}: {
  m: MarketplaceInfo
  data: DetailData
  detailed?: boolean
  onList: ((m: Marketplace) => void) | null
  /** Connected marketplaces; null while loading. Flipkart drafts wait for a connection. */
  connected: readonly Marketplace[] | null
}) {
  const id = m.id as Marketplace
  // Chip, issues and actions land together.
  if (data.listingsPending || data.issuesState === 'pending' || data.autoFixPending) return <PendingMarketplaceCard m={m} detailed={detailed} />
  const l = data.listings[id]
  if (!l) {
    return (
      <DashedCard pad="sm" className={CARD_FRAME}>
        <div className="flex items-center justify-between gap-2">
          <MarketplaceName id={m.id} />
          <StatusChip status="not-listed" />
        </div>
        <p className="mt-3 text-small text-ink-2">
          {data.isVariant ? 'Variants are listed through their style.' : 'No listing drafted for this product yet.'}
        </p>
        {onList ? (
          <div className={CARD_ACTIONS}>
            {draftOpen(id, connected) ? (
              <Button variant="secondary" size="sm" onClick={() => onList(id)} data-testid={`list-on-${id}`}>
                List on {m.name}
              </Button>
            ) : connected === null ? (
              // Accounts still loading: same button, held, so the card never changes size.
              <Button variant="secondary" size="sm" disabled data-testid={`list-on-${id}`}>
                List on {m.name}
              </Button>
            ) : (
              <UnavailableButton variant="secondary" size="sm" reason={draftClosedReason(id)} data-testid={`list-on-${id}`}>
                List on {m.name}
              </UnavailableButton>
            )}
          </div>
        ) : null}
      </DashedCard>
    )
  }
  const chip = cellChip(l)
  const issues = data.issuesByListing.get(l.id) ?? 0
  const fixed = data.autoFixByListing.get(l.id) ?? 0
  const issuesText =
    data.issuesState === 'error' ? (
      <span title="Couldn’t load issues.">Unknown</span>
    ) : (
      `${issues} open`
    )
  const live = l.marketplace_state === 'live' || l.marketplace_state === 'partially_live'
  const notBuyable = isNotBuyable(l)
  const link = live || notBuyable ? marketplaceLink(l) : null
  const busy = isBusy(l.status)
  const runJob = busy ? recallJob(l.id) : null
  const Frame = chip.status === 'needs-you' || chip.status === 'blocked' ? AttentionCard : LaCard
  const viewLive =
    link ? (
      <a
        href={link.href}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 font-semibold text-brand hover:underline"
        data-testid={`marketplace-link-${id}`}
      >
        {link.idLabel ?? (live ? 'View live' : `Open on ${m.name}`)}
        <span className="sr-only"> (opens in a new tab)</span>
        <Icon name="external" size={14} />
      </a>
    ) : null
  return (
    <Frame pad="sm" className={CARD_FRAME} data-testid={`marketplace-card-${id}`}>
      <div className="flex items-center justify-between gap-2">
        <MarketplaceName id={m.id} />
        <span title={`Listing ${l.id}`} className="shrink-0">
          <StatusChip status={chip.status}>{chip.label}</StatusChip>
        </span>
      </div>
      {detailed ? (
        <KV
          rows={[
            ['Listing', <span key="l" title={l.id}>{shortId(l.id)}</span>],
            ...(busy ? [] : ([['Link', viewLive ?? 'Not yet']] as [string, ReactNode][])),
            ['Updated', <RelativeTime key="s" iso={l.status_changed_at} />],
            ['Issues', issuesText],
            ...(fixed ? ([['Fixed for you', <AutoFixedChip key="f" listingId={l.id} count={fixed} />]] as [string, ReactNode][]) : []),
            ...(l.status_reason ? ([['Reason', l.status_reason]] as [string, ReactNode][]) : []),
          ]}
        />
      ) : (
        <p className="mt-3 flex flex-wrap items-center gap-x-1.5 text-caption text-ink-2">
          <span>
            Updated <RelativeTime iso={l.status_changed_at} />
          </span>
          <span aria-hidden>·</span>
          {data.issuesState === 'error' ? (
            <span title="Couldn’t load issues.">Issues unknown</span>
          ) : (
            <span className="tabular-nums">
              {issues} open {issues === 1 ? 'issue' : 'issues'}
            </span>
          )}
          {fixed ? (
            <>
              <span aria-hidden>·</span>
              <AutoFixedChip listingId={l.id} count={fixed} />
            </>
          ) : null}
          {viewLive ? (
            <>
              <span aria-hidden>·</span>
              {viewLive}
            </>
          ) : null}
        </p>
      )}
      {notBuyable && !busy ? (
        <p className="mt-3 text-small text-pretty text-ink-2" data-testid={`not-buyable-${id}`}>
          {id === 'amazon' ? NOT_BUYABLE_NEXT : `${m.name} has the product page but is not selling it yet.`}
        </p>
      ) : null}
      {busy ? (
        <p className="mt-3 flex items-center gap-2 text-small text-ink-2">
          <Spinner className="size-3.5 shrink-0 text-brand" aria-hidden />
          {l.status === 'publishing' ? `Sending to ${m.name}…` : 'The agent is drafting this listing.'}
        </p>
      ) : null}
      <div className={CARD_ACTIONS}>
        {busy ? (
          runJob ? (
            <Button variant="secondary" size="sm" asChild>
              <Link to="/runs/$runId" params={{ runId: runJob }}>
                See progress
              </Link>
            </Button>
          ) : (
            <Button variant="secondary" size="sm" asChild>
              <Link to="/listings/$listingId/review" params={{ listingId: l.id }}>
                See progress
              </Link>
            </Button>
          )
        ) : chip.status === 'needs-you' ? (
          <Button variant="warn" size="sm" asChild>
            <Link to="/listings/$listingId/review" params={{ listingId: l.id }}>
              Review
            </Link>
          </Button>
        ) : (
          <Button variant="secondary" size="sm" asChild>
            <Link to="/listings/$listingId/review" params={{ listingId: l.id }}>
              Open listing
            </Link>
          </Button>
        )}
        {detailed ? (
          <>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/listings/$listingId/mapping" params={{ listingId: l.id }}>
                Field mapping
              </Link>
            </Button>
            {live ? (
              <Button variant="ghost" size="sm" asChild>
                <Link to="/listings/$listingId/live" params={{ listingId: l.id }}>
                  Live status
                </Link>
              </Button>
            ) : null}
          </>
        ) : (
          <Button variant="ghost" size="sm" asChild>
            <Link to="/products/$productId" params={{ productId: data.product.id }} search={{ tab: 'marketplaces' }}>
              Details
            </Link>
          </Button>
        )}
      </div>
    </Frame>
  )
}

/** SI12 "Sell on" for a saved product: the marketplaces it has a listing on, and the connected ones. */
function useSellOn(data: DetailData): Marketplace[] {
  const { connected } = useConnectedMarketplaces()
  return (['amazon', 'flipkart'] as const).filter((m) => !!data.listings[m] || !!connected?.includes(m))
}

function OverviewTab({ data, session, onEdit }: { data: DetailData; session: ProductEditSession; onEdit?: () => void }) {
  const sellOn = useSellOn(data)
  if (session.editing)
    return (
      <div className="max-w-4xl">
        <ProductDetailsEditor
          session={session}
          categoryLock={data.listingsPending ? 'pending' : data.listingsFailed ? 'unknown' : listingsIn(data).length ? 'locked' : 'open'}
          onRetryCategoryLock={data.retryListings}
          sellOn={sellOn}
        />
      </div>
    )
  return (
    <div className="flex flex-col gap-4">
      <MarketplaceCards data={data} />
      <div className="grid gap-4 lg:grid-cols-2">
        <ProductDetailsCard
          product={data.product}
          isVariant={data.isVariant}
          isStyle={session.isStyle}
          variants={data.variants}
          source={session.source}
          sellOn={sellOn}
          onEdit={onEdit}
          categoryAction={
            // SI9: offered only by a backend that has it (its product read carries photo_read), to
            // people who edit products, once the product has listings (before that, Edit changes it).
            onEdit && 'photo_read' in data.product && !data.isVariant && !data.listingsPending && !data.listingsFailed ? (
              <ChangeCategoryButton productId={data.product.id} current={data.product.category} state={recategorizeState(listingsIn(data))} />
            ) : null
          }
        />
        <VariantStatusCard data={data} />
      </div>
    </div>
  )
}

function VariantStatusCard({ data }: { data: DetailData }) {
  const matrix = useMemo(() => variantMatrix(data.variants), [data.variants])
  return (
    <LaCard data-testid="product-family">
      <CardHead title={data.isVariant ? 'Family' : 'Variants'} />
      {data.isVariant ? (
        <div className="mt-4" data-testid="parent-link">
          <p className="text-small text-ink-2">This product is a variant. Its style holds the listing for the family.</p>
          <Button variant="secondary" size="sm" className="mt-3" asChild>
            <Link to="/products/$productId" params={{ productId: data.product.parent_product_id! }}>
              Open {data.variantsPending ? <InlineSkeleton className="h-3 w-16" /> : (data.parent?.sku ?? 'the style')}
            </Link>
          </Button>
        </div>
      ) : data.variantsPending ? (
        <div className="mt-4 grid grid-cols-4 gap-1.5" aria-busy="true" aria-label="Loading variants">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-9 rounded-lg" />
          ))}
        </div>
      ) : data.variantsError ? (
        <ErrorState error={data.variantsError} title="Couldn’t load variants" compact onRetry={data.retryVariants} className="mt-2" />
      ) : data.variants.length === 0 ? (
        <p className="mt-4 text-small text-ink-2" data-testid="no-parent">
          No variants. This product is listed as a single item.
        </p>
      ) : (
        <>
          {matrix.cells.size ? (
            <div
              role="grid"
              aria-label="Variants by colour and size"
              className="mt-4 grid items-center gap-1.5 overflow-x-auto"
              style={{ gridTemplateColumns: `minmax(64px, max-content) repeat(${matrix.sizes.length}, minmax(44px, 1fr))` }}
            >
              <div role="row" className="contents">
                <span role="columnheader">
                  <span className="sr-only">Colour</span>
                </span>
                {matrix.sizes.map((s) => (
                  <b key={s} role="columnheader" className="text-center text-small text-ink">
                    {s}
                  </b>
                ))}
              </div>
              {matrix.colours.map((c) => (
                <div key={c ?? ''} role="row" className="contents">
                  <b role="rowheader" className="truncate text-small text-ink" title={c ?? undefined}>
                    {c ?? 'Size'}
                  </b>
                  {matrix.sizes.map((s) => {
                    const v = matrix.cells.get(matrixKey(c, s))
                    return (
                      <div key={s} role="gridcell" className="min-w-0">
                        {v ? (
                          <Link
                            to="/products/$productId"
                            params={{ productId: v.id }}
                            className="focus-ring block min-w-0 rounded-lg"
                            aria-label={`${c ? `${c} ` : ''}${s}: ${v.sku}`}
                          >
                            <VariantCell className="hover:bg-subtle">{v.sku.startsWith(`${data.product.sku}-`) ? v.sku.slice(data.product.sku.length + 1) : v.sku}</VariantCell>
                          </Link>
                        ) : (
                          <VariantCell unavailable label={`${c ? `${c} ` : ''}${s}: not made`} />
                        )}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          ) : null}
          {matrix.loose.length ? (
            <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Variants" data-testid="variant-list">
              {matrix.loose.map((v) => {
                const size = variantAxis(v, 'size')
                return (
                  <li key={v.id}>
                    <Link to="/products/$productId" params={{ productId: v.id }} className="focus-ring inline-flex rounded-lg" aria-label={`${v.sku}${size ? `, size ${size}` : ''}`}>
                      <VariantCell className="px-2.5 hover:bg-subtle">{v.sku}</VariantCell>
                    </Link>
                  </li>
                )
              })}
            </ul>
          ) : null}
          <p className="mt-3 text-caption text-ink-2">
            {data.variants.length} {data.variants.length === 1 ? 'variant' : 'variants'}. Marketplace status per variant is not available yet; each listing covers the whole family.
          </p>
        </>
      )}
    </LaCard>
  )
}

function VariantsTab({ data }: { data: DetailData }) {
  // SI8 sends each variant's own colour (variant_attributes); older backends only the size.
  const hasColour = data.variants.some((v) => variantAxis(v, 'color'))
  if (data.isVariant) return <VariantStatusCard data={data} />
  return (
    <LaCard pad="none" className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 p-5">
        <CardHead title="Variants" sub={hasColour ? 'Each size and colour you make, as its own SKU.' : 'Each size and colour you make, as its own SKU. The colour is in each variant’s SKU.'} />
        <Can action="product:import">
          <Button variant="secondary" size="sm" asChild>
            <Link to="/add/variants" search={{ product: data.product.id }}>
              Add variants
            </Link>
          </Button>
        </Can>
      </div>
      {data.variantsPending ? (
        <VariantRowsSkeleton />
      ) : data.variantsError ? (
        <ErrorState error={data.variantsError} title="Couldn’t load variants" compact onRetry={data.retryVariants} />
      ) : data.variants.length === 0 ? (
        <EmptyState icon="grid" title="No variants" description="Add sizes and colours with the variants step." compact />
      ) : (
        <table className="w-full text-small" aria-label="Variants">
          <thead>
            <tr className="h-[38px] bg-sunken text-left text-caption font-bold text-ink-2">
              <th className="px-5">SKU</th>
              {hasColour ? <th className="px-3">Colour</th> : null}
              <th className="px-3">Size</th>
              <th className="hidden px-3 sm:table-cell">Updated</th>
            </tr>
          </thead>
          <tbody>
            {data.variants.map((v) => (
              <tr key={v.id} className="h-12 border-t border-line">
                <td className="px-5">
                  <Link to="/products/$productId" params={{ productId: v.id }} className="font-semibold text-ink hover:underline">
                    {v.sku}
                  </Link>
                </td>
                {hasColour ? <td className="px-3">{variantAxis(v, 'color') ?? '—'}</td> : null}
                <td className="px-3">{variantAxis(v, 'size') ?? '—'}</td>
                <td className="hidden px-3 sm:table-cell">
                  <RelativeTime iso={v.updated_at} className="text-ink-2" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </LaCard>
  )
}

function listingsIn(data: DetailData): Listing[] {
  return (['amazon', 'flipkart'] as const).flatMap((m) => (data.listings[m] ? [data.listings[m]!] : []))
}

function NoListings({ data }: { data: DetailData }) {
  return (
    <LaCard pad="none">
      <EmptyState
        icon="store"
        title={data.isVariant ? 'Listed through its style' : 'No listings yet'}
        description={data.isVariant ? 'Open the style to see its listings.' : 'Start a draft with “List on …” on the Overview tab.'}
        compact
      />
    </LaCard>
  )
}

function ContentTab({ data }: { data: DetailData }) {
  const ls = listingsIn(data)
  if (data.listingsPending) return <TabCardsSkeleton />
  if (!ls.length) return <NoListings data={data} />
  return (
    <div className="flex flex-col gap-3">
      <p className="text-small text-ink-2">Title, bullets and description are written per marketplace and reviewed before anything is sent.</p>
      <div className="grid gap-4 md:grid-cols-2">
        {ls.map((l) => {
          const chip = cellChip(l)
          return (
            <LaCard key={l.id} className={CARD_FRAME}>
              <div className="flex items-center justify-between gap-2">
                <MarketplaceName id={l.marketplace} />
                <StatusChip status={chip.status}>{chip.label}</StatusChip>
              </div>
              <div className={CARD_ACTIONS}>
                <Button variant="secondary" size="sm" asChild>
                  <Link to="/listings/$listingId/review" params={{ listingId: l.id }}>
                    Open content
                  </Link>
                </Button>
              </div>
            </LaCard>
          )
        })}
      </div>
    </div>
  )
}

type ListingDetailQuery = ReturnType<typeof useListingDetails>[number]

/**
 * Every listing's detail read at once, with the same key and fetcher as useListing, so the cache
 * is shared with the review screen and the cards can land together.
 */
function useListingDetails(listings: readonly Listing[]) {
  const keys = useKeys()
  return useQueries({ queries: listings.map((l) => listingDetailQuery(keys, l.id)) })
}

function ValidationCard({ listing, q, pending }: { listing: Listing; q: ListingDetailQuery; pending: boolean }) {
  const v = q.data?.data.validation
  const clean = !!v && v.passed && v.blocking_count === 0
  return (
    <LaCard className={CARD_FRAME} aria-busy={pending || undefined}>
      <div className="flex items-center justify-between gap-2">
        <MarketplaceName id={listing.marketplace} />
        {pending ? (
          <Skeleton className="h-[22px] w-20 rounded-full" />
        ) : v ? (
          // Green only with real evidence: the checks passed and nothing blocks.
          <StatusChip status={clean ? 'live' : v.passed ? 'draft' : 'error'}>{v.passed ? 'Checks passed' : 'Checks failed'}</StatusChip>
        ) : q.error ? null : (
          <TagChip tone="plain">Not checked</TagChip>
        )}
      </div>
      {pending ? (
        <dl className={cn('mt-3 text-small', KV_GRID)}>
          {['Blocking', 'Warnings'].map((k) => (
            <div key={k} className="contents">
              <dt className="whitespace-nowrap text-ink-2">{k}</dt>
              <dd className="flex min-h-5 items-center">
                <Skeleton className="h-4 w-8" />
              </dd>
            </div>
          ))}
        </dl>
      ) : q.error ? (
        <ErrorState error={q.error} compact onRetry={() => void q.refetch()} />
      ) : v ? (
        <KV
          rows={[
            [
              'Blocking',
              <span key="b" className="tabular-nums" title={`Stages: ${v.stages?.length ?? 0}`}>
                {v.blocking_count}
              </span>,
            ],
            ['Warnings', <span key="w" className="tabular-nums">{v.warning_count}</span>],
          ]}
        />
      ) : (
        <p className="mt-3 text-small text-ink-2">No checks have run on this listing yet.</p>
      )}
      <div className={CARD_ACTIONS}>
        <Button variant="secondary" size="sm" asChild>
          <Link to="/listings/$listingId/review" params={{ listingId: listing.id }}>
            See every check
          </Link>
        </Button>
      </div>
    </LaCard>
  )
}

function ValidationTab({ data }: { data: DetailData }) {
  const ls = data.listingsPending ? [] : listingsIn(data)
  const details = useListingDetails(ls)
  // Cards swap from placeholders to results together, never one by one.
  const pending = details.some((d) => d.isPending)
  return (
    <div className="flex flex-col gap-4">
      <Can action="listing:edit">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-tile border border-line bg-surface px-4 py-3">
          <p className="text-small text-ink-2">Run this product against the current marketplace rules without drafting anything.</p>
          <Button variant="secondary" size="sm" asChild>
            <Link to="/rules/check" search={{ product: data.product.id }} data-testid="check-rules">
              Check against rules
            </Link>
          </Button>
        </div>
      </Can>
      {data.listingsPending ? (
        <TabCardsSkeleton />
      ) : ls.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {ls.map((l, i) => (
            <ValidationCard key={l.id} listing={l} q={details[i]!} pending={pending} />
          ))}
        </div>
      ) : (
        <NoListings data={data} />
      )}
    </div>
  )
}

function HistoryList({
  listing,
  ready,
  fixed,
  onSettled,
}: {
  listing: Listing
  /** Fixes Kuinn made on the current version: a chip to the review's "Fixed for you". */
  fixed: number
  /** Every listing's history has answered; until then all cards show placeholders. */
  ready: boolean
  onSettled: (listingId: string, settled: boolean) => void
}) {
  const h = useListingHistory(listing.id)
  const settled = !h.isPending
  useEffect(() => onSettled(listing.id, settled), [listing.id, settled, onSettled])
  const waiting = !ready || h.isPending
  return (
    <LaCard aria-busy={waiting || undefined}>
      <div className="flex min-h-[22px] items-center justify-between gap-2">
        <MarketplaceName id={listing.marketplace} />
        {waiting ? null : <AutoFixedChip listingId={listing.id} count={fixed} />}
      </div>
      {waiting ? (
        <ol className="mt-3 flex flex-col" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="flex items-center justify-between gap-3 border-b border-line py-2.5 text-small last:border-b-0">
              <Skeleton className={cn('my-0.5 h-4', i % 2 ? 'w-1/2' : 'w-2/3')} />
              <Skeleton className="h-3 w-12 shrink-0" />
            </li>
          ))}
        </ol>
      ) : h.error && !h.data ? (
        <ErrorState error={h.error} compact onRetry={() => void h.refetch()} />
      ) : h.rows.length === 0 ? (
        <p className="mt-3 text-small text-ink-2">No history yet.</p>
      ) : (
        <ol className="mt-3 flex flex-col">
          {h.rows.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 border-b border-line py-2.5 text-small last:border-b-0">
              <span className="min-w-0 truncate text-ink">
                {historyLabel(e.action)}
                <span className="text-ink-2"> · {e.actor_type === 'user' ? 'a person' : e.actor_type === 'system' ? 'the agent' : 'support'}</span>
              </span>
              <RelativeTime iso={e.occurred_at} className="shrink-0 text-caption text-ink-2" />
            </li>
          ))}
        </ol>
      )}
      {!waiting && h.hasNextPage ? (
        <Button variant="ghost" size="sm" className="mt-2" onClick={() => void h.fetchNextPage()} disabled={h.isFetchingNextPage}>
          {h.isFetchingNextPage ? 'Loading…' : 'Load more'}
        </Button>
      ) : null}
    </LaCard>
  )
}

function ActivityTab({ data }: { data: DetailData }) {
  const ls = listingsIn(data)
  const p = data.product
  const [settled, setSettled] = useState<Record<string, boolean>>({})
  const onSettled = useCallback(
    (id: string, v: boolean) => setSettled((prev) => (prev[id] === v ? prev : { ...prev, [id]: v })),
    [],
  )
  const ready = ls.every((l) => settled[l.id]) && !data.autoFixPending
  return (
    <div className="flex flex-col gap-4">
      <LaCard>
        <CardHead title="Product" />
        <KV
          rows={[
            ['Created', <RelativeTime key="c" iso={p.created_at} />],
            ['Updated', <RelativeTime key="u" iso={p.updated_at} />],
          ]}
        />
      </LaCard>
      {data.listingsPending ? (
        <TabCardsSkeleton />
      ) : ls.length ? (
        <div className={cn('grid gap-4', ls.length > 1 && 'md:grid-cols-2')}>
          {ls.map((l) => (
            <HistoryList key={l.id} listing={l} ready={ready} fixed={data.autoFixByListing.get(l.id) ?? 0} onSettled={onSettled} />
          ))}
        </div>
      ) : null}
    </div>
  )
}
