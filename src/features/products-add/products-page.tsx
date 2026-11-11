/**
 * Products (hi-fi p07): every style and standalone product with its marketplace cells, overall
 * status, open issues and last activity. Data: ./catalog.ts (GET /products, /listings, /issues).
 * Search and the filters run over the loaded catalog (the API has no product search or facets);
 * the counts in the segmented filter are computed from the same rows, so they sum to All.
 */
import { Link } from '@tanstack/react-router'
import type { RowSelectionState } from '@tanstack/react-table'
import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { Page, PageHeader } from '@/components/app/page-header'
import { columnHelper, DataTable, selectionColumn } from '@/components/data-table'
import {
  Banner,
  BulkBar,
  Glyph,
  Icon,
  MARKETPLACES,
  MarketplaceCell,
  MarketplaceName,
  NOT_YET,
  Segmented,
  StatusChip,
  UnavailableButton,
  type ChipStatus,
  type MarketplaceId,
} from '@/components/la'
import { EmptyState } from '@/components/states/empty-state'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { SavedPhoto } from '@/components/la/saved-photo'
import { RelativeTime } from '@/features/products/format'
import { deleteBlock } from '@/features/products/delete'
import { DeleteProductsDialog } from '@/features/products/delete-dialog'
import { useRefreshListViews } from '@/features/products/image-views'
import { Can, useCan } from '@/lib/permissions'
import { AI_PAUSED_REASON } from '@/features/ai-credit/model'
import { useAiPaused } from '@/features/ai-credit/use-ai-paused'
import { useChipContext } from '@/features/listing-flow/publishing'
import { APPROVED_PAUSED_LABEL, needsYourInfo } from '@/lib/listing-chip'
import { cn } from '@/lib/utils'
import { AddMarketplaceDialog } from './add-marketplace-dialog'
import { useCatalog, type LoadState } from './catalog'
import { cleanProductsSearch, type ProductsSearch } from './products-search'
import {
  BUCKETS,
  bucketCounts,
  categoriesOf,
  cellChip,
  filterCatalog,
  productCategoryLabel,
  OVERALL_CHIP,
  type Bucket,
  type CatalogRow,
  type Marketplace,
} from './catalog-model'

const col = columnHelper<CatalogRow>()

/** The status chip's own glyph and colour before each filter label (the same signs as the table). */
const BUCKET_GLYPH: Record<(typeof BUCKETS)[number]['value'], { status: ChipStatus; className: string }> = {
  live: { status: 'live', className: 'text-success' },
  progress: { status: 'working', className: 'text-brand' },
  'needs-you': { status: 'needs-you', className: 'text-attention' },
  error: { status: 'error', className: 'text-danger' },
  draft: { status: 'draft', className: 'text-ink-3' },
}

/** Interactive elements inside a row sit above the row's stretched SKU link. */
const ABOVE = 'relative z-10'

/**
 * The product's main photo (hi-fi "Product thumbnail 40"): the signed `thumbnail_url` of the list or
 * detail read, faded in over the image placeholder at a fixed size, so a row never shifts. No photo
 * yet (none uploaded, or still being checked) keeps the placeholder.
 */
export function ProductThumb({
  size = 40,
  className,
  src,
  alt = '',
  onError,
}: {
  size?: number
  className?: string
  src?: string | null
  /** The product's name for the photo; empty when the row beside it already says it. */
  alt?: string
  onError?: () => void
}) {
  return (
    <span className="inline-flex shrink-0" style={{ width: size, height: size }} aria-hidden={alt ? undefined : true}>
      <SavedPhoto
        src={src}
        alt={alt}
        onError={onError}
        iconSize={size > 40 ? 22 : 18}
        testId="product-thumb"
        className={cn('size-full rounded-tile border border-line bg-field text-ink-3 shadow-inset-sm', className)}
      />
    </span>
  )
}

/** A list row's thumbnail; a link that fails to load asks for a fresh list read (throttled). */
function RowThumb({ product }: { product: CatalogRow['product'] }) {
  const refresh = useRefreshListViews()
  return <ProductThumb src={product.thumbnail_url} onError={refresh} />
}

