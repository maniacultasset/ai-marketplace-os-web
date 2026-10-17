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
  BulkBar,
  Icon,
  MARKETPLACES,
  MarketplaceCell,
  NOT_YET,
  Segmented,
  StatusChip,
  UnavailableButton,
  type MarketplaceId,
} from '@/components/la'
import { EmptyState } from '@/components/states/empty-state'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { RelativeTime } from '@/features/products/format'
import { Can, useCan } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { AddMarketplaceDialog } from './add-marketplace-dialog'
import { useCatalog, type LoadState } from './catalog'
import {
  BUCKETS,
  bucketCounts,
  categoriesOf,
  cellChip,
  filterCatalog,
  humanizeSlug,
  OVERALL_CHIP,
  shortId,
  type Bucket,
  type CatalogRow,
  type Marketplace,
} from './catalog-model'

const col = columnHelper<CatalogRow>()

/** Interactive elements inside a row sit above the row's stretched SKU link. */
const ABOVE = 'relative z-10'

export function ProductThumb({ size = 40, className }: { size?: number; className?: string }) {
  // Product images are storage keys, not URLs the browser can show, so the thumbnail is the
  // neutral product tile from the kit (hi-fi "Product thumbnail 40").
  return (
    <span
      aria-hidden
      className={cn('inline-flex shrink-0 items-center justify-center rounded-[10px] border border-line bg-field text-ink-3 shadow-inset-sm', className)}
      style={{ width: size, height: size }}
    >
      <Icon name="box" size={Math.round(size * 0.45)} />
    </span>
  )
}

