/**
 * Rows of one import: GET /imports/{id}/rows?status=…&limit=50&cursor= (server filter, Load more).
 */
import { Link } from '@tanstack/react-router'
import { ChevronRight, ListX, Rows3 } from 'lucide-react'
import { api, unwrap } from '@/api/client'
import type { Schema } from '@/api/types'
import { DataTable, columnHelper } from '@/components/data-table'
import { EmptyState } from '@/components/states/empty-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PAGE_SIZE, useCursorList } from '@/hooks/use-cursor-list'
import { useRouteExists } from '@/lib/nav'
import { useKeys } from '@/lib/query-keys'
import { cn } from '@/lib/utils'
import { ErrorReportList, sortErrorItems } from './error-report-list'

export type ImportRow = Schema<'ImportRowResult'>
export type RowsTab = 'all' | 'failed' | 'imported'

const PRODUCT_ROUTE = '/products/$productId'

function ProductCell({ productId }: { productId: string | null | undefined }) {
  const exists = useRouteExists()
  if (!productId) return <span className="text-muted-foreground">—</span>
  const short = `${productId.slice(0, 8)}…`
  if (!exists(PRODUCT_ROUTE)) {
    return (
      <code className="font-mono text-xs text-muted-foreground" title={productId}>
        {short}
      </code>
    )
  }
  return (
    <Link
      to={PRODUCT_ROUTE as never}
      params={{ productId } as never}
      className="inline-flex items-center gap-0.5 font-mono text-xs text-brand underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none"
      title={productId}
      data-testid="row-product-link"
    >
      {short}
      <ChevronRight className="size-3" aria-hidden />
    </Link>
  )
}

