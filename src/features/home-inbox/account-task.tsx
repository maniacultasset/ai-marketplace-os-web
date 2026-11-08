/**
 * Inbox > an account task a refused publish opened (`marketplace_error_review`,
 * `permission_decision`). These take no answer, so instead of answer controls the pane shows
 * what the marketplace said, in its own words and in plain language, and the real next steps:
 *
 *   Open issue details  /issues/$issueId
 *   Open listing        /listings/$listingId/review (its status and what can be done next)
 *   Edit product        /products/$productId (Edit is on its Overview)
 *   Generate again      POST /listings/{id}/regenerate (Idempotency-Key), marketplace errors only,
 *                       gated like everywhere else by listingActions().regenerate
 *
 * One live task covers every listing the same refusal hit (one task per account and kind, or per
 * category), so the pane has one block per listing, each with its own error and actions. The
 * issues come from GET /issues?status=open (`human_task_id`), each listing from
 * GET /listings/{id}. The pane paints once all have answered.
 */
import { useQueries } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { BUILT } from '@/api/capabilities'
import { isApiError } from '@/api/errors'
import { useIntentKey } from '@/api/idempotency'
import { Banner } from '@/components/la/banner'
import { LaCard } from '@/components/la/cards'
import { Icon } from '@/components/la/icons'
import { ErrorState } from '@/components/states/error-state'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { accountTaskHelp, issueHeadline, issuesByListing, MARKETPLACE_LABEL, type AccountReviewKind, type Issue, type Task } from '@/features/inbox/model'
import { listingDetailQuery, useRegenerateListing } from '@/features/listings/api'
import { rememberJob } from '@/features/listings/job-memory'
import { listingActions, type ListingDetail } from '@/features/listings/model'
import { ActionButton } from '@/features/listing-flow/ui'
import { useCan } from '@/lib/permissions'
import { useKeys } from '@/lib/query-keys'
import { toastError } from '@/lib/toast'
import { useTaskIssues } from './api'
import { CloseTaskActions } from './close-task'
import { supportsClose } from './close-task-api'
import { CodeBlock } from './parts'
import { AI_PAUSED_REASON, isAiPausedError } from '@/features/ai-credit/model'
import { useAiPaused } from '@/features/ai-credit/use-ai-paused'

export function AccountTask({ task, kind, remaining }: { task: Task; kind: AccountReviewKind; remaining: number }) {
  const keys = useKeys()
  const issues = useTaskIssues(task.id)
  const groups = issuesByListing(issues.data ?? [])
  // Every listing is read before the pane paints, so the blocks land together.
  const listings = useQueries({ queries: groups.map((g) => listingDetailQuery(keys, g.listingId)) })
  const marketplace = groups[0]?.issues[0]?.marketplace ?? null

  if (issues.isPending || listings.some((l) => l.isPending))
    return (
      <div className="flex flex-col gap-3" aria-busy="true" data-testid="account-task-loading">
        <Skeleton className="h-24 w-full rounded-card" />
        <Skeleton className="h-10 w-64 rounded-control" />
      </div>
    )
  if (issues.error) return <ErrorState compact error={issues.error} title="Couldn’t load what the marketplace said" onRetry={() => void issues.refetch()} />

  return (
    <div className="flex flex-col gap-4" data-testid="account-task">
      <Banner tone="attention" icon={kind === 'permission_decision' ? 'lock' : 'alert'}>
        <span data-testid="account-task-help">{accountTaskHelp(kind, marketplace)}</span>
      </Banner>

      {groups.length ? (
        <section className="flex flex-col gap-3" aria-labelledby={`account-task-count-${task.id}`}>
          <h3 id={`account-task-count-${task.id}`} className="font-sans text-small font-semibold text-ink-2" data-testid="account-task-count">
            {groups.length} {groups.length === 1 ? 'listing' : 'listings'}
          </h3>
          {groups.map((g, i) => (
            <ListingBlock key={g.listingId} kind={kind} issues={g.issues} listing={listings[i]?.data?.data} />
          ))}
        </section>
      ) : (
        <>
          <p className="text-small text-ink-2" data-testid="account-task-no-issue">
            No open marketplace error is linked to this right now. Check the listing on Products.
          </p>
          <Button asChild variant="secondary" className="self-start" data-testid="task-open-products">
            <Link to="/products">Open products</Link>
          </Button>
        </>
      )}

      {supportsClose(task) ? <CloseTaskActions task={task} /> : <p className="text-caption text-ink-3">You can’t close this from here yet.</p>}
      {remaining > 0 ? <p className="text-center text-small text-ink-3 lg:hidden">{remaining} more after this</p> : null}
    </div>
  )
}

