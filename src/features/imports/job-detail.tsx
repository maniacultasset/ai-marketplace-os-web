/** /jobs/$jobId: generic job envelope + live progress + link to its result. */
import { Link } from '@tanstack/react-router'
import { isApiError, isNotFound } from '@/api/errors'
import type { JobEnvelope } from '@/api/types'
import { PageHeader } from '@/components/app/page-header'
import { CardHead, LaCard } from '@/components/la/cards'
import { Icon } from '@/components/la/icons'
import { NotFound } from '@/components/states/not-found'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { KeyValues } from '@/features/listing-flow/ui'
import { formatDateTime, importIdFromResultUrl } from './format'
import { JobProgress } from './job-progress'
import { useImportJob } from './use-import-job'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A listing job (generate, publish, status sync) belongs to a product; its fuller view is the agent run. */
const isListingJob = (job: Pick<JobEnvelope, 'kind' | 'listing_id'> | undefined) =>
  !!job && (!!job.listing_id || job.kind.startsWith('listing_'))

export function JobDetail({ jobId }: { jobId: string }) {
  const valid = UUID.test(jobId)
  const polling = useImportJob(valid ? jobId : null, (job) =>
    job.kind === 'bulk_import' ? importIdFromResultUrl(job.result_url) : null,
  )
  const job = polling.job
  const listingJob = isListingJob(job)

  // Until the job is known its kind is too: hold the breadcrumb and the action with skeletons, then
  // paint the right trail (Imports or Products) and "Open the agent run" together, so neither flips.
  const loading = valid && !job && !polling.error

  const header = (
    <>
      {loading ? (
        <div className="mb-3 flex h-5 items-center" aria-hidden data-testid="job-crumbs-loading">
          <Skeleton className="h-3 w-24" />
        </div>
      ) : null}
      <PageHeader
        title="Job"
        description="Status, timing and result of a background job."
        breadcrumbs={
          loading
            ? undefined
            : listingJob
              ? [{ label: 'Products', to: '/products' }, { label: 'Job' }]
              : [{ label: 'Imports', to: '/imports' }, { label: 'Job' }]
        }
        actions={
          loading ? (
            <Skeleton className="h-9 w-40 rounded-control" />
          ) : job && listingJob ? (
            <Button asChild data-testid="job-run-link">
              <Link to="/runs/$runId" params={{ runId: job.job_id }}>
                Open the agent run
              </Link>
            </Button>
          ) : undefined
        }
      />
    </>
  )

  if (!valid || isNotFound(polling.error) || (isApiError(polling.error) && polling.error.status === 422)) {
    return (
      <>
        {header}
        <NotFound title="Job not found" description="This job does not exist in this brand." backTo="/imports" backLabel="Back to imports" />
      </>
    )
  }

  const importId = importIdFromResultUrl(job?.result_url)

  return (
    <>
      {header}
      <div className="grid items-start gap-4 lg:grid-cols-3">
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
                className="inline-flex items-center gap-1 focus-ring rounded-sm font-semibold text-brand underline-offset-4 hover:underline"
                data-testid="job-result-link"
              >
                Open import report <Icon name="arrow" size={14} />
              </Link>
            ) : job?.kind === 'bulk_import' && !job.result_url ? (
              <span>The report link appears once the worker starts.</span>
            ) : null
          }
        />
        <LaCard>
          <CardHead title="Details" />
          {job ? (
            <KeyValues
              className="mt-4 grid-cols-[96px_minmax(0,1fr)] tabular-nums"
              rows={[
                { term: 'Attempt', value: job.attempt === 0 ? '—' : `${job.attempt} of ${job.max_attempts}` },
                { term: 'Queued', value: <time dateTime={job.queued_at}>{formatDateTime(job.queued_at)}</time> },
                { term: 'Job ID', value: <span className="font-mono text-caption break-all">{job.job_id}</span> },
                { term: 'Request ID', value: <span className="font-mono text-caption break-all">{job.request_id}</span> },
              ]}
            />
          ) : (
            <div className="mt-4 flex flex-col gap-3" aria-busy>
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="grid grid-cols-[96px_minmax(0,1fr)] gap-3">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-36 max-w-full" />
                </div>
              ))}
            </div>
          )}
        </LaCard>
      </div>
    </>
  )
}
