import { Link } from '@tanstack/react-router'
import { ChevronRight, FileUp, Package, Plus, Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { columnHelper, DataTable } from '@/components/data-table'
import { EmptyState } from '@/components/states/empty-state'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Can } from '@/lib/permissions'
import { useProductsList, type Product } from './api'
import { cn } from '@/lib/utils'
import { absoluteTime, RelativeTime, StatusBadge } from './format'

const col = columnHelper<Product>()

/** Interactive elements inside a row sit above the row's stretched SKU link. */
const ABOVE_ROW_LINK = 'relative z-10'

/**
 * Row affordance without touching DataTable: rows anchor the stretched SKU link, and hovering a
 * row underlines its SKU and nudges the chevron.
 */
const ROW_LINK_TABLE = cn(
  '[&_tbody_tr]:relative',
  '[&_tbody_tr:hover_td:first-child_a]:underline',
  '[&_tbody_tr:hover_[data-row-chevron]]:translate-x-0.5 [&_tbody_tr:hover_[data-row-chevron]]:text-foreground',
)

const columns = col.columns([
  col.accessor('sku', {
    header: 'SKU',
    meta: { className: 'w-48 pl-4' },
    cell: (c) => (
      // The link stretches over the whole row (row click), keyboard users still reach one link per row.
      <Link
        to="/products/$productId"
        params={{ productId: c.row.original.id }}
        className="rounded-sm font-mono text-[0.8125rem] text-foreground underline-offset-4 after:absolute after:inset-0 after:content-[''] focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        {c.getValue()}
      </Link>
    ),
  }),
  col.accessor('title', {
    header: 'Title',
    cell: (c) => {
      const parent = c.row.original.parent_product_id
      return (
        <span className="flex min-w-0 items-center gap-2">
          <span className="block max-w-32 truncate font-medium sm:max-w-72 lg:max-w-96" title={c.getValue()}>
            {c.getValue()}
          </span>
          {parent ? (
            <Link
              to="/products/$productId"
              params={{ productId: parent }}
              className={cn(
                ABOVE_ROW_LINK,
                'inline-flex h-5 shrink-0 items-center rounded-md px-1.5 text-xs font-medium text-brand ring-1 ring-brand/20 ring-inset transition-colors duration-150 hover:bg-brand-soft focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none',
              )}
              aria-label="Variant: open parent product"
            >
              Variant
            </Link>
          ) : null}
        </span>
      )
    },
  }),
  col.accessor('category', {
    header: 'Category',
    meta: { className: 'hidden md:table-cell' },
    cell: (c) => (
      <span className="inline-flex h-5 max-w-56 items-center truncate rounded-md bg-muted px-1.5 text-xs text-muted-foreground">
        {c.getValue()}
      </span>
    ),
  }),
  col.accessor('status', {
    header: 'Status',
    meta: { className: 'w-28' },
    cell: (c) => <StatusBadge status={c.getValue()} />,
  }),
  col.accessor('updated_at', {
    header: 'Updated',
    meta: { className: 'hidden w-36 sm:table-cell' },
    cell: (c) => (
      <RelativeTime
        iso={c.getValue()}
        className={cn(ABOVE_ROW_LINK, 'text-[0.8125rem] whitespace-nowrap text-muted-foreground')}
        tooltip={
          <span className="grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 tabular-nums">
            <span className="opacity-70">Updated</span>
            <span>{absoluteTime(c.getValue())}</span>
            <span className="opacity-70">Created</span>
            <span>{absoluteTime(c.row.original.created_at)}</span>
          </span>
        }
      />
    ),
  }),
  col.display({
    id: 'open',
    header: () => <span className="sr-only">Open</span>,
    meta: { className: 'hidden w-10 pr-4 sm:table-cell' },
    cell: () => (
      <ChevronRight
        className="ml-auto size-4 text-muted-foreground/50 transition-[color,transform] duration-150"
        data-row-chevron=""
        aria-hidden
      />
    ),
  }),
])

export function ProductsTable({ pageSize }: { pageSize?: number }) {
  const list = useProductsList(pageSize)
  const [filter, setFilter] = useState('')

  const q = filter.trim().toLowerCase()
  const rows = useMemo(
    () =>
      q
        ? list.rows.filter(
            (p) =>
              p.sku.toLowerCase().includes(q) ||
              p.title.toLowerCase().includes(q) ||
              p.category.toLowerCase().includes(q),
          )
        : list.rows,
    [list.rows, q],
  )

  const hasRows = list.rows.length > 0

  const empty = q ? (
    <EmptyState
      icon={Search}
      title="No loaded products match"
      description={
        list.hasNextPage
          ? 'Only loaded rows are filtered. Load more to search further, or clear the filter.'
          : 'Try a different SKU, title or category.'
      }
      actions={
        <Button variant="outline" size="sm" onClick={() => setFilter('')}>
          Clear filter
        </Button>
      }
      compact
    />
  ) : (
    <EmptyState
      icon={Package}
      title="No products yet"
      description="Products you create or import from a CSV appear here, newest first."
      actions={
        <Can action="product:import">
          <Button size="sm" asChild>
            <Link to="/products/new">
              <Plus data-icon="inline-start" />
              New product
            </Link>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link to="/imports/new">
              <FileUp data-icon="inline-start" />
              Import CSV
            </Link>
          </Button>
        </Can>
      }
    />
  )

  return (
    <DataTable
      label="Products"
      className={ROW_LINK_TABLE}
      list={list}
      data={rows}
      columns={columns}
      getRowId={(p) => p.id}
      empty={empty}
      skeletonRows={8}
      toolbar={
        hasRows ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="relative w-full sm:w-72">
              <Search
                className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter loaded rows"
                aria-label="Filter loaded rows by SKU, title or category"
                className="pr-8 pl-8"
                data-testid="products-filter"
              />
              {filter ? (
                <button
                  type="button"
                  onClick={() => setFilter('')}
                  aria-label="Clear filter"
                  className="absolute top-1/2 right-1.5 inline-flex size-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  <X className="size-3.5" />
                </button>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground tabular-nums" data-testid="products-count" aria-live="polite">
              {q ? `${rows.length} of ` : ''}
              {list.rows.length} loaded{list.hasNextPage ? ' · more available' : ''}
              {list.isFetching && !list.isFetchingNextPage && !list.isPending ? ' · refreshing…' : ''}
            </p>
          </div>
        ) : null
      }
    />
  )
}