/**
 * Load state of the lists joined into each row. The table waits for all three lists (rows, chips
 * and issue counts paint once together); if one failed, the cells it feeds say "unknown" instead
 * of guessing "Not listed", "Draft" or 0.
 */
const LoadCtx = createContext<{ listings: LoadState; issues: LoadState }>({ listings: 'ready', issues: 'ready' })

function Unknown({ what, className }: { what: string; className?: string }) {
  return (
    <span className={cn('inline-block text-center text-caption font-semibold text-ink-3', className)} title={`${what} could not be loaded`}>
      ?<span className="sr-only">{what} could not be loaded</span>
    </span>
  )
}

function OverallCell({ row }: { row: CatalogRow }) {
  const { listings } = useContext(LoadCtx)
  if (listings === 'error') return <Unknown what="Overall status" />
  const o = OVERALL_CHIP[row.overall]
  return <StatusChip status={o.status}>{o.label}</StatusChip>
}

function IssuesCell({ row, card }: { row: CatalogRow; card?: boolean }) {
  const { issues, listings } = useContext(LoadCtx)
  if (issues === 'error' || listings === 'error') return card ? <>Issues unknown</> : <Unknown what="Open issues" />
  const n = row.openIssues
  return <>{card ? `${n} ${n === 1 ? 'issue' : 'issues'}` : n}</>
}

function MarketCell({ row, id, className }: { row: CatalogRow; id: MarketplaceId; className?: string }) {
  const { listings: state } = useContext(LoadCtx)
  const chipCtx = useChipContext()
  const info = MARKETPLACES.find((m) => m.id === id)!
  if (state === 'error') return <Unknown what={`${info.name} status`} className={className} />
  const listing = row.listings[id as Marketplace]
  const chip = cellChip(listing, chipCtx)
  // No listing id here (prod QA 9 Nov: "5B028E•" under the icon read as noise). Only the count of
  // blocking fixes, which the chip's tooltip spells out.
  const fixes = listing && needsYourInfo(listing) ? (listing.needs_you_count ?? 0) : 0
  const sub = fixes > 0 ? `${fixes} to fix` : undefined
  return (
    <Link
      to="/products/$productId"
      params={{ productId: row.product.id }}
      search={{ tab: 'marketplaces' }}
      className={cn(ABOVE, 'inline-flex max-w-full rounded-control')}
      tabIndex={-1}
    >
      <MarketplaceCell status={chip.status} label={`${info.name}: ${chip.label}`} sub={sub} className={className} />
    </Link>
  )
}

/** Marketplaces the API can list on today get a column; the rest share one caption line. */
const LISTABLE = MARKETPLACES.filter((m) => m.supported)
const NOT_YET_NAMES = MARKETPLACES.filter((m) => !m.supported)
  .map((m) => m.name)
  .join(', ')

const SK_PILL = <Skeleton className="h-[22px] w-20 rounded-full" />

const columns = col.columns([
  selectionColumn<CatalogRow>(),
  col.display({
    id: 'product',
    header: 'Product',
    meta: {
      className: 'min-w-[210px]',
      skeleton: (
        <span className="flex items-center gap-2.5">
          <Skeleton className="size-10 shrink-0 rounded-tile" />
          <span className="flex flex-col gap-1.5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-24" />
          </span>
        </span>
      ),
    },
    cell: ({ row }) => (
      <span className="flex min-w-0 items-center gap-2.5">
        <RowThumb product={row.original.product} />
        <span className="min-w-0">
          <b className="block max-w-72 truncate text-ink" title={row.original.product.title}>
            {row.original.product.title}
          </b>
          <small className="block truncate text-caption text-ink-2">{productCategoryLabel(row.original.product.category)}</small>
        </span>
      </span>
    ),
  }),
  col.display({
    id: 'sku',
    header: 'SKU',
    meta: { className: 'w-[120px]' },
    cell: ({ row }) => (
      <Link
        to="/products/$productId"
        params={{ productId: row.original.product.id }}
        className="rounded-sm text-small text-ink after:absolute after:inset-0 after:content-[''] hover:underline"
      >
        {row.original.product.sku}
      </Link>
    ),
  }),
  col.display({
    id: 'variants',
    header: 'Var.',
    meta: { className: 'w-11 tabular-nums' },
    cell: ({ row }) => (row.original.variants.length ? row.original.variants.length : '—'),
  }),
  ...LISTABLE.map((m) =>
    col.display({
      id: `m-${m.id}`,
      header: m.short,
      meta: { className: 'w-14 px-1 text-center', cellClassName: 'text-center', skeleton: <Skeleton className="mx-auto size-7 rounded-control" /> },
      cell: ({ row }) => <MarketCell row={row.original} id={m.id} />,
    }),
  ),
  col.display({
    id: 'overall',
    header: 'Overall',
    meta: { className: 'w-[112px]', skeleton: SK_PILL },
    cell: ({ row }) => <OverallCell row={row.original} />,
  }),
  col.display({
    id: 'issues',
    header: 'Issues',
    meta: { className: 'w-[56px] tabular-nums', skeleton: <Skeleton className="h-4 w-5" /> },
    cell: ({ row }) => <IssuesCell row={row.original} />,
  }),
  col.display({
    id: 'activity',
    header: 'Activity',
    meta: { className: 'w-[96px]', skeleton: <Skeleton className="h-3 w-14" /> },
    cell: ({ row }) => <RelativeTime iso={row.original.activityAt} className={cn(ABOVE, 'text-caption whitespace-nowrap text-ink-2')} />,
  }),
])

