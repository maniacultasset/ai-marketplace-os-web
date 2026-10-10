/**
 * <JobProgress>: status, progress, timestamps, waiting-for-worker hint,
 * rate-limit pause, error panel and Cancel (queued only, `listing:generate`).
 * The caller owns polling (`useJobPolling`) and passes the result in, so a page has exactly one
 * poller per job.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, CircleSlash, Clock, Hourglass, PauseCircle, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { api, unwrap } from '@/api/client'
import { isApiError, isNotFound } from '@/api/errors'
import { idempotencyHeader, newIdempotencyKey } from '@/api/idempotency'
import type { JobEnvelope } from '@/api/types'
import { JobStatusBadge } from '@/components/app/job-status-badge'
import { ErrorState } from '@/components/states/error-state'
import { ReferenceId } from '@/components/states/reference-id'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import type { useJobPolling } from '@/hooks/use-job-polling'
import { useCan } from '@/lib/permissions'
import { useKeys } from '@/lib/query-keys'
import { toastError } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { ErrorReportList } from './error-report-list'
import { formatDateTime, formatDuration, formatTime, importIdFromResultUrl, JOB_KIND_LABEL } from './format'

export type JobPolling = ReturnType<typeof useJobPolling>

function statusLine(job: JobEnvelope): string {
  switch (job.status) {
    case 'queued':
      return 'Waiting in the queue.'
    case 'running':
      return job.kind === 'bulk_import' ? 'Processing rows in batches of 100.' : 'Working on it.'
    case 'succeeded':
      return 'Finished without failures.'
    case 'partial':
      return 'Finished. Some items failed.'
    case 'failed':
      return job.error?.errors?.some((e) => e.error_code === 'JOB_TIMEOUT') ? 'Timed out.' : 'The job failed.'
    case 'cancelled':
      return 'Cancelled before it started.'
    case 'dead_letter':
      return 'Failed permanently (support has been notified).'
  }
}

export function JobProgress({
  polling,
  importId,
  title,
  className,
  footer,
}: {
  polling: JobPolling
  /** Import whose report must be refreshed after a cancel. Defaults to the job's result_url. */
  importId?: string
  title?: ReactNode
  className?: string
  footer?: ReactNode
}) {
  const { job, isWaitingForWorker, rateLimitedFor } = polling
  const keys = useKeys()
  const qc = useQueryClient()
  const can = useCan()
  const [cancelMsg, setCancelMsg] = useState<string | null>(null)

  const cancel = useMutation({
    meta: { toast: false },
    mutationFn: (jobId: string) =>
      unwrap(
        api.POST('/jobs/{job_id}/cancel', {
          params: { path: { job_id: jobId }, header: idempotencyHeader(newIdempotencyKey()) },
        }),
      ),
    onSuccess: (env) => {
      setCancelMsg(null)
      qc.setQueryData(keys.jobs.detail(env.job_id), env)
      const target = importId ?? importIdFromResultUrl(env.result_url)
      if (target) void qc.invalidateQueries({ queryKey: keys.imports.detail(target) })
    },
    onError: (err, jobId) => {
      if (isApiError(err) && err.type === 'INVALID_STATUS_TRANSITION') {
        setCancelMsg("The job already started and can't be cancelled.")
        void qc.invalidateQueries({ queryKey: keys.jobs.detail(jobId) })
        return
      }
      toastError(err, "Couldn't cancel the job")
    },
  })

  if (!job) {
    if (polling.error && !isNotFound(polling.error)) {
      return (
        <section className={cn('rounded-xl bg-card shadow-elev-1 ring-1 ring-border', className)}>
          <ErrorState compact error={polling.error} onRetry={() => void polling.refetch()} title="Couldn't load the job" />
        </section>
      )
    }
    if (isNotFound(polling.error)) {
      return (
        <section className={cn('rounded-xl bg-card px-5 py-4 text-sm text-muted-foreground shadow-elev-1 ring-1 ring-border', className)}>
          The job for this import is no longer available. The report below is still current.
        </section>
      )
    }
    return (
      <section className={cn('space-y-6 rounded-xl bg-card p-5 shadow-elev-1 ring-1 ring-border', className)} aria-busy>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
          <Skeleton className="h-4 w-56 max-w-full" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="size-5 rounded-full" />
          <Skeleton className="h-1 flex-1" />
          <Skeleton className="size-5 rounded-full" />
          <Skeleton className="h-1 flex-1" />
          <Skeleton className="size-5 rounded-full" />
        </div>
      </section>
    )
  }

  const running = job.status === 'running'
  const queued = job.status === 'queued'
  const finished = !running && !queued
  const pct = finished && (job.status === 'succeeded' || job.status === 'partial') ? 100 : job.progress_pct
  const canCancel = queued && can('listing:generate')
  const elapsed = formatDuration(job.started_at ?? job.queued_at, job.finished_at)
  const timing = queued
    ? 'Not started'
    : running
      ? [`${pct}%`, elapsed ? `${elapsed} elapsed` : null].filter(Boolean).join(' · ')
      : elapsed
        ? `Took ${elapsed}`
        : null

  return (
    <section
      className={cn('overflow-hidden rounded-xl bg-card shadow-elev-1 ring-1 ring-border', className)}
      data-testid="job-progress"
      data-job-id={job.job_id}
      data-status={job.status}
      aria-live="polite"
    >
      <div className="flex flex-col gap-6 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[0.9375rem] font-semibold tracking-tight">{title ?? JOB_KIND_LABEL[job.kind] ?? job.kind}</h2>
              <JobStatusBadge status={job.status} />
            </div>
            <p className="text-sm text-muted-foreground">
              {statusLine(job)}
              {job.stage && running ? <span className="ml-1">Stage: {job.stage.replace(/_/g, ' ')}.</span> : null}
            </p>
          </div>
          {canCancel ? (
            <Button
              variant="outline"
              size="sm"
              disabled={cancel.isPending}
              onClick={() => cancel.mutate(job.job_id)}
            >
              {cancel.isPending ? <Spinner data-icon="inline-start" /> : <CircleSlash data-icon="inline-start" />}
              Cancel job
            </Button>
          ) : null}
        </div>

        <JobStepper job={job} pct={pct} />

        {isWaitingForWorker ? (
          <p className="flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2.5 text-sm text-muted-foreground" data-testid="waiting-for-worker">
            <Hourglass className="mt-0.5 size-4 shrink-0" aria-hidden />
            Waiting for a worker… The job stays queued until a background worker picks it up.
          </p>
        ) : null}
        {rateLimitedFor !== null ? (
          <p className="flex items-center gap-2 text-sm text-warning">
            <PauseCircle className="size-4" aria-hidden />
            Rate limited, resuming in {rateLimitedFor} s
          </p>
        ) : null}
        {cancelMsg ? (
          <p className="text-sm text-muted-foreground" role="status">
            {cancelMsg}
          </p>
        ) : null}

        {(job.status === 'failed' || job.status === 'dead_letter') && job.error?.errors?.length ? (
          <ErrorReportList items={job.error.errors} dense />
        ) : null}
        {job.status === 'dead_letter' ? <ReferenceId id={job.request_id} /> : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t bg-muted/30 px-5 py-3 text-xs text-muted-foreground">
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 tabular-nums">
          {timing ? <span>{timing}</span> : null}
          {job.attempt > 1 ? (
            <span className="inline-flex items-center gap-1 text-warning">
              <Clock className="size-3" aria-hidden />
              Attempt {job.attempt} of {job.max_attempts}
            </span>
          ) : null}
        </span>
        {footer}
      </div>
    </section>
  )
}

type StepState = 'done' | 'current' | 'pending' | 'skipped'
type Step = { label: string; state: StepState; at: string | null | undefined; fill?: string; icon?: ReactNode }
type FinalTone = 'success' | 'warning' | 'danger' | 'muted'

const FINAL: Partial<Record<JobEnvelope['status'], { label: string; tone: FinalTone }>> = {
  succeeded: { label: 'Finished', tone: 'success' },
  partial: { label: 'Finished', tone: 'warning' },
  failed: { label: 'Failed', tone: 'danger' },
  dead_letter: { label: 'Failed', tone: 'danger' },
  cancelled: { label: 'Cancelled', tone: 'muted' },
}

const TONE_FILL: Record<FinalTone, string> = {
  success: 'bg-success text-background',
  warning: 'bg-warning text-background',
  danger: 'bg-destructive text-background',
  muted: 'bg-muted-foreground text-background',
}

const LEG_FILL: Record<FinalTone | 'brand', string> = {
  brand: '[&>[data-slot=progress-indicator]]:bg-brand',
  success: '[&>[data-slot=progress-indicator]]:bg-success',
  warning: '[&>[data-slot=progress-indicator]]:bg-warning',
  danger: '[&>[data-slot=progress-indicator]]:bg-destructive',
  muted: '[&>[data-slot=progress-indicator]]:bg-muted-foreground',
}

/** Queued -> Running -> Finished. The second connector is the live progress bar. */
function JobStepper({ job, pct }: { job: JobEnvelope; pct: number }) {
  const final = FINAL[job.status]
  const started = !!job.started_at || job.status === 'running'
  const steps: [Step, Step, Step] = [
    { label: 'Queued', state: job.status === 'queued' ? 'current' : 'done', at: job.queued_at },
    {
      label: job.status === 'running' || !started ? 'Running' : 'Started',
      state: job.status === 'running' ? 'current' : job.status === 'queued' ? 'pending' : started ? 'done' : 'skipped',
      at: job.started_at,
    },
    {
      label: final?.label ?? 'Finished',
      state: final ? 'done' : 'pending',
      at: job.finished_at,
      fill: final ? TONE_FILL[final.tone] : undefined,
      icon: final && (final.tone === 'danger' || final.tone === 'muted') ? <X className="size-3" strokeWidth={3} aria-hidden /> : undefined,
    },
  ]
  const firstLeg = job.status === 'queued' ? 0 : started ? 100 : 0
  const lastLeg = final ? (started ? 100 : 0) : job.status === 'running' ? pct : 0
  const legTone = final && started ? final.tone : 'brand'

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <StepDot {...steps[0]} />
        <Leg value={firstLeg} tone="brand" />
        <StepDot {...steps[1]} />
        <Leg value={lastLeg} tone={legTone} label />
        <StepDot {...steps[2]} />
      </div>
      <ol className="grid grid-cols-3 gap-2 text-xs" aria-label="Job stages">
        {steps.map((s, i) => (
          <li
            key={s.label}
            className={cn('min-w-0 space-y-0.5', i === 1 && 'text-center', i === 2 && 'text-right')}
            aria-current={s.state === 'current' ? 'step' : undefined}
          >
            <p className={cn('truncate font-medium', s.state === 'pending' || s.state === 'skipped' ? 'text-muted-foreground' : 'text-foreground')}>
              {s.label}
            </p>
            <p className="truncate text-muted-foreground tabular-nums">
              {s.at ? (
                <time dateTime={s.at} title={formatDateTime(s.at)}>
                  {formatTime(s.at)}
                </time>
              ) : s.state === 'skipped' ? (
                'Skipped'
              ) : (
                '—'
              )}
            </p>
          </li>
        ))}
      </ol>
    </div>
  )
}

