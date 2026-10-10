/**
 * DataTable: TanStack Table v9 + shadcn table with loading / empty / error states,
 * cursor "Load more" and optional row selection.
 *
 *   const col = columnHelper<ProductOut>()
 *   const columns = col.columns([
 *     selectionColumn<ProductOut>(),
 *     col.accessor('sku', { header: 'SKU', cell: (c) => <code>{c.getValue()}</code> }),
 *   ])
 *   <DataTable list={list} columns={columns} getRowId={(r) => r.id} empty={<EmptyState title="No products yet" />} />
 *
 * Keep `columns` at module scope (or memoized): a new array per render rebuilds the table.
 */
import {
  createColumnHelper,
  rowSelectionFeature,
  tableFeatures,
  useTable,
  type ColumnDef,
  type RowData,
  type RowSelectionState,
  type Updater,
} from '@tanstack/react-table'
import { useState, type ReactNode } from 'react'
import { describeError, isApiError } from '@/api/errors'
import { EmptyState } from '@/components/states/empty-state'
import { ErrorState } from '@/components/states/error-state'
import { ReferenceId } from '@/components/states/reference-id'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { CursorList } from '@/hooks/use-cursor-list'
import { cn } from '@/lib/utils'

export interface DataTableColumnMeta {
  /** Classes for both header and body cells (e.g. 'w-24 text-right'). */
  className?: string
  headerClassName?: string
  cellClassName?: string
}

export const dataTableFeatures = tableFeatures({
  rowSelectionFeature,
  columnMeta: {} as DataTableColumnMeta,
})
export type DataTableFeatures = typeof dataTableFeatures
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DataTableColumn<T extends RowData> = ColumnDef<DataTableFeatures, T, any>

/** Typed column helper bound to the DataTable feature set. */
export const columnHelper = <T extends RowData>() => createColumnHelper<DataTableFeatures, T>()

/** Leading checkbox column (header toggles all loaded rows). */
export function selectionColumn<T extends RowData>(): DataTableColumn<T> {
  return {
    id: '__select',
    meta: { className: 'w-10 pr-0' },
    header: ({ table }) => (
      <Checkbox
        aria-label="Select all loaded rows"
        checked={table.getIsAllRowsSelected() ? true : table.getIsSomeRowsSelected() ? 'indeterminate' : false}
        onCheckedChange={(v) => table.toggleAllRowsSelected(!!v)}
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        aria-label="Select row"
        checked={row.getIsSelected()}
        disabled={!row.getCanSelect()}
        onCheckedChange={(v) => row.toggleSelected(!!v)}
        onClick={(e) => e.stopPropagation()}
      />
    ),
  }
}

export interface DataTableProps<T extends RowData> {
  columns: DataTableColumn<T>[]
  getRowId: (row: T) => string
  /** Pass a useCursorList() result, or the explicit props below. */
  list?: CursorList<T>
  data?: T[]
  isLoading?: boolean
  error?: unknown
  onRetry?: () => void
  hasMore?: boolean
  onLoadMore?: () => void
  isLoadingMore?: boolean
  /** Error from fetching the next page (rows stay visible). */
  loadMoreError?: unknown
  /** Shown when loaded and zero rows. */
  empty?: ReactNode
  enableRowSelection?: boolean | ((row: T) => boolean)
  rowSelection?: RowSelectionState
  onRowSelectionChange?: (next: RowSelectionState) => void
  onRowClick?: (row: T) => void
  /** Accessible name for the table. */
  label: string
  skeletonRows?: number
  className?: string
  /** Rendered above the table (filters, bulk actions). */
  toolbar?: ReactNode
}

const NO_ROWS: never[] = []