function ProductCard({ row, selected, toggle, canSelect }: { row: CatalogRow; selected: boolean; toggle: (v: boolean) => void; canSelect: boolean }) {
  return (
    <div className={cn('relative rounded-card border p-4', selected ? 'border-brand bg-brand-bg shadow-[var(--selected-ring),var(--shadow-raised-md)]' : 'border-line bg-surface shadow-raised-md')}>
      <div className="flex items-start gap-3">
        {canSelect ? (
          <Checkbox className={cn(ABOVE, 'mt-0.5')} checked={selected} onCheckedChange={(v) => toggle(!!v)} aria-label={`Select ${row.product.sku}`} />
        ) : null}
        <RowThumb product={row.product} />
        <div className="min-w-0 flex-1">
          <Link
            to="/products/$productId"
            params={{ productId: row.product.id }}
            className="block truncate font-bold text-ink after:absolute after:inset-0 after:content-['']"
          >
            {row.product.title}
          </Link>
          <p className="truncate text-caption text-ink-2">
            {row.product.sku} · {productCategoryLabel(row.product.category)}
            {row.variants.length ? ` · ${row.variants.length} ${row.variants.length === 1 ? 'variant' : 'variants'}` : ''}
          </p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-line pt-3">
        {LISTABLE.map((m) => (
          <span key={m.id} className="flex min-w-0 flex-col items-start gap-1.5">
            <MarketplaceName id={m.id} size="xs" className="max-w-full gap-2 text-small" />
            <CardMarketStatus row={row} id={m.id as Marketplace} name={m.name} />
          </span>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 text-caption text-ink-2">
        <span className="flex min-w-0 items-center gap-2">
          <OverallCell row={row} />
          <span className="truncate">
            <IssuesCell row={row} card />
          </span>
        </span>
        <RelativeTime iso={row.activityAt} className={cn(ABOVE, 'shrink-0')} />
      </div>
    </div>
  )
}

/** Loading phone card: the same frame as ProductCard, so the list does not move when it lands. */
function ProductCardSkeleton() {
  return (
    <div className="rounded-card border border-line bg-surface p-4 shadow-raised-md" aria-hidden>
      <div className="flex items-start gap-3">
        <Skeleton className="size-10 shrink-0 rounded-tile" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 pt-0.5">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-line pt-3">
        {LISTABLE.map((m) => (
          <span key={m.id} className="flex flex-col items-start gap-1.5">
            <Skeleton className="h-6 w-24 rounded-tile" />
            {SK_PILL}
          </span>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        {SK_PILL}
        <Skeleton className="h-3 w-14" />
      </div>
    </div>
  )
}

/** Phone card: the listing's status as a labelled chip (the table uses the icon-only cell). */
function CardMarketStatus({ row, id, name }: { row: CatalogRow; id: Marketplace; name: string }) {
  const { listings } = useContext(LoadCtx)
  const chipCtx = useChipContext()
  if (listings === 'error') return <Unknown what={`${name} status`} />
  const chip = cellChip(row.listings[id], chipCtx)
  return <StatusChip status={chip.status}>{chip.label}</StatusChip>
}

/** The status signs, behind a small "Key" button instead of a permanent line. */
function GlyphKey() {
  const { amazonPublishingPaused } = useChipContext()
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-[34px]">
          <Icon name="info" size={14} />
          Key
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-3 text-small text-ink-2">
        <p className="font-semibold text-ink">Marketplace columns</p>
        <ul className="mt-2 flex flex-col gap-1.5">
          {BUCKETS.map((b) => (
            <li key={b.value} className="flex items-center gap-2">
              <Glyph status={BUCKET_GLYPH[b.value].status} className={BUCKET_GLYPH[b.value].className} />
              {b.label}
            </li>
          ))}
          <li className="flex items-center gap-2">
            <Glyph status="ready" className="text-brand" />
            <span>
              Awaiting approval or ready to list <span className="text-ink-3">(counted in Needs you)</span>
            </span>
          </li>
          {amazonPublishingPaused ? (
            <li className="flex items-center gap-2" data-testid="key-publishing-paused">
              <Glyph status="paused" className="text-ink-2" />
              <span>
                {APPROVED_PAUSED_LABEL} <span className="text-ink-3">(counted in In progress)</span>
              </span>
            </li>
          ) : null}
        </ul>
        <p className="mt-2 text-caption text-ink-3">The small text under a sign is the listing ID.</p>
      </PopoverContent>
    </Popover>
  )
}

const ALL = '__all'

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string | null
  onChange: (v: string | null) => void
  options: readonly { value: string; label: string }[]
}) {
  return (
    <Select value={value ?? ALL} onValueChange={(v) => onChange(v === ALL ? null : v)}>
      <SelectTrigger size="sm" aria-label={`Filter by ${label.toLowerCase()}`} className="h-[34px] w-auto min-w-[120px] gap-2 font-semibold">
        <Icon name="filter" size={14} className="text-ink-2" />
        <SelectValue placeholder={label}>{value ? options.find((o) => o.value === value)?.label : label}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>Any {label.toLowerCase()}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** The bulk bar's Delete: owners and admins, and never while a selected listing is with a marketplace. */
export function BulkDelete({ rows, canDelete, onDelete }: { rows: CatalogRow[]; canDelete: boolean; onDelete: () => void }) {
  const blocked = rows.filter((r) => deleteBlock(Object.values(r.listings)))
  if (!canDelete)
    return (
      <UnavailableButton size="sm" variant="danger" reason="Only an owner or admin can delete products." data-testid="bulk-delete">
        Delete
      </UnavailableButton>
    )
  if (blocked.length)
    return (
      <UnavailableButton
        size="sm"
        variant="danger"
        reason={
          blocked.length === 1
            ? `${blocked[0]?.product.sku ?? 'A product'} has a listing that was sent to a marketplace, so it can’t be deleted here. Unselect it to delete the rest.`
            : `${blocked.length} selected products have listings that were sent to a marketplace, so they can’t be deleted here. Unselect them to delete the rest.`
        }
        data-testid="bulk-delete"
      >
        Delete
      </UnavailableButton>
    )
  return (
    <Button size="sm" variant="danger" onClick={onDelete} data-testid="bulk-delete">
      Delete
    </Button>
  )
}

/**
 * `search` holds the filters (the route's URL search, `./products-search`); `onSearch` changes
 * them. Without a router (tests) the page keeps them itself.
 */
export function ProductsPage({ search, onSearch }: { search?: ProductsSearch; onSearch?: (patch: Partial<ProductsSearch>) => void } = {}) {
  const catalog = useCatalog()
  const can = useCan()
  const [local, setLocal] = useState<ProductsSearch>({})
  const filters = search ?? local
  const setFilters = (patch: Partial<ProductsSearch>) => (onSearch ? onSearch(patch) : setLocal((s) => cleanProductsSearch({ ...s, ...patch })))
  const q = filters.q ?? ''
  const bucket: Bucket | 'all' = filters.status ?? 'all'
  const category = filters.category ?? null
  const marketplace: Marketplace | null = filters.marketplace ?? null
  const setQ = (v: string) => setFilters({ q: v })
  const setBucket = (v: Bucket | 'all') => setFilters({ status: v === 'all' ? undefined : v })
  const setCategory = (v: string | null) => setFilters({ category: v ?? undefined })
  const setMarketplace = (v: Marketplace | null) => setFilters({ marketplace: v ?? undefined })
  const [selection, setSelection] = useState<RowSelectionState>({})
  const [adding, setAdding] = useState<CatalogRow[] | null>(null)
  const [deleting, setDeleting] = useState<{ rows: CatalogRow[]; clear: () => void } | null>(null)

  const listingsReady = catalog.listingsState === 'ready'
  // Every count appears at once, when the whole catalog has answered.
  const countsReady = !catalog.isPending
  const load = useMemo(() => ({ listings: catalog.listingsState, issues: catalog.issuesState }), [catalog.listingsState, catalog.issuesState])
  const counts = useMemo(() => bucketCounts(catalog.rows), [catalog.rows])
  const categories = useMemo(() => categoriesOf(catalog.rows), [catalog.rows])
  // Status and marketplace filters read listings; until they are loaded they would filter on a guess.
  const rows = useMemo(
    () =>
      filterCatalog(catalog.rows, {
        q,
        bucket: listingsReady ? bucket : 'all',
        category,
        marketplace: listingsReady ? marketplace : null,
      }),
    [catalog.rows, q, bucket, category, marketplace, listingsReady],
  )
  const byId = useMemo(() => new Map(catalog.rows.map((r) => [r.product.id, r])), [catalog.rows])
  const listingsOf = useCallback((id: string) => byId.get(id)?.listings ?? {}, [byId])

  const filtered = q.trim() !== '' || bucket !== 'all' || !!category || !!marketplace
  const clear = () => setFilters({ q: undefined, status: undefined, category: undefined, marketplace: undefined })
  const n = catalog.rows.length

  const sub = catalog.isPending
    ? 'Loading products…'
    : catalog.error
      ? ' '
      : `${n} ${n === 1 ? 'product' : 'products'} · ${catalog.variantCount} ${catalog.variantCount === 1 ? 'variant' : 'variants'}${
          catalog.truncated ? ' · first pages only' : ''
        }`

  const canGenerate = can('listing:generate')
  const aiPaused = useAiPaused()

  return (
    <Page>
      <PageHeader
        title="Products"
        description={<span data-testid="products-count">{sub}</span>}
        actions={
          <>
            <Can action="product:import">
              <Button asChild>
                <Link to="/add" data-testid="new-product">
                  <Icon name="plus" size={16} />
                  Add products
                </Link>
              </Button>
            </Can>
          </>
        }
      />

      <LoadCtx.Provider value={load}>
      <DataTable<CatalogRow>
        label="Products"
        className="[&_tbody_tr]:relative [&_tbody_[role=checkbox]]:relative [&_tbody_[role=checkbox]]:z-10"
        data={rows}
        isLoading={catalog.isPending}
        error={catalog.error}
        onRetry={catalog.refetch}
        columns={columns}
        getRowId={(r) => r.product.id}
        density="tall"
        skeletonRows={6}
        enableRowSelection
        rowSelection={selection}
        onRowSelectionChange={setSelection}
        renderCard={(row, s) => <ProductCard row={row} {...s} />}
        renderCardSkeleton={() => <ProductCardSkeleton />}
        toolbar={
          n > 0 || catalog.isPending ? (
            <div className="flex flex-col gap-2">
              <div className="max-w-full overflow-x-auto">
                <Segmented
                  label="Overall status"
                  value={bucket}
                  onChange={setBucket}
                  options={[
                    { value: 'all', label: 'All', count: countsReady ? counts.all : undefined },
                    ...(catalog.listingsState === 'error'
                      ? []
                      : BUCKETS.map((b) => ({
                          value: b.value,
                          label: (
                            <>
                              <Glyph status={BUCKET_GLYPH[b.value].status} className={BUCKET_GLYPH[b.value].className} />
                              {b.label}
                            </>
                          ),
                          count: countsReady && listingsReady ? counts[b.value] : undefined,
                        }))),
                  ]}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-full sm:w-[260px]">
                  <Icon name="search" size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
                  <Input
                    type="search"
                    name="q"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                    enterKeyHint="search"
                    maxLength={200}
                    placeholder="Search name or SKU…"
                    aria-label="Search loaded products by name or SKU"
                    className="h-[34px] pl-9 text-small"
                    data-testid="products-filter"
                  />
                </div>
                <FilterSelect
                  label="Category"
                  value={category}
                  onChange={setCategory}
                  options={categories.map((c) => ({ value: c, label: productCategoryLabel(c) }))}
                />
                {catalog.listingsState === 'error' ? null : (
                  <FilterSelect
                    label="Marketplace"
                    value={marketplace}
                    onChange={(v) => setMarketplace(v as Marketplace | null)}
                    options={[
                      { value: 'amazon', label: 'Listed on Amazon' },
                      { value: 'flipkart', label: 'Listed on Flipkart' },
                    ]}
                  />
                )}
                <GlyphKey />
              </div>
              {NOT_YET_NAMES ? (
                <p className="text-caption text-ink-3" title={NOT_YET.waitlist}>
                  {NOT_YET_NAMES}: not available yet.<span className="sr-only"> {NOT_YET.waitlist}</span>
                </p>
              ) : null}
              {catalog.listingsState === 'error' || catalog.issuesState === 'error' ? (
                <Banner
                  tone="attention"
                  role="status"
                  className="py-2"
                  action={
                    <Button variant="secondary" size="sm" onClick={catalog.refetch}>
                      Try again
                    </Button>
                  }
                >
                  <span className="text-small">
                    {catalog.listingsState === 'error'
                      ? 'Listing status could not be loaded, so status cells show “?”.'
                      : 'Open issues could not be loaded.'}
                  </span>
                </Banner>
              ) : null}
            </div>
          ) : null
        }
        empty={
          filtered ? (
            <EmptyState
              icon="search"
              title="No products match"
              description="Try another name, SKU or filter."
              actions={
                <Button variant="secondary" size="sm" onClick={clear}>
                  Clear filters
                </Button>
              }
              compact
            />
          ) : (
            <EmptyState
              icon="box"
              tone="brand"
              title="No products yet"
              description="Add one with the guided form or upload a spreadsheet. Products appear here, newest first."
              actions={
                <Can action="product:import">
                  <Button size="sm" asChild>
                    <Link to="/add">Add products</Link>
                  </Button>
                </Can>
              }
            />
          )
        }
        bulkBar={(selected, clearSelection) => (
          <BulkBar count={selected.length} onClear={clearSelection}>
            {canGenerate && aiPaused ? (
              <UnavailableButton size="sm" reason={AI_PAUSED_REASON} data-testid="bulk-add-marketplace">
                Add marketplace
              </UnavailableButton>
            ) : canGenerate ? (
              <Button size="sm" onClick={() => setAdding(selected)} data-testid="bulk-add-marketplace">
                Add marketplace
              </Button>
            ) : (
              <UnavailableButton size="sm" reason="Your role can’t start drafts. An owner or operator can.">
                Add marketplace
              </UnavailableButton>
            )}
            <BulkDelete rows={selected} canDelete={can('settings:manage')} onDelete={() => setDeleting({ rows: selected, clear: clearSelection })} />
          </BulkBar>
        )}
      />
      </LoadCtx.Provider>
      {adding ? (
        <AddMarketplaceDialog
          open
          onOpenChange={(v) => {
            if (!v) setAdding(null)
          }}
          products={adding.map((r) => r.product)}
          listingsOf={listingsOf}
        />
      ) : null}
      {deleting ? (
        <DeleteProductsDialog
          open
          onOpenChange={(v) => {
            if (!v) setDeleting(null)
          }}
          products={deleting.rows.map((r) => ({ id: r.product.id, sku: r.product.sku, title: r.product.title, variants: r.variants.length }))}
          onDeleted={(out) => {
            // The deleted rows are gone; the ones the server kept stay selected.
            if (out.refused.size) setSelection(Object.fromEntries([...out.refused.keys()].map((id) => [id, true])))
            else deleting.clear()
          }}
        />
      ) : null}
    </Page>
  )
}