function StepDot({ state, fill, icon }: { state: StepState; fill?: string; icon?: ReactNode }) {
  if (state === 'done') {
    return (
      <span aria-hidden className={cn('flex size-5 shrink-0 items-center justify-center rounded-full', fill ?? 'bg-brand text-brand-foreground')}>
        {icon ?? <Check className="size-3" strokeWidth={3} />}
      </span>
    )
  }
  if (state === 'current') {
    return (
      <span aria-hidden className="flex size-5 shrink-0 items-center justify-center rounded-full border-2 border-brand bg-background ring-4 ring-brand/15">
        <span className="size-2 animate-pulse rounded-full bg-brand" />
      </span>
    )
  }
  return (
    <span
      aria-hidden
      className={cn(
        'size-5 shrink-0 rounded-full border-2 bg-background',
        state === 'skipped' ? 'border-dashed border-border' : 'border-border',
      )}
    />
  )
}

function Leg({ value, tone, label }: { value: number; tone: keyof typeof LEG_FILL; label?: boolean }) {
  return (
    <Progress
      value={value}
      aria-label={label ? 'Job progress' : undefined}
      aria-hidden={label ? undefined : true}
      className={cn('h-1 flex-1 bg-border/70 [&>[data-slot=progress-indicator]]:duration-500', LEG_FILL[tone])}
    />
  )
}
