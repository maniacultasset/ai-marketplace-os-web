/**
 * 12 Agent run (/runs/$runId). A "run" is one listing job: the backend has no product-run API, so
 * the run id is the job id (GET /jobs/{id}) and everything else hangs off its listing:
 *   - Progress: run-steps.ts from the job stage and the listing status (never a fake bar);
 *   - Marketplaces: the product's listings (GET /listings?product_id=), the job's progress_pct on
 *     its own lane; supported marketplaces with no listing offer "List on <marketplace>";
 *   - Agent log: GET /listings/{id}/history plus the job's own start and finish.
 * Pause is not in the API: disabled with the reason.
 */
import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { BUILT } from '@/api/capabilities'
import { isApiError, isNotFound } from '@/api/errors'
import { useIntentKey } from '@/api/idempotency'
import type { JobEnvelope } from '@/api/types'
import { Page } from '@/components/app/page-header'
import {
  Banner,
  CardHead,
  Icon,
  LaCard,
  MarketplaceTile,
  NOT_YET,
  ProgressBar,
  Segmented,
  StatusChip,
  SUPPORTED_MARKETPLACES,
  UnavailableButton,
} from '@/components/la'
import { ErrorState } from '@/components/states/error-state'
import { NotFound } from '@/components/states/not-found'
import { ReferenceId } from '@/components/states/reference-id'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  invalidateListingWork,
  useCancelJob,
  useListing,
  useListingHistory,
  useListingSubmissions,
  usePublishListings,
  useRegenerateListing,
  useRetryFields,
} from '@/features/listings/api'
import { rememberJob } from '@/features/listings/job-memory'
import {
  historyLabel,
  JOB_KIND_LABEL,
  listingActions,
  publishItems,
  sentence,
  STATUS_META,
  summarizeBatch,
  type AuditEvent,
  type BatchItemResult,
  type Listing,
  type ListingActions,
  type ListingDetail,
} from '@/features/listings/model'
import { useProduct } from '@/features/products/api'
import { useJobPolling } from '@/hooks/use-job-polling'
import { useMe } from '@/lib/auth'
import { listingChip } from '@/lib/listing-chip'
import { useCan } from '@/lib/permissions'
import { useKeys } from '@/lib/query-keys'
import { toast, toastError } from '@/lib/toast'
import { useProductListings } from './api'
import { clock, mpName } from './format'
import { ListOnButton } from './list-on'
import { liveProof } from './proof'
import { runIsActive, runSteps } from './run-steps'
import { ActionButton, CardSkeleton, HeadSkeleton, ScreenHead, stepTone, Timeline, TimelineItem, type DotTone } from './ui'

export function AgentRun({ runId }: { runId: string }) {
  const keys = useKeys()
  const qc = useQueryClient()
  const job = useJobPolling(runId, {
    onTerminal: (j) => {
      if (j.listing_id) invalidateListingWork(qc, keys, [j.listing_id])
    },
  })

  if (job.isPending)
    return (
      <Page>
        <RunSkeleton />
      </Page>
    )
  if (job.error && !job.data) {
    if (isNotFound(job.error) || job.error.status === 422)
      return (
        <Page>
          <NotFound title="Run not found" description="There is no agent run with this ID in this brand." backTo="/products" backLabel="Back to products" />
        </Page>
      )
    return (
      <Page>
        <LaCard>
          <ErrorState error={job.error} title="Couldn’t load this run" onRetry={() => void job.refetch()} />
        </LaCard>
      </Page>
    )
  }
  const envelope = job.data!
  if (!envelope.listing_id)
    return (
      <Page>
        <NotFound
          title="This job is not a listing run"
          description="Open it on the job page to see its status and result."
          backTo={`/jobs/${envelope.job_id}`}
          backLabel="Open the job"
        />
      </Page>
    )
  return (
    <RunBody
      job={envelope}
      listingId={envelope.listing_id}
      waiting={job.isWaitingForWorker}
      rateLimitedFor={job.rateLimitedFor}
    />
  )
}

function RunSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading the run">
      <HeadSkeleton />
      <div className="grid gap-4 lg:grid-cols-[270px_minmax(0,1fr)]">
        <CardSkeleton lines={6} />
        <div className="flex flex-col gap-4">
          <CardSkeleton lines={3} />
          <CardSkeleton lines={3} />
        </div>
      </div>
    </div>
  )
}

