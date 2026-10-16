/**
 * /imports/$importId body: job progress, live counts, error panel,
 * rows table with server status filter, "Retry failed rows".
 */
import { Icon } from '@/components/la/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { api, unwrap } from '@/api/client'
import { isApiError, isNotFound } from '@/api/errors'
import { idempotencyHeader, newIdempotencyKey } from '@/api/idempotency'
import { ErrorState } from '@/components/states/error-state'
import { NotFound } from '@/components/states/not-found'
import { ReferenceId } from '@/components/states/reference-id'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useCan } from '@/lib/permissions'
import { useKeys } from '@/lib/query-keys'
import { toastError } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { ErrorReportList } from './error-report-list'
import { useImportHistory } from './history'
import { ImportRowsTable, type RowsTab } from './import-rows'
import { JobProgress } from './job-progress'
import { markJobLive, useImportJob } from './use-import-job'

const IMPORT_CAP_MESSAGE = 'Two imports are already running. Wait for one to finish.'

/** Consecutive unchanged fetches after which counts of an import with no known job count as settled. */
const SETTLE_FETCHES = 3

export function useImportReport(
  importId: string,
  opts: { live?: boolean; final?: boolean; watch?: boolean } = {},
) {
  const keys = useKeys()
  // `watch`: the job is unknown (started from another browser or the API), so the report itself
  // is the only signal. Poll it every 3 s until the counts stop changing for SETTLE_FETCHES
  // fetches, then every 15 s in case a queued import starts later.
  const [unchanged, setUnchanged] = useState(0)
  const settled = unchanged >= SETTLE_FETCHES
  const query = useQuery({
    queryKey: keys.imports.detail(importId),
    queryFn: () => unwrap(api.GET('/imports/{import_id}', { params: { path: { import_id: importId } } })),
    // Live counts while the worker runs; the job poll drives everything else.
    refetchInterval: opts.live ? 3000 : opts.watch ? (settled ? 15_000 : 3000) : false,
    refetchIntervalInBackground: false,
    // After the job ends the report changes only via explicit invalidation (job end, retry).
    staleTime: opts.final ? Infinity : undefined,
  })
  const d = query.data
  const sig = d ? `${d.total_rows}/${d.imported}/${d.failed}/${d.error ? 1 : 0}` : null
  const last = useRef<{ sig: string; at: number } | null>(null)
  const at = query.dataUpdatedAt
  useEffect(() => {
    if (sig === null || !at) return
    const prev = last.current
    last.current = { sig, at }
    if (!prev || prev.at === at) return
    setUnchanged((n) => (prev.sig === sig ? n + 1 : 0))
  }, [sig, at])
  return Object.assign(query, { settled })
}

