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
 * The issues come from GET /issues?status=open (`human_task_id`), the listing from
 * GET /listings/{id}. The pane paints once both have answered.
 */
import { useQuery } from '@tanstack/react-query'
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
import { accountTaskHelp, issueHeadline, MARKETPLACE_LABEL, type AccountReviewKind, type Issue, type Task } from '@/features/inbox/model'
import { listingDetailQuery, useRegenerateListing } from '@/features/listings/api'
import { rememberJob } from '@/features/listings/job-memory'
import { listingActions, type ListingDetail } from '@/features/listings/model'
import { ActionButton } from '@/features/listing-flow/ui'
import { useCan } from '@/lib/permissions'
import { useKeys } from '@/lib/query-keys'
import { toastError } from '@/lib/toast'
import { useTaskIssues } from './api'
import { CodeBlock } from './parts'

export function AccountTask({ task, kind, remaining }: { task: Task; kind: AccountReviewKind; remaining: number }) {
  const keys = useKeys()
  const issues = useTaskIssues(task.id)
  const first: Issue | undefined = issues.data?.[0]
  const listingQ = useQuery({ ...listingDetailQuery(keys, first?.listing_id ?? ''), enabled: !!first })
  const listing = listingQ.data?.data
  const marketplace = first?.marketplace ?? null

  if (issues.isPending || (first && listingQ.isPending))
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

      {first ? (
        <LaCard className="flex flex-col gap-3" data-testid="account-task-error">
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
          {issues.data.length > 1 ? (
            <p className="text-caption text-ink-3">
              {issues.data.length - 1} more {issues.data.length === 2 ? 'error' : 'errors'} from the same refusal. Open the issue to see them all.
            </p>
          ) : null}
        </LaCard>
      ) : (
        <p className="text-small text-ink-2" data-testid="account-task-no-issue">
          No open marketplace error is linked to this right now. Check the listing on Products.
        </p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        {first && kind === 'marketplace_error_review' && listing ? <RegenerateAction listing={listing} /> : null}
        {first ? (
          <Button asChild variant={kind === 'marketplace_error_review' && listing ? 'secondary' : 'primary'} data-testid="task-open-listing">
            <Link to="/listings/$listingId/review" params={{ listingId: first.listing_id }}>
              Open listing
            </Link>
          </Button>
        ) : null}
        {listing ? (
          <Button asChild variant="secondary" data-testid="task-edit-product">
            <Link to="/products/$productId" params={{ productId: listing.product_id }}>
              <Icon name="file" size={16} />
              Edit product
            </Link>
          </Button>
        ) : null}
        {first ? (
          <Button asChild variant="ghost" data-testid="task-open-issue">
            <Link to="/issues/$issueId" params={{ issueId: first.id }} search={{ listing: first.listing_id }}>
              Open issue details
            </Link>
          </Button>
        ) : (
          <Button asChild variant="secondary" data-testid="task-open-products">
            <Link to="/products">Open products</Link>
          </Button>
        )}
      </div>
      <p className="text-caption text-ink-3">You can’t close this from here yet.</p>
      {remaining > 0 ? <p className="text-center text-small text-ink-3 lg:hidden">{remaining} more after this</p> : null}
    </div>
  )
}

function RegenerateAction({ listing }: { listing: ListingDetail }) {
  const can = useCan()
  const navigate = useNavigate()
  const regenerate = useRegenerateListing(listing.id)
  const key = useIntentKey()
  const state = listingActions({ listing, validation: listing.validation, can, publishBuilt: BUILT['listings.publish'] }).regenerate
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
