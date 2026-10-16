/** /jobs/$jobId: generic job envelope + live progress + link to its result. */
import { Icon } from '@/components/la/icons'
import { Link } from '@tanstack/react-router'
import { isApiError, isNotFound } from '@/api/errors'
import type { ReactNode } from 'react'
import { NotFound } from '@/components/states/not-found'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { formatDateTime, importIdFromResultUrl } from './format'
import { JobProgress } from './job-progress'
import { useImportJob } from './use-import-job'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function JobDetail({ jobId }: { jobId: string }) {
  const valid = UUID.test(jobId)
  const polling = useImportJob(valid ? jobId : null, (job) =>
    job.kind === 'bulk_import' ? importIdFromResultUrl(job.result_url) : null,
  )

  if (!valid || isNotFound(polling.error) || (isApiError(polling.error) && polling.error.status === 422)) {
    return <NotFound title="Job not found" description="This job does not exist in this brand." backTo="/imports" backLabel="Back to imports" />
  }

  const job = polling.job
  const importId = importIdFromResultUrl(job?.result_url)

  return (
    <div className="grid items-start gap-6 lg:grid-cols-3">
      <JobProgress
        className="lg:col-span-2"
        polling={polling}
        importId={importId ?? undefined}
        footer={
          job && importId ? (
            <Link
              to="/imports/$importId"
              params={{ importId }}
              search={{ job: job.job_id }}
              className="inline-flex items-center gap-1 rounded-sm font-medium text-brand underline-offset-4 outline-none hover:underline focus-visible:underline"
              data-testid="job-result-link"
            >
              Open import report <Icon name="arrow" size={12} />
            </Link>
          ) : job?.kind === 'bulk_import' && !job.result_url ? (
            <span>The report link appears once the worker starts.</span>
          ) : null
        }
      />
      <Card className="gap-0 py-0">
        <h2 className="border-b px-5 py-4 text-[0.9375rem] leading-snug font-semibold tracking-tight">Details</h2>
        {job ? (
          <dl className="divide-y divide-border/70 px-5 text-sm">
            <Prop label="Attempt">
              {job.attempt === 0 ? '—' : `${job.attempt} of ${job.max_attempts}`}
            </Prop>
            <Prop label="Queued">
              <time dateTime={job.queued_at}>{formatDateTime(job.queued_at)}</time>
            </Prop>
            <Prop label="Job ID" stacked>
              <span className="font-mono text-xs break-all">{job.job_id}</span>
            </Prop>
            <Prop label="Request ID" stacked>
              <span className="font-mono text-xs break-all">{job.request_id}</span>
            </Prop>
          </dl>
        ) : (
          <div className="space-y-3 px-5 py-4" aria-busy>
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="flex justify-between gap-4">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-28" />
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

/** Label left, value right; `stacked` puts long identifiers under their label so they stay whole. */
function Prop({ label, children, stacked }: { label: string; children: ReactNode; stacked?: boolean }) {
  return (
    <div className={cn('min-h-11 gap-x-3 gap-y-1 py-3', stacked ? 'flex flex-col' : 'grid grid-cols-[6rem_minmax(0,1fr)] items-baseline')}>
      <dt className="text-[0.8125rem] text-muted-foreground">{label}</dt>
      <dd className={cn('min-w-0 tabular-nums', !stacked && 'text-right')}>{children}</dd>
    </div>
  )
}