export function DataTable<T extends RowData>(props: DataTableProps<T>) {
  const { list } = props
  const data = props.data ?? list?.rows ?? (NO_ROWS as T[])
  const isLoading = props.isLoading ?? list?.isPending ?? false
  const error = props.error ?? (list && !list.data ? list.error : null)
  const onRetry = props.onRetry ?? (list ? () => void list.refetch() : undefined)
  const hasMore = props.hasMore ?? list?.hasNextPage ?? false
  const onLoadMore = props.onLoadMore ?? (list ? () => void list.fetchNextPage() : undefined)
  const isLoadingMore = props.isLoadingMore ?? list?.isFetchingNextPage ?? false
  const loadMoreError = props.loadMoreError ?? (list?.isFetchNextPageError ? list.error : null)

  const [innerSelection, setInnerSelection] = useState<RowSelectionState>({})
  const rowSelection = props.rowSelection ?? innerSelection
  const setSelection = (u: Updater<RowSelectionState>) => {
    const next = typeof u === 'function' ? u(rowSelection) : u
    if (props.onRowSelectionChange) props.onRowSelectionChange(next)
    else setInnerSelection(next)
  }
  const enable = props.enableRowSelection

  const table = useTable({
    features: dataTableFeatures,
    columns: props.columns,
    data,
    getRowId: (row) => props.getRowId(row),
    enableRowSelection: typeof enable === 'function' ? (row) => enable(row.original) : !!enable,
    state: { rowSelection },
    onRowSelectionChange: setSelection,
  })

  const colCount = table.getAllLeafColumns().length
  const rows = table.getRowModel().rows

  let body: ReactNode
  if (isLoading) {
    body = Array.from({ length: props.skeletonRows ?? 6 }, (_, i) => (
      <TableRow key={`sk-${i}`} className="hover:bg-transparent">
        {table.getAllLeafColumns().map((c) => (
          <TableCell key={c.id}>
            <Skeleton className={cn('h-4', c.id === '__select' ? 'w-4' : i % 2 ? 'w-3/4' : 'w-1/2')} />
          </TableCell>
        ))}
      </TableRow>
    ))
  } else if (error) {
    body = (
      <TableRow className="hover:bg-transparent">
        <TableCell colSpan={colCount} className="p-0">
          <ErrorState error={error} onRetry={onRetry} compact />
        </TableCell>
      </TableRow>
    )
  } else if (rows.length === 0) {
    body = (
      <TableRow className="hover:bg-transparent">
        <TableCell colSpan={colCount} className="p-0 whitespace-normal">
          {props.empty ?? <EmptyState title="Nothing here yet" compact />}
        </TableCell>
      </TableRow>
    )
  } else {
    body = rows.map((row) => (
      <TableRow
        key={row.id}
        data-state={row.getIsSelected() ? 'selected' : undefined}
        className={cn(props.onRowClick && 'cursor-pointer')}
        onClick={props.onRowClick ? () => props.onRowClick!(row.original) : undefined}
      >
        {row.getAllCells().map((cell) => {
          const meta = cell.column.columnDef.meta
          return (
            <TableCell key={cell.id} className={cn(meta?.className, meta?.cellClassName)}>
              <table.FlexRender cell={cell} />
            </TableCell>
          )
        })}
      </TableRow>
    ))
  }

  return (
    <div className={cn('flex flex-col gap-3', props.className)}>
      {props.toolbar}
      <div className="overflow-hidden rounded-xl border bg-card shadow-elev-1">
        <Table aria-label={props.label} aria-busy={isLoading || undefined}>
          <TableHeader className="bg-muted/50 [&_tr]:border-border">
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id} className="hover:bg-transparent">
                {group.headers.map((header) => {
                  const meta = header.column.columnDef.meta
                  return (
                    <TableHead
                      key={header.id}
                      className={cn('h-9 text-[0.75rem] font-medium tracking-wide text-muted-foreground', meta?.className, meta?.headerClassName)}
                    >
                      {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>{body}</TableBody>
        </Table>
      </div>
      {loadMoreError ? (
        <div role="alert" className="flex flex-wrap items-center justify-center gap-3 text-sm text-muted-foreground">
          <span>Couldn't load more: {describeError(loadMoreError)}</span>
          {isApiError(loadMoreError) ? <ReferenceId id={loadMoreError.correlationId} /> : null}
        </div>
      ) : null}
      {!isLoading && !error && hasMore && onLoadMore ? (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" className="min-w-32" onClick={onLoadMore} disabled={isLoadingMore} data-testid="load-more">
            {isLoadingMore ? <Spinner data-icon="inline-start" /> : null}
            {isLoadingMore ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