function IssuesCell({ row }: { row: ImportRow }) {
  const items = sortErrorItems(row.errors ?? [])
  const first = items[0]
  if (!first) return <span className="text-muted-foreground">—</span>
  const codes = [...new Map(items.map((i) => [i.error_code, i.severity])).entries()]
  return (
    <div className="flex min-w-0 items-center gap-2">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap gap-1">
          {codes.map(([code, sev]) => (
            <code
              key={code}
              data-code={code}
              className={cn(
                'rounded px-1.5 py-0.5 font-mono text-[11px] font-medium',
                sev === 'warning' ? 'bg-warning/10 text-warning' : 'bg-destructive/10 text-destructive',
              )}
            >
              {code}
            </code>
          ))}
        </div>
        <p className="truncate text-xs text-muted-foreground" title={first.message}>
          {first.message}
        </p>
      </div>
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="ghost" size="xs" className="shrink-0" aria-label={`Show ${items.length} issues for row ${row.row_number}`}>
            {items.length} {items.length === 1 ? 'issue' : 'issues'}
            <ChevronRight data-icon="inline-end" />
          </Button>
        </SheetTrigger>
        <SheetContent className="w-full gap-0 sm:max-w-lg">
          <SheetHeader className="border-b">
            <SheetTitle>Row {row.row_number}</SheetTitle>
            <SheetDescription>
              {row.sku ? (
                <>
                  SKU <code className="font-mono text-xs">{row.sku}</code> ·{' '}
                </>
              ) : null}
              {row.status === 'failed' ? 'Not imported' : 'Imported with warnings'}
            </SheetDescription>
          </SheetHeader>
          <div className="overflow-y-auto p-4">
            <ErrorReportList items={items} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}

const SEGMENTS: { value: RowsTab; label: string; count: 'total' | 'failed' | 'imported' }[] = [
  { value: 'all', label: 'All', count: 'total' },
  { value: 'failed', label: 'Failed', count: 'failed' },
  { value: 'imported', label: 'Imported', count: 'imported' },
]
const SEGMENTED = 'h-9 w-full rounded-lg bg-muted/70 p-1 ring-1 ring-inset ring-border/60 sm:w-fit'
const SEGMENT =
  'group/segment h-full gap-2 rounded-md px-3 text-[0.8125rem] transition-[color,background-color,box-shadow] duration-150 data-active:shadow-elev-1 dark:data-active:border-transparent dark:data-active:bg-background'
const SEGMENT_COUNT =
  'rounded-full bg-foreground/[0.06] px-1.5 text-[0.6875rem] leading-[1.125rem] font-medium text-muted-foreground tabular-nums group-data-active/segment:bg-brand-soft group-data-active/segment:text-brand'

const col = columnHelper<ImportRow>()
const columns = col.columns([
  col.accessor('row_number', {
    header: 'Row',
    meta: { className: 'w-16 tabular-nums' },
    cell: (c) => <span data-testid="row-number">{c.getValue()}</span>,
  }),
  col.accessor('sku', {
    header: 'SKU',
    meta: { className: 'max-w-48' },
    cell: (c) => {
      const v = c.getValue()
      return v ? (
        <code className="block truncate font-mono text-xs" title={v}>
          {v}
        </code>
      ) : (
        <span className="text-muted-foreground">—</span>
      )
    },
  }),
  col.accessor('status', {
    header: 'Status',
    meta: { className: 'w-28' },
    cell: (c) =>
      c.getValue() === 'imported' ? (
        <Badge variant="success">
          <span className="size-1.5 rounded-full bg-current" aria-hidden /> Imported
        </Badge>
      ) : (
        <Badge variant="danger">
          <span className="size-1.5 rounded-full bg-current" aria-hidden /> Failed
        </Badge>
      ),
  }),
  col.accessor('product_id', {
    header: 'Product',
    meta: { className: 'w-32' },
    cell: (c) => <ProductCell productId={c.getValue()} />,
  }),
  col.display({
    id: 'issues',
    header: 'Issues',
    meta: { className: 'min-w-56' },
    cell: (c) => <IssuesCell row={c.row.original} />,
  }),
])

export function ImportRowsTable({
  importId,
  tab,
  onTabChange,
  counts,
  processing,
}: {
  importId: string
  tab: RowsTab
  onTabChange: (t: RowsTab) => void
  counts: { total: number; imported: number; failed: number } | null
  processing: boolean
}) {
  const keys = useKeys()
  const status = tab === 'all' ? undefined : tab
  const list = useCursorList<ImportRow>({
    queryKey: keys.importRows.list(importId, status),
    fetchPage: (cursor) =>
      unwrap(
        api.GET('/imports/{import_id}/rows', {
          params: { path: { import_id: importId }, query: { status, limit: PAGE_SIZE, cursor } },
        }),
      ),
  })

  const emptyCopy = processing
    ? { title: 'No rows processed yet', description: 'Rows appear here as the worker finishes each batch.' }
    : tab === 'failed'
      ? { title: 'No failed rows', description: 'Every processed row was imported.' }
      : tab === 'imported'
        ? { title: 'No imported rows', description: 'No row of this file was imported. Check the Failed tab.' }
        : { title: 'No rows', description: 'This import has no processed rows.' }

  return (
    <DataTable
      label="Import rows"
      list={list}
      columns={columns}
      getRowId={(r) => String(r.row_number)}
      skeletonRows={5}
      toolbar={
        <Tabs value={tab} onValueChange={(v) => onTabChange(v as RowsTab)}>
          <TabsList aria-label="Filter rows by status" className={SEGMENTED}>
            {SEGMENTS.map((s) => (
              <TabsTrigger key={s.value} value={s.value} className={SEGMENT}>
                {s.label}
                {counts ? <span className={SEGMENT_COUNT}>{counts[s.count].toLocaleString()}</span> : null}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      }
      empty={
        <EmptyState
          compact
          icon={tab === 'failed' ? ListX : Rows3}
          title={emptyCopy.title}
          description={emptyCopy.description}
        />
      }
    />
  )
}