function RunBody({
  job,
  listingId,
  waiting,
  rateLimitedFor,
}: {
  job: JobEnvelope
  listingId: string
  waiting: boolean
  rateLimitedFor: number | null
}) {
  const can = useCan()
  const listingQ = useListing(listingId)
  const listing = listingQ.data?.data
  const product = useProduct(listing?.product_id)
  const siblings = useProductListings(listing?.product_id)
  const cancel = useCancelJob()
  const cancelKey = useIntentKey()
  const subs = useListingSubmissions(listingId, listing?.status === 'published')

  const validation = listing?.validation && listing.validation.listing_version_id === listing.current_version_id ? listing.validation : null
  // Same proof rule as the Live screen: the marketplace's word alone does not finish the run.
  const liveConfirmed = !!listing && listing.marketplace_state === 'live' && liveProof(listing, null, subs.rows).state === 'live'
  const runInput = {
    job,
    listing,
    validation: validation ? { blocking: validation.blocking_count, warnings: validation.warning_count } : null,
    liveConfirmed,
  }
  const steps = runSteps(runInput)
  const active = runIsActive(runInput)

  if (listingQ.isPending)
    return (
      <Page>
        <RunSkeleton />
      </Page>
    )
  if (listingQ.error || !listing)
    return (
      <Page>
        <LaCard>
          <ErrorState error={listingQ.error} title="Couldn’t load the listing for this run" onRetry={() => void listingQ.refetch()} />
        </LaCard>
      </Page>
    )

  const p = product.data
  const chip = active ? { status: 'working' as const, label: 'Working' } : listingChip(listing)
  const jobFailed = job.status === 'failed' || job.status === 'dead_letter'
  const sub = [
    p?.sku,
    mpName(listing.marketplace),
    JOB_KIND_LABEL[job.kind] ?? sentence(job.kind),
    `started ${clock(job.started_at ?? job.queued_at)}`,
    job.attempt > 1 ? `attempt ${job.attempt} of ${job.max_attempts}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <Page>
      <ScreenHead
        title={p ? p.title : <Skeleton className="h-7 w-64" />}
        sub={sub}
        right={
          <>
            <StatusChip status={chip.status}>
              {chip.label}
            </StatusChip>
            {job.status === 'queued' && can('listing:generate') ? (
              <Button
                variant="ghost"
                disabled={cancel.isPending}
                onClick={() =>
                  cancel.mutate(
                    { jobId: job.job_id, key: cancelKey.get() },
                    {
                      onSuccess: () => cancelKey.reset(),
                      // A network failure keeps the key, so a retry replays the same request.
                      onError: (e) => {
                        if (isApiError(e) && !e.isNetwork) cancelKey.reset()
                      },
                    },
                  )
                }
              >
                {cancel.isPending ? 'Cancelling…' : 'Cancel'}
              </Button>
            ) : null}
            <UnavailableButton variant="secondary" reason={NOT_YET.pauseArchive} data-testid="run-pause">
              <Icon name="pause" size={14} />
              Pause
            </UnavailableButton>
          </>
        }
      />

      <div className="mb-4 flex flex-col gap-3 empty:hidden">
        {waiting ? (
          <Banner tone="neutral" role="status" title="Waiting for a worker…">
            The job is queued. It starts as soon as a worker is free.
          </Banner>
        ) : null}
        {rateLimitedFor != null ? (
          <Banner tone="attention" role="status">
            Too many requests. Checking again in {rateLimitedFor} s.
          </Banner>
        ) : null}
        {jobFailed ? (
          <Banner
            tone="danger"
            role="alert"
            title={`${JOB_KIND_LABEL[job.kind] ?? 'The job'} failed.`}
            action={<FailedJobAction job={job} listing={listing} />}
          >
            <span className="block">{job.error?.errors?.[0]?.message ?? 'The agent stopped before it finished.'}</span>
            <ReferenceId id={job.error?.request_id ?? job.request_id} className="mt-1" />
          </Banner>
        ) : null}
        {!active && (listing.status === 'validated' || listing.status === 'needs_review') ? (
          <Banner
            tone="info"
            icon="shield"
            title="Ready for review."
            action={
              <Button size="sm" asChild>
                <Link to="/listings/$listingId/review" params={{ listingId }}>
                  Review and approve
                </Link>
              </Button>
            }
          >
            Nothing is sent until a person approves it.
          </Banner>
        ) : null}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[270px_minmax(0,1fr)]">
        <LaCard data-testid="run-progress">
          <h3 className="text-h3 text-ink">Progress</h3>
          <Timeline className="mt-4" label="Progress">
            {steps.map((s) => (
              <TimelineItem key={s.id} tone={stepTone(s.state)} meta={s.sub} className={s.state === 'todo' ? 'text-ink-3' : undefined}>
                <span data-step={s.id} data-state={s.state} className={s.state === 'todo' ? '' : 'font-bold text-ink'}>
                  {s.label}
                </span>
              </TimelineItem>
            ))}
          </Timeline>
        </LaCard>

        <div className="flex min-w-0 flex-col gap-4">
          <LaCard data-testid="run-marketplaces">
            <h3 className="text-h3 text-ink">Marketplaces</h3>
            {siblings.isPending ? (
              <div className="mt-4 flex flex-col gap-4" aria-hidden>
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
              </div>
            ) : siblings.error ? (
              <ErrorState error={siblings.error} compact title="Couldn’t load the marketplaces" onRetry={() => void siblings.refetch()} />
            ) : (
              <Lanes
                productId={listing.product_id}
                listings={siblings.rows.length ? siblings.rows : [listing]}
                runListingId={listingId}
                job={job}
                active={active}
              />
            )}
          </LaCard>
          <AgentLog listingId={listingId} job={job} />
        </div>
      </div>
    </Page>
  )
}

/* ---------------------------------------------------------------------------------------------- */

/**
 * The way out of a failed job depends on what failed. A failed generation is generated again. A
 * failed publish keeps the approved content: retry the fields the marketplace refused, or publish
 * again (both POST with Idempotency-Key and open the new run). A failed status check changes
 * nothing on the listing, so it points to the status page, where "Check status now" lives.
 */
export function failedJobRemedy(
  kind: string,
  actions: Pick<ListingActions, 'retryFields' | 'publish' | 'regenerate'>,
): 'regenerate' | 'retry-fields' | 'publish' | 'status' | null {
  if (kind === 'listing_generate') return actions.regenerate.show ? 'regenerate' : null
  if (kind === 'listing_publish') {
    if (actions.retryFields.show) return 'retry-fields'
    if (actions.publish.show) return 'publish'
    return 'status'
  }
  if (kind === 'listing_status_sync') return 'status'
  return null
}

function FailedJobAction({ job, listing }: { job: JobEnvelope; listing: ListingDetail }) {
  const can = useCan()
  const navigate = useNavigate()
  const regenerate = useRegenerateListing(listing.id)
  const regenKey = useIntentKey()
  const retry = useRetryFields(listing.id)
  const retryKey = useIntentKey()
  const publish = usePublishListings()
  const publishKey = useIntentKey()
  const actions = listingActions({ listing, validation: listing.validation, can, publishBuilt: BUILT['listings.publish'] })
  const remedy = failedJobRemedy(job.kind, actions)
  const mp = mpName(listing.marketplace)

  const open = (jobId: string) => {
    rememberJob(listing.id, jobId)
    void navigate({ to: '/runs/$runId', params: { runId: jobId } })
  }
  // A network failure keeps the key, so a retry replays the same request.
  const keepOnNetwork = (key: { reset: () => void }) => (e: unknown) => {
    if (isApiError(e) && !e.isNetwork) key.reset()
  }

  switch (remedy) {
    case 'regenerate':
      return (
        <ActionButton
          state={actions.regenerate}
          size="sm"
          variant="secondary"
          disabled={regenerate.isPending}
          onClick={() =>
            regenerate.mutate(
              { instructions: null, key: regenKey.get() },
              {
                onSuccess: (a) => {
                  regenKey.reset()
                  open(a.job_id)
                },
                onError: (e) => {
                  keepOnNetwork(regenKey)(e)
                  toastError(e, 'Couldn’t start a new generation')
                },
              },
            )
          }
        >
          {regenerate.isPending ? 'Starting…' : 'Generate again'}
        </ActionButton>
      )
    case 'retry-fields':
      return (
        <ActionButton
          state={actions.retryFields}
          size="sm"
          variant="secondary"
          disabled={retry.isPending}
          onClick={() =>
            retry.mutate(retryKey.get(), {
              onSuccess: (a) => {
                retryKey.reset()
                open(a.job_id)
              },
              onError: keepOnNetwork(retryKey),
            })
          }
        >
          {retry.isPending ? 'Retrying…' : 'Retry the refused fields'}
        </ActionButton>
      )
    case 'publish':
      return (
        <ActionButton
          state={actions.publish}
          size="sm"
          variant="secondary"
          disabled={publish.isPending}
          onClick={() =>
            publish.mutate(
              { items: publishItems([listing]), key: publishKey.get() },
              {
                onSuccess: (res) => {
                  publishKey.reset()
                  const out = summarizeBatch(res)
                  const ok: BatchItemResult | undefined = out.ok[0]
                  if (ok?.job_id) open(ok.job_id)
                  else if (out.failed[0]) {
                    const f = out.failed[0]
                    toast.error(`Couldn’t publish to ${mp}`, { description: `${f.message}${f.requestId ? ` Reference: ${f.requestId}` : ''}` })
                  }
                },
                onError: (e) => {
                  keepOnNetwork(publishKey)(e)
                  toastError(e, 'Couldn’t publish')
                },
              },
            )
          }
        >
          {publish.isPending ? 'Publishing…' : actions.publish.label}
        </ActionButton>
      )
    case 'status':
      return (
        <Button size="sm" variant="secondary" asChild>
          <Link to="/listings/$listingId/live" params={{ listingId: listing.id }}>
            Open the status
          </Link>
        </Button>
      )
    default:
      return null
  }
}

/* ---------------------------------------------------------------------------------------------- */

function laneSub(l: Listing, run: boolean, job: JobEnvelope): string {
  const at = clock(l.status_changed_at)
  if (run && (job.status === 'queued' || job.status === 'running')) return `${JOB_KIND_LABEL[job.kind] ?? 'Working'} · attempt ${job.attempt}`
  if (l.status === 'published') return `Submitted · ${at}`
  return `${STATUS_META[l.status].label} · ${at}`
}

function LaneAction({ l }: { l: Listing }) {
  const params = { listingId: l.id }
  if (l.status === 'validated' || l.status === 'needs_review')
    return (
      <Button size="sm" asChild>
        <Link to="/listings/$listingId/review" params={params}>
          Review
        </Link>
      </Button>
    )
  if (l.status === 'published' || l.status === 'approved' || l.status === 'publishing')
    return (
      <Button size="sm" variant="secondary" asChild>
        <Link to="/listings/$listingId/live" params={params}>
          {l.marketplace_state === 'live' ? 'See proof' : 'Status'}
        </Link>
      </Button>
    )
  if (l.status === 'blocked' || l.status === 'failed')
    return (
      <Button size="sm" variant="warn" asChild>
        <Link to="/listings/$listingId/mapping" params={params}>
          See checks
        </Link>
      </Button>
    )
  return null
}

function Lanes({
  productId,
  listings,
  runListingId,
  job,
  active,
}: {
  productId: string
  listings: readonly Listing[]
  runListingId: string
  job: JobEnvelope
  active: boolean
}) {
  const missing = SUPPORTED_MARKETPLACES.filter((m) => !listings.some((l) => l.marketplace === m.id))
  return (
    <ul className="m-0 mt-4 flex list-none flex-col p-0">
      {listings.map((l) => {
        const run = l.id === runListingId
        const chip = run && active ? { status: 'working' as const, label: 'Working' } : listingChip(l)
        return (
          <li key={l.id} data-lane={l.marketplace} className="flex min-h-[72px] flex-wrap items-center gap-3 border-b border-line py-3.5 sm:flex-nowrap first:pt-0 last:border-b-0 last:pb-0">
            <MarketplaceTile id={l.marketplace} />
            <div className="min-w-0 flex-1 basis-[calc(100%-60px)] sm:basis-0">
              <b className="font-semibold text-ink">{mpName(l.marketplace)}</b>
              <div className="text-caption text-ink-3">{laneSub(l, run, job)}</div>
              {run && active && job.kind === 'listing_generate' ? (
                <ProgressBar className="mt-2" value={job.progress_pct / 100} label={`${mpName(l.marketplace)} progress`} />
              ) : null}
            </div>
            <StatusChip status={chip.status}>{chip.label}</StatusChip>
            <LaneAction l={l} />
          </li>
        )
      })}
      {missing.map((m) => (
        <li key={m.id} data-lane={m.id} className="flex min-h-[72px] flex-wrap items-center gap-3 border-b border-line py-3.5 sm:flex-nowrap last:border-b-0 last:pb-0">
          <MarketplaceTile id={m.id} />
          <div className="min-w-0 flex-1 basis-[calc(100%-60px)] sm:basis-0">
            <b className="font-semibold text-ink">{m.name}</b>
            <div className="text-caption text-ink-3">Not listed yet. Uses the same product record.</div>
          </div>
          <StatusChip status="not-listed" />
          <ListOnButton productId={productId} marketplace={m.id as 'amazon' | 'flipkart'} size="sm" variant="secondary" />
        </li>
      ))}
    </ul>
  )
}

/* ---------------------------------------------------------------------------------------------- */

type LogFilter = 'all' | 'changes' | 'reviews'

const CHANGE_ACTIONS = new Set(['listing.edited', 'listing.regenerate_requested', 'listing.revalidated'])
const REVIEW_ACTIONS = new Set(['listing.approved', 'listing.approve_denied', 'listing.rejected', 'listing.publish_requested'])

interface LogEntry {
  id: string
  at: string
  tone: DotTone
  text: string
  kind: 'change' | 'review' | 'job'
}

export function eventTone(action: string): DotTone {
  if (action === 'listing.approve_denied' || action === 'listing.rejected') return 'need'
  return 'ok'
}

function actorPhrase(e: AuditEvent, meId: string | undefined): string {
  if (e.actor_type === 'system') return 'by the agent'
  if (e.actor_type === 'staff') return 'by support'
  return e.actor_user_id && e.actor_user_id === meId ? 'by you' : 'by a teammate'
}

export function logEntries(events: readonly AuditEvent[], job: Pick<JobEnvelope, 'job_id' | 'kind' | 'status' | 'started_at' | 'finished_at' | 'error'>, meId?: string): LogEntry[] {
  const out: LogEntry[] = events.map((e) => ({
    id: e.id,
    at: e.occurred_at,
    tone: eventTone(e.action),
    text: `${historyLabel(e.action)} ${actorPhrase(e, meId)}.${e.reason ? ` Reason: ${sentence(e.reason).toLowerCase()}.` : ''}`,
    kind: CHANGE_ACTIONS.has(e.action) ? 'change' : REVIEW_ACTIONS.has(e.action) ? 'review' : 'change',
  }))
  const name = JOB_KIND_LABEL[job.kind] ?? sentence(job.kind)
  if (job.started_at) out.push({ id: `${job.job_id}:start`, at: job.started_at, tone: 'ok', text: `${name} started.`, kind: 'job' })
  if (job.finished_at) {
    const ok = job.status === 'succeeded'
    out.push({
      id: `${job.job_id}:end`,
      at: job.finished_at,
      tone: ok ? 'ok' : job.status === 'partial' ? 'need' : 'bad',
      text: ok
        ? `${name} finished.`
        : `${name} ${job.status === 'cancelled' ? 'was cancelled' : job.status === 'partial' ? 'finished with problems' : 'failed'}.${job.error?.errors?.[0] ? ` ${job.error.errors[0].message}` : ''}`,
      kind: 'job',
    })
  }
  return out.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
}

function AgentLog({ listingId, job }: { listingId: string; job: JobEnvelope }) {
  const me = useMe()
  const history = useListingHistory(listingId)
  const [filter, setFilter] = useState<LogFilter>('all')
  const entries = useMemo(() => logEntries(history.rows, job, me.data?.user_id), [history.rows, job, me.data?.user_id])
  const shown = entries.filter((e) => filter === 'all' || (filter === 'changes' ? e.kind === 'change' || e.kind === 'job' : e.kind === 'review'))
  return (
    <LaCard data-testid="agent-log">
      <CardHead
        title="Agent log"
        action={
          <Segmented<LogFilter>
            label="Show"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'All' },
              { value: 'changes', label: 'Changes' },
              { value: 'reviews', label: 'Reviews' },
            ]}
          />
        }
      />
      {history.isPending ? (
        <div className="mt-4 flex flex-col gap-3" aria-hidden>
          <Skeleton className="h-9" />
          <Skeleton className="h-9" />
        </div>
      ) : history.error ? (
        <ErrorState error={history.error} compact title="Couldn’t load the log" onRetry={() => void history.refetch()} />
      ) : shown.length === 0 ? (
        <p className="mt-4 text-small text-ink-2">Nothing logged here yet. Edits, approvals and rejections show up as they happen.</p>
      ) : (
        <Timeline className="mt-4" label="Agent log">
          {shown.map((e) => (
            <TimelineItem key={e.id} tone={e.tone}>
              <span className="block text-caption text-ink-3">{clock(e.at)}</span>
              <span className="text-ink">{e.text}</span>
            </TimelineItem>
          ))}
        </Timeline>
      )}
      {history.hasNextPage ? (
        <Button variant="ghost" size="sm" className="mt-2" disabled={history.isFetchingNextPage} onClick={() => void history.fetchNextPage()}>
          {history.isFetchingNextPage ? 'Loading…' : 'Load older entries'}
        </Button>
      ) : null}
    </LaCard>
  )
}
