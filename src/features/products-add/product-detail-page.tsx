/**
 * Product detail (hi-fi p17) with tabs Overview, Variants, Media, Content, Marketplaces, Validation
 * and Activity (`?tab=`). Reads:
 *   GET /products/{id}                       the product (exact number literals kept)
 *   GET /products (walk)                     its variants (parent_product_id) and parent
 *   GET /listings?product_id=…               its listing per marketplace
 *   GET /issues?status=open (walk)           open issues of those listings
 *   GET /listings/{id}                       validation summary (Validation tab)
 *   GET /listings/{id}/history               per-listing history (Activity tab)
 * Writes: POST /listings/generate ("List on …", AddMarketplaceDialog); image upload in the Media tab.
 */
import { Link, useNavigate } from '@tanstack/react-router'
import { useMemo, useState, type ReactNode } from 'react'
import { isNotFound } from '@/api/errors'
import { Page } from '@/components/app/page-header'
import {
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
  SourceBadge,
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
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ProductImagesCard } from '@/features/analytics-images/images/images-card'
import { useListing, useListingHistory } from '@/features/listings/api'
import { historyLabel } from '@/features/listings/model'
import { useProduct, type ProductDetail } from '@/features/products/api'
import { formatAttributeValue, RelativeTime } from '@/features/products/format'
import { Can, useCan } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { AddMarketplaceDialog } from './add-marketplace-dialog'
import { useAllListings, useAllProducts, useOpenIssues } from './catalog'
import {
  cellChip,
  humanizeSlug,
  attrText,
  matrixKey,
  OVERALL_CHIP,
  overallStatus,
  shortId,
  variantMatrix,
  type Listing,
  type Marketplace,
  type Product,
} from './catalog-model'
import { ATTR_FIELDS } from './guided-model'
import { ProductThumb } from './products-page'

import { DETAIL_TABS, type DetailTab } from './detail-tabs'
const TAB_LABEL: Record<DetailTab, string> = {
  overview: 'Overview',
  variants: 'Variants',
  media: 'Media',
  content: 'Content',
  marketplaces: 'Marketplaces',
  validation: 'Validation',
  activity: 'Activity',
}

function DetailSkeleton() {
  return (
    <Page>
      <div className="flex items-center gap-3.5 pb-6" aria-busy="true" aria-label="Loading product">
        <Skeleton className="size-16 rounded-card" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-72 max-w-full" />
          <Skeleton className="h-4 w-56" />
        </div>
      </div>
      <Skeleton className="mb-5 h-[42px] w-full" />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-40 rounded-card" />
        ))}
      </div>
    </Page>
  )
}

interface DetailData {
  product: ProductDetail
  parent: Product | null
  variants: Product[]
  listings: Partial<Record<Marketplace, Listing>>
  issuesByListing: Map<string, number>
  listingsPending: boolean
  isVariant: boolean
}

