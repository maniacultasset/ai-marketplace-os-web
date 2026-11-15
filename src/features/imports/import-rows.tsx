/**
 * Rows of one import: GET /imports/{id}/rows?status=…&limit=50&cursor= (server filter, Load more).
 * G2 (sheet photos on): each row's photo links (`photos`) as notes and a Photos column.
 */
import { Icon } from '@/components/la/icons'
import { Link } from '@tanstack/react-router'
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
import { useMemo } from 'react'
import { useRouteExists } from '@/lib/nav'
import { useKeys } from '@/lib/query-keys'
import { cn } from '@/lib/utils'
import { isPhotoProblem, isPhotoWaiting, photoLinkText, plainRowError, rowNotes, rowProblems, type PhotoLink } from './row-errors'
import { useSheetPhotos } from './sheet-photos'

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
      <Icon name="chev" size={14} className="-rotate-90" />
    </Link>
  )
}

const count = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`

/** A row's photo links that are notes: still downloading, failed or skipped (a saved one is not). */
const photoNotes = (photos: readonly PhotoLink[] | undefined) => (photos ?? []).filter((p) => p.status !== 'saved')

/**
 * One row's problems and notes in the seller's words (./row-errors.ts). Problems (errors) say why
 * the row was not imported; notes (warnings, such as no photo yet) never stop a row and read softer.
 * The machine code stays on hover (`title`, `data-code`) for support; field and source are left out.
 */
export function RowIssueList({
  row,
  sheetPhotos = false,
}: {
  row: Pick<ImportRow, 'errors' | 'status'> & Partial<Pick<ImportRow, 'photos'>>
  /** Photos are downloaded from the file's links (G2): the "no photo link" note reads so. */
  sheetPhotos?: boolean
}) {
  const problems = rowProblems(row.errors)
  const notes = rowNotes(row.errors)
  const photos = row.photos ?? []
  if (!problems.length && !notes.length && !photos.length) return null
  return (
    <div className="space-y-4" data-testid="error-report-list">
      {problems.length ? (
        <section className="space-y-2" aria-labelledby="row-problems-heading">
          <h3 id="row-problems-heading" className="text-sm font-semibold">
            {row.status === 'failed' ? 'Why it was not imported' : 'Problems'}
          </h3>
          <ul className="divide-y divide-line rounded-lg border border-line bg-card">
            {problems.map((e, i) => (
              <li key={`${e.error_code}-${i}`} className="flex gap-3 px-4 py-3" data-severity="error" data-code={e.error_code} title={e.error_code}>
                <Icon name="alert" size={16} className="mt-0.5 shrink-0 text-destructive" />
                <p className="min-w-0 text-sm break-words">{plainRowError(e, { sheetPhotos })}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {notes.length ? (
        <section className="space-y-2" aria-labelledby="row-notes-heading" data-testid="row-notes">
          <h3 id="row-notes-heading" className="text-sm font-medium text-muted-foreground">
            {problems.length ? 'Also to know' : 'Notes'}
          </h3>
          <ul className="space-y-1.5">
            {notes.map((e, i) => (
              <li key={`${e.error_code}-${i}`} className="flex gap-2 text-sm text-muted-foreground" data-severity="warning" data-code={e.error_code} title={e.error_code}>
                <Icon name="info" size={14} className="mt-0.5 shrink-0" />
                <span className="min-w-0 break-words">{plainRowError(e, { sheetPhotos })}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {photos.length ? (
        <section className="space-y-2" aria-labelledby="row-photos-heading" data-testid="row-photos">
          <h3 id="row-photos-heading" className="text-sm font-medium text-muted-foreground">
            Photos from the file
          </h3>
          <ul className="space-y-1.5">
            {photos.map((p) => (
              <li
                key={p.link_id}
                className={cn('flex gap-2 text-sm', isPhotoProblem(p) ? 'text-foreground' : 'text-muted-foreground')}
                data-status={p.status}
                data-testid="row-photo"
              >
                <Icon
                  name={p.status === 'saved' ? 'check' : isPhotoProblem(p) ? 'alert' : 'clock'}
                  size={14}
                  className={cn('mt-0.5 shrink-0', p.status === 'saved' && 'text-success', isPhotoProblem(p) && 'text-warning')}
                />
                <span className="min-w-0 break-words">{photoLinkText(p)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}

function IssuesCell({ row }: { row: ImportRow }) {
  const sheetPhotos = useSheetPhotos()
  const problems = rowProblems(row.errors)
  const notes = rowNotes(row.errors)
  const linkNotes = photoNotes(row.photos)
  const first = problems[0] ?? notes[0]
  const noteCount = notes.length + linkNotes.length
  if (!first && !linkNotes.length) return <span className="text-muted-foreground">—</span>
  const label = problems.length ? count(problems.length, 'issue') : count(noteCount, 'note')
  const text = first ? plainRowError(first, { sheetPhotos }) : photoLinkText(linkNotes[0]!)
  return (
    <div className="flex min-w-0 items-center gap-2">
      <p
        className={cn('min-w-0 flex-1 truncate text-xs', problems.length ? 'text-foreground' : 'text-muted-foreground')}
        title={text}
        data-code={first?.error_code}
      >
        {text}
        {problems.length && noteCount ? <span className="text-muted-foreground"> · {count(noteCount, 'note')}</span> : null}
      </p>
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="ghost" size="xs" className="shrink-0" aria-label={`Show ${label} for row ${row.row_number}`}>
            {label}
            <Icon name="chev" size={16} className="-rotate-90" data-icon="inline-end" />
          </Button>
        </SheetTrigger>
        <SheetContent className="w-full gap-0 sm:max-w-lg">
          <SheetHeader className="border-b">
            <SheetTitle>Row {row.row_number}</SheetTitle>
            <SheetDescription>
              {row.sku ? (
                <>
                  SKU <code className="font-mono text-xs break-all">{row.sku}</code> ·{' '}
                </>
              ) : null}
              {row.status === 'failed' ? 'Not imported' : 'Imported, with notes'}
            </SheetDescription>
          </SheetHeader>
          <div className="overflow-y-auto p-4">
            <RowIssueList row={row} sheetPhotos={sheetPhotos} />
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
const SEGMENTED = 'inset-track h-9 w-full rounded-lg border border-line p-1 sm:w-fit'
const SEGMENT =
  'group/segment h-full gap-2 rounded-md px-3 text-[0.8125rem] tactile data-active:border-line data-active:bg-surface data-active:shadow-thumb dark:data-active:border-transparent dark:data-active:bg-background'
const SEGMENT_COUNT =
  'rounded-full bg-ink/[0.07] px-1.5 text-[0.6875rem] leading-[1.125rem] font-medium text-muted-foreground tabular-nums group-data-active/segment:bg-brand-soft group-data-active/segment:text-brand'

/** "3/4": the row's saved photos of its links, toned by what is left (G2). */
export function PhotosCell({ photos }: { photos: readonly PhotoLink[] | undefined }) {
  const list = photos ?? []
  if (!list.length) return <span className="text-muted-foreground">—</span>
  const saved = list.filter((p) => p.status === 'saved').length
  const waiting = list.filter(isPhotoWaiting).length
  const problems = list.filter(isPhotoProblem).length
  const label = `${saved} of ${list.length} ${list.length === 1 ? 'photo' : 'photos'} saved${waiting ? `, ${waiting} downloading` : ''}${problems ? `, ${problems} not saved` : ''}`
  return (
    <Badge variant={problems ? 'warning' : waiting ? 'muted' : 'success'} title={label} aria-label={label} data-testid="row-photos-chip">
      <span className="tabular-nums">
        {saved}/{list.length}
      </span>
    </Badge>
  )
}

const col = columnHelper<ImportRow>()
const baseColumns = col.columns([
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

const photosColumn = col.display({
  id: 'photos',
  header: 'Photos',
  meta: { className: 'w-20' },
  cell: (c) => <PhotosCell photos={c.row.original.photos} />,
})
/** With sheet photos on, a Photos column sits before Issues. */
const photoColumns = [...baseColumns.slice(0, -1), photosColumn, baseColumns[baseColumns.length - 1]!]

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
  const sheetPhotos = useSheetPhotos()
  const columns = useMemo(() => (sheetPhotos ? photoColumns : baseColumns), [sheetPhotos])
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
                {counts ? <span className={SEGMENT_COUNT}>{counts[s.count].toLocaleString('en-IN')}</span> : null}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      }
      empty={
        <EmptyState
          compact
          icon={tab === 'failed' ? 'check' : 'table'}
          title={emptyCopy.title}
          description={emptyCopy.description}
        />
      }
    />
  )
}
