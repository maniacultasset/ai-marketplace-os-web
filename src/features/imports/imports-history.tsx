/**
 * /imports: this browser's uploads (no list endpoint exists). Each row reads its job status
 * (polled only while non-terminal) and its report counts live; a 404 report drops the row.
 * Rows render in pages of 20 so one visit stays well inside the tenant's 120 req/min budget;
 * finished jobs and their reports are served from cache on later visits.
 */
import { Icon, IconTile } from '@/components/la/icons'
import { Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { isApiError, isNotFound } from '@/api/errors'
import { JobStatusBadge } from '@/components/app/job-status-badge'
import { EmptyState } from '@/components/states/empty-state'
import { ReferenceId } from '@/components/states/reference-id'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useCan } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { formatBytes } from './csv-template'
import { formatDateTime, formatRelative } from './format'
import { useImportHistory, type ImportHistoryEntry } from './history'
import { useImportReport } from './import-report'
import { useImportJob } from './use-import-job'

const HISTORY_PAGE = 20
const HEAD = 'h-9 text-[0.75rem] font-medium tracking-wide text-muted-foreground'

export function ImportsHistory() {
  const { entries } = useImportHistory()
  const can = useCan()
  const [shown, setShown] = useState(HISTORY_PAGE)
  const visible = entries.slice(0, shown)
  const hidden = entries.length - visible.length

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <p className="flex items-center gap-1.5" data-testid="history-note">
          <Icon name="info" size={14} className="shrink-0" />
          Uploads from this browser only. Imports from other browsers are not listed.
        </p>
        {entries.length > 0 ? (
          <p className="tabular-nums">
            {entries.length.toLocaleString()} {entries.length === 1 ? 'import' : 'imports'}
          </p>
        ) : null}
      </div>
      <div className="overflow-hidden rounded-card border border-line bg-card shadow-raised-md">
        <Table aria-label="Recent imports">
          <TableHeader className="bg-sunken [&_tr]:border-line">
            <TableRow className="hover:bg-transparent">
              <TableHead className={HEAD}>File</TableHead>
              <TableHead className={cn(HEAD, 'hidden w-40 sm:table-cell')}>Uploaded</TableHead>
              <TableHead className={cn(HEAD, 'w-56')}>Status</TableHead>
              <TableHead className={cn(HEAD, 'w-24 text-right')}>Imported</TableHead>
              <TableHead className={cn(HEAD, 'w-20 pr-4 text-right')}>Failed</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="p-0 whitespace-normal">
                  <EmptyState
                    icon="table"
                    title="No imports from this browser yet"
                    description={
                      can('product:import')
                        ? 'Upload a CSV of products. Its progress and row report will show up here.'
                        : 'This list shows imports uploaded from this browser. Your role can open an import report from a link but cannot upload.'
                    }
                    actions={
                      can('product:import') ? (
                        <Button size="sm" asChild>
                          <Link to="/imports/new">
                            <Icon name="upload" size={16} data-icon="inline-start" />
                            Import CSV
                          </Link>
                        </Button>
                      ) : null
                    }
                  />
                </TableCell>
              </TableRow>
            ) : (
              visible.map((e) => <HistoryRow key={e.import_id} entry={e} />)
            )}
          </TableBody>
        </Table>
      </div>
      {hidden > 0 ? (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={() => setShown((n) => n + HISTORY_PAGE)} data-testid="history-more">
            Show {Math.min(hidden, HISTORY_PAGE)} more
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function HistoryRow({ entry }: { entry: ImportHistoryEntry }) {
  const navigate = useNavigate()
  const { remove } = useImportHistory()
  const polling = useImportJob(entry.job_id, () => entry.import_id)
  const running = polling.job?.status === 'running'
  // Once the job has ended the report only changes through invalidation (job end, retry).
  const report = useImportReport(entry.import_id, { live: running, final: polling.isTerminal })

  const gone = isNotFound(report.error)
  useEffect(() => {
    if (gone) remove(entry.import_id)
  }, [gone, entry.import_id, remove])

  const open = () =>
    void navigate({ to: '/imports/$importId', params: { importId: entry.import_id }, search: { job: entry.job_id } })

  const reportErr = report.error && !report.data && !gone ? report.error : null
  const count = (v: number | undefined, tone?: string) =>
    reportErr ? (
      <span className="text-muted-foreground">—</span>
    ) : v === undefined ? (
      <Skeleton className="ml-auto h-4 w-8" />
    ) : (
      <span className={cn('font-medium tabular-nums', v > 0 ? tone : 'text-muted-foreground')}>{v.toLocaleString()}</span>
    )

  return (
    <TableRow className="group/row cursor-pointer" onClick={open} data-testid="history-row" data-import-id={entry.import_id}>
      <TableCell className="max-w-72 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <IconTile icon="table" size="sm" className="tactile group-hover/row:text-brand" />
          <div className="min-w-0">
            <Link
              to="/imports/$importId"
              params={{ importId: entry.import_id }}
              search={{ job: entry.job_id }}
              className="block truncate rounded-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:underline"
              onClick={(e) => e.stopPropagation()}
              title={entry.filename}
            >
              {entry.filename}
            </Link>
            <span className="block text-xs text-muted-foreground tabular-nums">
              {formatBytes(entry.size)}
              <span className="sm:hidden">
                {' · '}
                <time dateTime={entry.created_at} title={formatDateTime(entry.created_at)}>
                  {formatRelative(entry.created_at)}
                </time>
              </span>
            </span>
          </div>
        </div>
      </TableCell>
      <TableCell className="hidden text-muted-foreground sm:table-cell">
        <Tooltip>
          <TooltipTrigger asChild>
            <time dateTime={entry.created_at}>{formatRelative(entry.created_at)}</time>
          </TooltipTrigger>
          <TooltipContent>{formatDateTime(entry.created_at)}</TooltipContent>
        </Tooltip>
      </TableCell>
      <TableCell>
        {polling.job ? (
          <span className="inline-flex items-center gap-2">
            <JobStatusBadge status={polling.job.status} />
            {polling.job.status === 'running' ? (
              <span className="text-xs text-muted-foreground tabular-nums">{polling.job.progress_pct}%</span>
            ) : null}
            {polling.isWaitingForWorker ? <span className="text-xs text-muted-foreground">Waiting for a worker…</span> : null}
          </span>
        ) : polling.error ? (
          isNotFound(polling.error) ? (
            <JobStatusBadge status={undefined} />
          ) : (
            <span className="inline-flex flex-col gap-0.5 text-xs text-destructive" onClick={(e) => e.stopPropagation()}>
              Couldn't load status
              {isApiError(polling.error) ? <ReferenceId id={polling.error.correlationId} /> : null}
            </span>
          )
        ) : (
          <Skeleton className="h-5 w-20" />
        )}
      </TableCell>
      <TableCell className="text-right">{count(report.data?.imported, 'text-success')}</TableCell>
      <TableCell className="pr-4 text-right">{count(report.data?.failed, 'text-destructive')}</TableCell>
    </TableRow>
  )
}