export function ProductDetailPage({ productId, tab }: { productId: string; tab: DetailTab }) {
  const navigate = useNavigate()
  const q = useProduct(productId)
  const all = useAllProducts()
  const listingsQ = useAllListings({ productId })
  const issuesQ = useOpenIssues()

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
      listingsPending: listingsQ.isPending,
      isVariant: !!p.parent_product_id,
    }
  }, [q.data, all.data, listingsQ.data, listingsQ.isPending, issuesQ.data])

  if (q.isPending) return <DetailSkeleton />
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

  const p = data.product
  const overall = OVERALL_CHIP[overallStatus(Object.values(data.listings))]
  const setTab = (t: string) =>
    void navigate({ to: '/products/$productId', params: { productId }, search: t === 'overview' ? {} : { tab: t as DetailTab }, replace: true })

  return (
    <Page>
      <header className="flex flex-col gap-4 pb-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-center gap-3.5">
          <ProductThumb size={64} className="rounded-card" />
          <div className="min-w-0">
            <h1 className="truncate font-display text-h1 text-ink" data-testid="product-title">
              {p.title}
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-body text-ink-2">
              <span data-testid="product-sku">{p.sku}</span>
              <span aria-hidden>·</span>
              <span data-testid="product-category">{humanizeSlug(p.category)}</span>
              {data.variants.length ? (
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
                      {data.parent?.sku ?? 'its style'}
                    </Link>
                  </span>
                </>
              ) : null}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {data.isVariant ? null : data.listingsPending ? <Skeleton className="h-[22px] w-20 rounded-full" /> : <StatusChip status={overall.status}>{overall.label}</StatusChip>}
          <UnavailableButton variant="secondary" reason={NOT_YET.pauseArchive}>
            <Icon name="pause" size={16} />
            Pause
          </UnavailableButton>
          <UnavailableButton variant="secondary" reason="Resubmitting a whole product is not available yet. Open a listing to retry it.">
            <Icon name="refresh" size={16} />
            Resubmit
          </UnavailableButton>
          <UnavailableButton reason="Editing a product is not available yet. Upload its SKU again in a spreadsheet to update it.">
            <IconGlyph icon={CONCEPT_ICON.edit} size={16} />
            Edit
          </UnavailableButton>
        </div>
      </header>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList variant="line" aria-label="Product sections">
          {DETAIL_TABS.map((t) => (
            <TabsTrigger key={t} value={t} data-testid={`tab-${t}`}>
              {TAB_LABEL[t]}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="overview">
          <OverviewTab data={data} />
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

function KV({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="mt-3 grid grid-cols-[70px_minmax(0,1fr)] gap-x-3 gap-y-2 text-small">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-ink-2">{k}</dt>
          <dd className="min-w-0 truncate text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

function MarketplaceCards({ data, detailed }: { data: DetailData; detailed?: boolean }) {
  const can = useCan()
  const [adding, setAdding] = useState<Marketplace | null>(null)
  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" data-testid="marketplace-cards">
        {MARKETPLACES.map((m) => (
          <MarketplaceCard key={m.id} m={m} data={data} detailed={detailed} onList={can('listing:generate') && !data.isVariant ? setAdding : null} />
        ))}
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

function MarketplaceCard({
  m,
  data,
  detailed,
  onList,
}: {
  m: MarketplaceInfo
  data: DetailData
  detailed?: boolean
  onList: ((m: Marketplace) => void) | null
}) {
  if (!m.supported) {
    return (
      <DashedCard pad="sm">
        <div className="flex items-center justify-between gap-2">
          <MarketplaceName id={m.id} />
          <StatusChip status="not-listed" />
        </div>
        <p className="mt-3 text-small text-ink-2">Not supported yet.</p>
        <UnavailableButton variant="secondary" size="sm" className="mt-3" reason={NOT_YET.waitlist}>
          Join waitlist
        </UnavailableButton>
      </DashedCard>
    )
  }
  const id = m.id as Marketplace
  if (data.listingsPending) return <Skeleton className="h-40 rounded-card" />
  const l = data.listings[id]
  if (!l) {
    return (
      <DashedCard pad="sm">
        <div className="flex items-center justify-between gap-2">
          <MarketplaceName id={m.id} />
          <StatusChip status="not-listed" />
        </div>
        <p className="mt-3 text-small text-ink-2">
          {data.isVariant ? 'Variants are listed through their style.' : 'No listing drafted for this product yet.'}
        </p>
        {onList ? (
          <Button variant="secondary" size="sm" className="mt-3" onClick={() => onList(id)} data-testid={`list-on-${id}`}>
            List on {m.name}
          </Button>
        ) : null}
      </DashedCard>
    )
  }
  const chip = cellChip(l)
  const issues = data.issuesByListing.get(l.id) ?? 0
  const live = l.marketplace_state === 'live' || l.marketplace_state === 'partially_live'
  const Card = chip.status === 'needs-you' || chip.status === 'blocked' ? AttentionCard : LaCard
  return (
    <Card pad="sm" data-testid={`marketplace-card-${id}`}>
      <div className="flex items-center justify-between gap-2">
        <MarketplaceName id={m.id} />
        <StatusChip status={chip.status}>{chip.label}</StatusChip>
      </div>
      <KV
        rows={[
          ['Listing', <span key="l" title={l.id}>{shortId(l.id)}</span>],
          [
            'Link',
            live && l.live_url ? (
              <a key="a" href={l.live_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-brand hover:underline">
                View live
                <span className="sr-only"> (opens in a new tab)</span>
                <Icon name="external" size={14} />
              </a>
            ) : (
              'Not yet'
            ),
          ],
          ['Status changed', <RelativeTime key="s" iso={l.status_changed_at} />],
          ['Issues', `${issues} open`],
          ...(detailed && l.status_reason ? ([['Reason', l.status_reason]] as [string, ReactNode][]) : []),
        ]}
      />
      <div className="mt-3 flex flex-wrap gap-2">
        {chip.status === 'needs-you' ? (
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
        ) : null}
      </div>
    </Card>
  )
}

function OverviewTab({ data }: { data: DetailData }) {
  return (
    <div className="flex flex-col gap-4">
      <MarketplaceCards data={data} />
      <div className="grid gap-4 lg:grid-cols-2">
        <FactsCard product={data.product} />
        <VariantStatusCard data={data} />
      </div>
    </div>
  )
}

function FactsCard({ product }: { product: ProductDetail }) {
  const entries = useMemo(
    () => Object.entries(product.attributes ?? {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    [product.attributes],
  )
  return (
    <LaCard>
      <CardHead title="Facts we hold about this product" sub="Every value here came from you, through the form or a spreadsheet." />
      <dl className="mt-4 grid grid-cols-[minmax(90px,auto)_minmax(0,1fr)] gap-x-4 gap-y-3 text-small" data-testid="product-attributes">
        <div className="contents">
          <dt className="text-ink-2">Category</dt>
          <dd className="flex flex-wrap items-center gap-2 text-ink">
            {humanizeSlug(product.category)} <SourceBadge source={{ kind: 'you' }} />
          </dd>
        </div>
        {entries.map(([k, v]) => (
          <div key={k} className="contents" data-attr-key={k}>
            <dt className="text-ink-2">{ATTR_FIELDS.find((f) => f.key === k)?.label ?? humanizeSlug(k)}</dt>
            <dd className="flex min-w-0 flex-wrap items-center gap-2 break-words text-ink">
              <span className="min-w-0 tabular-nums">{typeof v === 'string' ? v || '—' : formatAttributeValue(v, product.attribute_literals[k])}</span>
              <SourceBadge source={{ kind: 'you' }} />
            </dd>
          </div>
        ))}
      </dl>
      {entries.length === 0 ? <p className="mt-3 text-small text-ink-2">No attributes yet. Add them with a spreadsheet import of this SKU.</p> : null}
    </LaCard>
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
              Open {data.parent?.sku ?? 'the style'}
            </Link>
          </Button>
        </div>
      ) : data.variants.length === 0 ? (
        <p className="mt-4 text-small text-ink-2" data-testid="no-parent">
          No variants. This product is listed as a single item.
        </p>
      ) : (
        <>
          {matrix.cells.size ? (
            <div
              className="mt-4 grid items-center gap-1.5 overflow-x-auto"
              style={{ gridTemplateColumns: `80px repeat(${matrix.sizes.length}, minmax(44px, 1fr))` }}
            >
              <span />
              {matrix.sizes.map((s) => (
                <b key={s} className="text-center text-small text-ink">
                  {s}
                </b>
              ))}
              {matrix.colours.map((c) => (
                <div key={c ?? ''} className="contents">
                  <b className="truncate text-small text-ink">{c ?? 'Size'}</b>
                  {matrix.sizes.map((s) => {
                    const v = matrix.cells.get(matrixKey(c, s))
                    return v ? (
                      <Link key={s} to="/products/$productId" params={{ productId: v.id }} className="min-w-0 rounded-lg" aria-label={`${c ? `${c} ` : ''}${s}: ${v.sku}`}>
                        <VariantCell className="hover:bg-subtle">{v.sku.startsWith(`${data.product.sku}-`) ? v.sku.slice(data.product.sku.length + 1) : v.sku}</VariantCell>
                      </Link>
                    ) : (
                      <VariantCell key={s} unavailable label={`${c ? `${c} ` : ''}${s}: not made`} />
                    )
                  })}
                </div>
              ))}
            </div>
          ) : null}
          {matrix.loose.length ? (
            <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Variants" data-testid="variant-list">
              {matrix.loose.map((v) => {
                const size = attrText(v, 'size')
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
  if (data.isVariant) return <VariantStatusCard data={data} />
  return (
    <LaCard pad="none" className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 p-5">
        <CardHead title="Variants" sub="Each size and colour you make, as its own SKU. The colour is in each variant’s SKU." />
        <Can action="product:import">
          <Button variant="secondary" size="sm" asChild>
            <Link to="/add/variants" search={{ product: data.product.id }}>
              Add variants
            </Link>
          </Button>
        </Can>
      </div>
      {data.variants.length === 0 ? (
        <EmptyState icon="grid" title="No variants" description="Add sizes and colours with the variants step." compact />
      ) : (
        <table className="w-full text-small" aria-label="Variants">
          <thead>
            <tr className="h-[38px] bg-sunken text-left text-caption font-bold text-ink-2">
              <th className="px-5">SKU</th>
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
                <td className="px-3">{attrText(v, 'size') ?? '—'}</td>
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
  if (data.listingsPending) return <Skeleton className="h-32 rounded-card" />
  if (!ls.length) return <NoListings data={data} />
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {ls.map((l) => {
        const chip = cellChip(l)
        return (
          <LaCard key={l.id}>
            <div className="flex items-center justify-between gap-2">
              <MarketplaceName id={l.marketplace} />
              <StatusChip status={chip.status}>{chip.label}</StatusChip>
            </div>
            <p className="mt-3 text-small text-ink-2">Title, bullets and description are written per marketplace and reviewed before anything is sent.</p>
            <Button variant="secondary" size="sm" className="mt-3" asChild>
              <Link to="/listings/$listingId/review" params={{ listingId: l.id }}>
                Open content
              </Link>
            </Button>
          </LaCard>
        )
      })}
    </div>
  )
}

function ValidationCard({ listing }: { listing: Listing }) {
  const q = useListing(listing.id)
  const v = q.data?.data.validation
  return (
    <LaCard>
      <div className="flex items-center justify-between gap-2">
        <MarketplaceName id={listing.marketplace} />
        {q.isPending ? (
          <Skeleton className="h-[22px] w-20 rounded-full" />
        ) : v ? (
          <StatusChip status={v.passed ? 'live' : 'error'}>{v.passed ? 'Passed' : 'Failed'}</StatusChip>
        ) : (
          <TagChip tone="plain">Not checked</TagChip>
        )}
      </div>
      {q.error ? (
        <ErrorState error={q.error} compact onRetry={() => void q.refetch()} />
      ) : v ? (
        <KV
          rows={[
            ['Blocking', String(v.blocking_count)],
            ['Warnings', String(v.warning_count)],
            ['Stages', String(v.stages?.length ?? 0)],
          ]}
        />
      ) : q.isPending ? null : (
        <p className="mt-3 text-small text-ink-2">No checks have run on this listing yet.</p>
      )}
      <Button variant="secondary" size="sm" className="mt-3" asChild>
        <Link to="/listings/$listingId/review" params={{ listingId: listing.id }}>
          See every check
        </Link>
      </Button>
    </LaCard>
  )
}

function ValidationTab({ data }: { data: DetailData }) {
  const ls = listingsIn(data)
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
        <Skeleton className="h-32 rounded-card" />
      ) : ls.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {ls.map((l) => (
            <ValidationCard key={l.id} listing={l} />
          ))}
        </div>
      ) : (
        <NoListings data={data} />
      )}
    </div>
  )
}

function HistoryList({ listing }: { listing: Listing }) {
  const h = useListingHistory(listing.id)
  return (
    <LaCard>
      <div className="flex items-center justify-between gap-2">
        <MarketplaceName id={listing.marketplace} />
      </div>
      {h.isPending ? (
        <div className="mt-3 flex flex-col gap-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
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
      {h.hasNextPage ? (
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
        <Skeleton className="h-32 rounded-card" />
      ) : ls.length ? (
        <div className={cn('grid gap-4', ls.length > 1 && 'md:grid-cols-2')}>
          {ls.map((l) => (
            <HistoryList key={l.id} listing={l} />
          ))}
        </div>
      ) : null}
    </div>
  )
}