export function ImportReportView({
  importId,
  jobId,
  tab,
  onTabChange,
  onJobChange,
  headerSlot,
}: {
  importId: string
  /** Current job from ?job= or local history; null when unknown. */
  jobId: string | null
  tab: RowsTab | undefined
  onTabChange: (t: RowsTab) => void
  onJobChange: (jobId: string) => void
  headerSlot: (actions: ReactNode) => ReactNode
}) {
  const keys = useKeys()
  const qc = useQueryClient()
  const can = useCan()
  const history = useImportHistory()

  // job terminal (bulk_import) -> report + rows (prefix) + every products query.
  const polling = useImportJob(jobId, () => importId)
  const job = polling.job
  const jobKnown = !!jobId && !isNotFound(polling.error)
  const running = job?.status === 'running'
  const live = !!job && !polling.isTerminal

  const report = useImportReport(importId, { live: running, final: polling.isTerminal, watch: !jobKnown })

  // Rows only exist once processed: refresh the rows list whenever the live count grows.
  const total = report.data?.total_rows
  const lastTotal = useRef<number | undefined>(undefined)
  useEffect(() => {
    if (total === undefined) return
    if (lastTotal.current !== undefined && total !== lastTotal.current) {
      void qc.invalidateQueries({ queryKey: keys.importRows.all(importId) })
    }
    lastTotal.current = total
  }, [total, importId, keys, qc])

  // A 404 means the import is gone (or belongs to another brand): drop it from local history.
  const gone = isNotFound(report.error) || (isApiError(report.error) && report.error.status === 422)
  const { remove } = history
  useEffect(() => {
    if (gone) remove(importId)
  }, [gone, importId, remove])

  const [retryMsg, setRetryMsg] = useState<string | null>(null)
  const retry = useMutation({
    meta: { toast: false },
    mutationFn: () =>
      unwrap(
        api.POST('/imports/{import_id}/rows/retry', {
          params: { path: { import_id: importId }, header: idempotencyHeader(newIdempotencyKey()) },
        }),
      ),
    onSuccess: (res) => {
      setRetryMsg(null)
      markJobLive(res.job_id, importId)
      history.setJob(importId, res.job_id)
      onJobChange(res.job_id)
      void qc.invalidateQueries({ queryKey: keys.imports.detail(importId) })
    },
    onError: (err) => {
      if (isApiError(err) && err.type === 'INVALID_STATUS_TRANSITION') {
        setRetryMsg('Nothing to retry, or the import is still running.')
        void qc.invalidateQueries({ queryKey: keys.imports.detail(importId) })
        if (jobId) void qc.invalidateQueries({ queryKey: keys.jobs.detail(jobId) })
        return
      }
      if (isApiError(err) && err.status === 429 && err.retryAfter === null) {
        setRetryMsg(IMPORT_CAP_MESSAGE)
        return
      }
      toastError(err, "Couldn't retry failed rows")
    },
  })

  if (gone) return <NotFound title="Import not found" description="This import does not exist in this brand." backTo="/imports" backLabel="Back to imports" />

  const data = report.data
  // With no job to ask, the import counts as finished once its counts stop changing.
  const jobTerminal = jobKnown ? polling.isTerminal : report.settled
  const failed = data?.failed ?? 0
  const retryEnabled = !!data && jobTerminal && failed > 0 && !retry.isPending
  const retryHint = !data
    ? 'Loading the report…'
    : !jobTerminal
      ? jobKnown
        ? 'Available when the current job finishes.'
        : 'Available once the counts stop changing.'
      : failed === 0
        ? 'No failed rows to retry.'
        : 'Re-run only the failed rows from their stored cells.'

  // Without an explicit tab the default depends on the report and the job: wait for both so the
  // All rows are not fetched and drawn only to be replaced by Failed.
  const tabReady = tab !== undefined || !!report.error || (!!data && (!jobKnown || !!job || !!polling.error))
  // With no job the end is only inferred, so the default stays on All rows.
  const effectiveTab: RowsTab = tab ?? (jobKnown && jobTerminal && failed > 0 ? 'failed' : 'all')

  const actions = can('product:import') ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={retryEnabled ? -1 : 0} className="inline-flex">
          <Button
            variant="outline"
            disabled={!retryEnabled}
            onClick={() => {
              setRetryMsg(null)
              retry.mutate()
            }}
            data-testid="retry-failed"
          >
            {retry.isPending ? <Spinner data-icon="inline-start" /> : <Icon name="refresh" size={16} data-icon="inline-start" />}
            Retry failed rows
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{retryHint}</TooltipContent>
    </Tooltip>
  ) : null

  const soFar = live ? ' so far' : ''

  return (
    <>
      {headerSlot(actions)}
      <div className="space-y-6">
        {retryMsg ? (
          <p role="status" className="flex items-center gap-2.5 rounded-lg border border-brand-line bg-brand-bg px-3.5 py-2.5 text-sm" data-testid="retry-message">
            <Icon name="info" size={16} className="shrink-0 text-brand" />
            {retryMsg}
          </p>
        ) : null}

        {jobKnown ? (
          <JobProgress
            polling={polling}
            importId={importId}
            footer={
              job ? (
                <Link
                  to="/jobs/$jobId"
                  params={{ jobId: job.job_id }}
                  className="inline-flex min-w-0 items-center gap-1.5 rounded-sm text-muted-foreground underline-offset-4 outline-none transition-colors duration-150 hover:text-foreground hover:underline focus-visible:text-foreground focus-visible:underline"
                >
                  Job <span className="truncate font-mono">{job.job_id}</span>
                </Link>
              ) : null
            }
          />
        ) : (
          <p
            className="flex items-start gap-2.5 rounded-lg border border-brand-line bg-brand-bg px-3.5 py-2.5 text-sm"
            data-testid="report-watch"
            data-settled={report.settled ? 'true' : 'false'}
          >
            <Icon name="info" size={16} className="mt-0.5 shrink-0 text-brand" />
            <span>
              Live progress isn't available here: this import was started from another browser.
              {report.settled ? ' The counts below have stopped changing.' : ' The counts below refresh every few seconds.'}
            </span>
          </p>
        )}

        {report.error && !data ? (
          <div className="rounded-card border border-line bg-card shadow-raised-md">
            <ErrorState compact error={report.error} onRetry={() => void report.refetch()} title="Couldn't load the import report" />
          </div>
        ) : (
          <div
            className="grid grid-cols-3 divide-x divide-line overflow-hidden rounded-card border border-line bg-card shadow-raised-md"
            data-testid="import-counts"
          >
            <Stat label={`Processed${soFar}`} value={data?.total_rows} testId="count-total" />
            <Stat label={`Imported${soFar}`} value={data?.imported} tone="success" testId="count-imported" />
            <Stat label={`Failed${soFar}`} value={data?.failed} tone={failed > 0 ? 'danger' : undefined} testId="count-failed" />
          </div>
        )}

        {data?.error ? (
          <section role="alert" className="space-y-3 rounded-card border border-danger-line bg-danger-bg p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-destructive">
                <Icon name="alert" size={16} />
                The import failed
              </h2>
              <ReferenceId id={data.error.request_id} />
            </div>
            {data.error.errors?.length ? <ErrorReportList items={data.error.errors} dense /> : null}
          </section>
        ) : null}

        <section className="space-y-3 pt-2" aria-labelledby="import-rows-heading">
          <h2 id="import-rows-heading" className="text-[0.9375rem] font-semibold tracking-tight">
            Rows
          </h2>
          {tabReady ? (
            <ImportRowsTable
              importId={importId}
              tab={effectiveTab}
              onTabChange={onTabChange}
              counts={data ? { total: data.total_rows, imported: data.imported, failed: data.failed } : null}
              processing={live && (data?.total_rows ?? 0) === 0}
            />
          ) : (
            <div className="space-y-3" data-testid="rows-loading" aria-busy="true">
              <Skeleton className="h-8 w-72 max-w-full rounded-lg" />
              <div className="overflow-hidden rounded-card border border-line bg-card shadow-raised-md">
                {Array.from({ length: 5 }, (_, i) => (
                  <div key={i} className="flex items-center gap-4 border-b px-4 py-3 last:border-b-0">
                    <Skeleton className="h-4 w-10" />
                    <Skeleton className="h-4 flex-1" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </>
  )
}

function Stat({
  label,
  value,
  tone,
  testId,
}: {
  label: string
  value: number | undefined
  tone?: 'success' | 'danger'
  testId: string
}) {
  return (
    <div className="min-w-0 px-4 py-3 sm:px-5">
      <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
        {tone ? (
          <span
            aria-hidden
            className={cn('size-1.5 shrink-0 rounded-full', tone === 'success' ? 'bg-success' : 'bg-destructive')}
          />
        ) : null}
        {label}
      </p>
      {value === undefined ? (
        <Skeleton className="mt-1.5 h-6 w-10" />
      ) : (
        <p
          className={cn(
            'mt-1 text-xl leading-7 font-semibold tracking-tight tabular-nums',
            tone === 'success' && value > 0 && 'text-success',
            tone === 'danger' && 'text-destructive',
          )}
          data-testid={testId}
        >
          {value.toLocaleString()}
        </p>
      )}
    </div>
  )
}