/**
 * Load state of the lists joined into each row. Until GET /listings (or /issues) has answered, the
 * cells it feeds show a skeleton; if it failed, they say "unknown" instead of guessing
 * "Not listed", "Draft" or 0.
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
  if (listings === 'pending') return <Skeleton className="h-[22px] w-20 rounded-full" />
  if (listings === 'error') return <Unknown what="Overall status" />
  const o = OVERALL_CHIP[row.overall]
  return <StatusChip status={o.status}>{o.label}</StatusChip>
}

function IssuesCell({ row, card }: { row: CatalogRow; card?: boolean }) {
  const { issues, listings } = useContext(LoadCtx)
  if (issues === 'pending' || listings === 'pending') return <Skeleton className={cn('h-4', card ? 'w-16' : 'w-5')} />
  if (issues === 'error' || listings === 'error') return card ? <>Issues unknown</> : <Unknown what="Open issues" />
  const n = row.openIssues
  return <>{card ? `${n} ${n === 1 ? 'issue' : 'issues'}` : n}</>
}

function MarketCell({ row, id, className }: { row: CatalogRow; id: MarketplaceId; className?: string }) {
  const { listings: state } = useContext(LoadCtx)
  const info = MARKETPLACES.find((m) => m.id === id)!
  if (!info.supported) {
    return <MarketplaceCell status="not-listed" label={`${info.name}: not supported yet`} className={className} />
  }
  if (state === 'pending') return <Skeleton className={cn('mx-auto size-7 rounded-control', className)} />
  if (state === 'error') return <Unknown what={`${info.name} status`} className={className} />
  const listing = row.listings[id as Marketplace]
  const chip = cellChip(listing)
  const sub = listing ? (chip.status === 'needs-you' ? 'task' : shortId(listing.id)) : undefined
  return (
    <Link
      to="/products/$productId"
      params={{ productId: row.product.id }}
      search={{ tab: 'marketplaces' }}
      className={cn(ABOVE, 'inline-flex rounded-control')}
      tabIndex={-1}
    >
      <MarketplaceCell status={chip.status} label={`${info.name}: ${chip.label}`} sub={sub} className={className} />
    </Link>
  )
}

const columns = col.columns([
  selectionColumn<CatalogRow>(),
  col.display({
    id: 'product',
    header: 'Product',
    meta: { className: 'min-w-[210px]' },
    cell: ({ row }) => (
      <span className="flex min-w-0 items-center gap-2.5">
        <ProductThumb />
        <span className="min-w-0">
          <b className="block max-w-72 truncate text-ink" title={row.original.product.title}>
            {row.original.product.title}
          </b>
          <small className="block truncate text-caption text-ink-2">{humanizeSlug(row.original.product.category)}</small>
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
  ...MARKETPLACES.map((m) =>
    col.display({
      id: `m-${m.id}`,
      header: m.short,
      meta: { className: 'w-14 px-1 text-center', cellClassName: 'text-center' },
      cell: ({ row }) => <MarketCell row={row.original} id={m.id} />,
    }),
  ),
  col.display({
    id: 'overall',
    header: 'Overall',
    meta: { className: 'w-[112px]' },
    cell: ({ row }) => <OverallCell row={row.original} />,
  }),
  col.display({
    id: 'issues',
    header: 'Issues',
    meta: { className: 'w-[56px] tabular-nums' },
    cell: ({ row }) => <IssuesCell row={row.original} />,
  }),
  col.display({
    id: 'activity',
    header: 'Activity',
    meta: { className: 'w-[96px]' },
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
        <ProductThumb />
        <div className="min-w-0 flex-1">
          <Link
            to="/products/$productId"
            params={{ productId: row.product.id }}
            className="block truncate font-bold text-ink after:absolute after:inset-0 after:content-['']"
          >
            {row.product.title}
          </Link>
          <p className="truncate text-caption text-ink-2">
            {row.product.sku} · {humanizeSlug(row.product.category)}
            {row.variants.length ? ` · ${row.variants.length} variants` : ''}
          </p>
        </div>
        <OverallCell row={row} />
      </div>
      <div className="mt-3 grid grid-cols-6 items-start gap-0.5 border-t border-line pt-3">
        {MARKETPLACES.map((m) => (
          <span key={m.id} className="flex min-w-0 flex-col items-center gap-0.5">
            <span className="max-w-full truncate text-[11px] font-semibold text-ink-2">{m.short}</span>
            <MarketCell row={row} id={m.id} className="w-full" />
          </span>
        ))}
      </div>
      <p className="mt-2 flex items-center justify-between text-caption text-ink-2">
        <span>
          <IssuesCell row={row} card />
        </span>
        <RelativeTime iso={row.activityAt} className={ABOVE} />
      </p>
    </div>
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

export function ProductsPage() {
  const catalog = useCatalog()
  const can = useCan()
  const [q, setQ] = useState('')
  const [bucket, setBucket] = useState<Bucket | 'all'>('all')
  const [category, setCategory] = useState<string | null>(null)
  const [marketplace, setMarketplace] = useState<Marketplace | null>(null)
  const [selection, setSelection] = useState<RowSelectionState>({})
  const [adding, setAdding] = useState<CatalogRow[] | null>(null)

  const listingsReady = catalog.listingsState === 'ready'
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
  const clear = () => {
    setQ('')
    setBucket('all')
    setCategory(null)
    setMarketplace(null)
  }
  const n = catalog.rows.length

  const sub = catalog.isPending
    ? 'Loading products…'
    : catalog.error
      ? ' '
      : `${n} ${n === 1 ? 'product' : 'products'} · ${catalog.variantCount} ${catalog.variantCount === 1 ? 'variant' : 'variants'}${
          catalog.truncated ? ' · first pages only' : ''
        }`

  const canGenerate = can('listing:generate')

  return (
    <Page>
      <PageHeader
        title="Products"
        description={<span data-testid="products-count">{sub}</span>}
        actions={
          <>
            <UnavailableButton variant="secondary" reason={NOT_YET.export}>
              <Icon name="download" size={16} />
              Export
            </UnavailableButton>
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
        toolbar={
          n > 0 || catalog.isPending ? (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2.5">
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
                    placeholder="Search name or SKU"
                    aria-label="Search loaded products by name or SKU"
                    className="pl-9"
                    data-testid="products-filter"
                  />
                </div>
                <Segmented
                  label="Overall status"
                  value={bucket}
                  onChange={setBucket}
                  options={[
                    { value: 'all', label: 'All', count: catalog.isPending ? undefined : counts.all },
                    ...(catalog.listingsState === 'error'
                      ? []
                      : BUCKETS.map((b) => ({ value: b.value, label: b.label, count: listingsReady ? counts[b.value] : undefined }))),
                  ]}
                />
                <FilterSelect
                  label="Category"
                  value={category}
                  onChange={setCategory}
                  options={categories.map((c) => ({ value: c, label: humanizeSlug(c) }))}
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
              </div>
              <p className="text-caption text-ink-3">
                Marketplace columns: ● live · ◐ working · ▲ needs you · ✕ error · – not listed. The small text is the listing ID.
                {catalog.listingsState === 'error' ? ' Listing status could not be loaded, so status cells show “?”.' : ''}
                {catalog.listingsState !== 'error' && catalog.issuesState === 'error' ? ' Open issues could not be loaded.' : ''}
                {catalog.listingsState === 'error' || catalog.issuesState === 'error' ? (
                  <>
                    {' '}
                    <button type="button" className="focus-ring rounded font-semibold text-brand underline" onClick={catalog.refetch}>
                      Try again
                    </button>
                  </>
                ) : null}
              </p>
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
            <UnavailableButton variant="secondary" size="sm" reason={NOT_YET.pauseArchive}>
              Pause
            </UnavailableButton>
            <UnavailableButton variant="secondary" size="sm" reason="Resubmitting from the catalog is not available yet. Open a listing to retry it.">
              Resubmit
            </UnavailableButton>
            <UnavailableButton variant="secondary" size="sm" reason={NOT_YET.pauseArchive}>
              Archive
            </UnavailableButton>
            {canGenerate ? (
              <Button size="sm" onClick={() => setAdding(selected)} data-testid="bulk-add-marketplace">
                Add marketplace
              </Button>
            ) : (
              <UnavailableButton size="sm" reason="Your role can’t start drafts. An owner or operator can.">
                Add marketplace
              </UnavailableButton>
            )}
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
    </Page>
  )
}