/** One listing the refusal hit: its newest error, in plain words and unchanged, and its actions. */
function ListingBlock({ kind, issues, listing }: { kind: AccountReviewKind; issues: readonly Issue[]; listing: ListingDetail | undefined }) {
  const first = issues[0]!
  const regen = kind === 'marketplace_error_review' && !!listing
  return (
    <LaCard className="flex flex-col gap-3" data-testid="account-task-listing" data-listing-id={first.listing_id}>
      <div data-testid="account-task-error" className="flex flex-col gap-3">
        <div>
          <div className="text-caption text-ink-3">In plain language</div>
          <p className="mt-1 text-body text-ink">{issueHeadline(first)}</p>
        </div>
        <div>
          <div className="text-caption text-ink-3">What {MARKETPLACE_LABEL[first.marketplace]} said (unchanged)</div>
          <CodeBlock>
            {[first.marketplace_code ? `code ${first.marketplace_code}` : null, `field: ${first.field_path}`, first.raw_message ?? first.message].filter(Boolean).join(' · ')}
          </CodeBlock>
        </div>
        {issues.length > 1 ? (
          <p className="text-caption text-ink-3">
            {issues.length - 1} more {issues.length === 2 ? 'error' : 'errors'} on this listing. Open the issue to see them all.
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        {regen ? <RegenerateAction listing={listing} /> : null}
        <Button asChild variant={regen ? 'secondary' : 'primary'} data-testid="task-open-listing">
          <Link to="/listings/$listingId/review" params={{ listingId: first.listing_id }}>
            Open listing
          </Link>
        </Button>
        {listing ? (
          <Button asChild variant="secondary" data-testid="task-edit-product">
            <Link to="/products/$productId" params={{ productId: listing.product_id }}>
              <Icon name="file" size={16} />
              Edit product
            </Link>
          </Button>
        ) : null}
        <Button asChild variant="ghost" data-testid="task-open-issue">
          <Link to="/issues/$issueId" params={{ issueId: first.id }} search={{ listing: first.listing_id }}>
            Open issue details
          </Link>
        </Button>
      </div>
    </LaCard>
  )
}

function RegenerateAction({ listing }: { listing: ListingDetail }) {
  const can = useCan()
  const navigate = useNavigate()
  const regenerate = useRegenerateListing(listing.id)
  const key = useIntentKey()
  const paused = useAiPaused()
  const base = listingActions({ listing, validation: listing.validation, can, publishBuilt: BUILT['listings.publish'] }).regenerate
  const state = paused && base.show ? { show: true, enabled: false, reason: AI_PAUSED_REASON } : base
  return (
    <ActionButton
      state={state}
      disabled={regenerate.isPending}
      data-testid="task-regenerate"
      onClick={() =>
        regenerate.mutate(
          { instructions: null, key: key.get() },
          {
            onSuccess: (a) => {
              key.reset()
              rememberJob(listing.id, a.job_id)
              void navigate({ to: '/runs/$runId', params: { runId: a.job_id } })
            },
            onError: (e) => {
              if (isApiError(e) && !e.isNetwork) key.reset()
              // A pause shows in the app-wide banner instead.
              if (isAiPausedError(e)) return
              toastError(e, 'Couldn’t start a new generation')
            },
          },
        )
      }
    >
      <Icon name="refresh" size={16} />
      {regenerate.isPending ? 'Starting…' : 'Generate again'}
    </ActionButton>
  )
}
