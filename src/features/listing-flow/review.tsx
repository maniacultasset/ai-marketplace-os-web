/**
 * 13 Review and approve (/listings/$listingId/review). Approval is always on in v1 (C-1): the
 * banner says so and there is no "Change in Settings". Data and actions:
 *   - tabs: the product's listings (GET /listings?product_id=), one per marketplace;
 *   - "How it will read": the current version (GET /listings/{id}) + the adapter preview
 *     (GET /listings/{id}/preview) for what is sent and its mapping problems;
 *   - quality gates: gates.ts over the latest validation, the rules and the preview; "Run checks"
 *     is POST /listings/validate;
 *   - claim card: only when the checks return UNSUPPORTED_CLAIM;
 *   - Approve / Approve all: POST /listings/approve (Idempotency-Key, `listing_version_id`),
 *     maker-checker explained before the click (makerHint over the history) and per item after;
 *   - Send back with a note: POST /listings/approve `decision: reject` (+ `regenerate`);
 *   - once approved: Publish (POST /listings/publish) opens the publish run.
 */
import { Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { BUILT } from '@/api/capabilities'
import { isApiError, isNotFound, isNotImplemented } from '@/api/errors'
import { useIntentKey } from '@/api/idempotency'
import { Page } from '@/components/app/page-header'
import {
  Banner,
  CardHead,
  FooterBar,
  Icon,
  LaCard,
  SourceBadge,
  StatusChip,
  TagChip,
} from '@/components/la'
import { ErrorState } from '@/components/states/error-state'
import { NotFound } from '@/components/states/not-found'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useListingHistory, usePublishListings, useReviewListings, useValidateListing } from '@/features/listings/api'
import { recallJob, rememberJob } from '@/features/listings/job-memory'
import {
  approveItems,
  listingActions,
  contentAuthor,
  makerHint,
  publishItems,
  summarizeBatch,
  type ActionState,
  type BatchItemResult,
  type Listing,
  type ListingDetail,
} from '@/features/listings/model'
import { useMe } from '@/lib/auth'
import { listingChip } from '@/lib/listing-chip'
import { useCan } from '@/lib/permissions'
import { toast, toastError } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { EditDialog, SendBackDialog } from './dialogs'
import { clock, mpName } from './format'
import { claimFindings, gateCounts, plural, type ErrorItem, type GateResult } from './gates'
import { ListOnButton } from './list-on'
import { approveAllTargets } from './review-model'
import { ActionButton, CardSkeleton, GateLegend, GateList } from './ui'
import { useListingChecks } from './use-listing-checks'

function itemsSummary(okCount: number, failed: { message: string }[], verb: string): string {
  const parts = [okCount ? `${okCount} ${verb}` : null, failed.length ? `${failed.length} refused: ${failed[0]!.message}` : null]
  return parts.filter(Boolean).join('. ')
}

export function ReviewScreen({ listingId }: { listingId: string }) {
  const c = useListingChecks(listingId)
  const { listingQ, listing } = c

  if (listingQ.isPending) return <ReviewSkeleton />
  if (listingQ.error || !listing) {
    if (isNotFound(listingQ.error) || (isApiError(listingQ.error) && listingQ.error.status === 422))
      return (
        <Page>
          <NotFound title="Listing not found" description="There is no listing with this ID in this brand." backTo="/products" backLabel="Back to products" />
        </Page>
      )
    return (
      <Page>
        <LaCard>
          <ErrorState error={listingQ.error} title="Couldn’t load this listing" onRetry={() => void listingQ.refetch()} />
        </LaCard>
      </Page>
    )
  }
  return <ReviewBody checks={c} listing={listing} />
}

function ReviewSkeleton() {
  return (
    <Page>
      <div aria-busy="true" aria-label="Loading the review">
        <Skeleton className="h-12 w-full rounded-[10px]" />
        <Skeleton className="mt-4 h-[42px] w-80" />
        <div className="mt-5 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
          <CardSkeleton lines={6} />
          <CardSkeleton lines={5} />
        </div>
      </div>
    </Page>
  )
}

function ReviewBody({ checks, listing }: { checks: ReturnType<typeof useListingChecks>; listing: ListingDetail }) {
  const can = useCan()
  const me = useMe()
  const navigate = useNavigate()
  const history = useListingHistory(listing.id)
  const validate = useValidateListing(listing.id)
  const review = useReviewListings()
  const publish = usePublishListings()
  const approveKey = useIntentKey()
  const publishKey = useIntentKey()
  const [sendBack, setSendBack] = useState(false)
  const [edit, setEdit] = useState(false)

  const mp = mpName(listing.marketplace)
  const product = checks.product.data
  const actions = listingActions({
    listing,
    validation: listing.validation,
    can,
    maker: makerHint(history.rows, me.data?.user_id),
    publishBuilt: BUILT['listings.publish'],
  })
  // The server is the authority on maker-checker; until the history is read, say so instead of guessing.
  const approveState: ActionState = history.isPending && actions.approve.enabled ? { show: true, enabled: false, reason: 'Checking who worked on this version…' } : actions.approve
  const siblings = checks.siblings.rows.length ? checks.siblings.rows : [listing]
  const allTargets = can('listing:approve') ? approveAllTargets(siblings) : []
  // The batch includes this listing, so it is offered only when approving this listing alone is.
  const approveAllState: ActionState =
    allTargets.some((l) => l.id === listing.id) && !approveState.enabled
      ? { show: true, enabled: false, reason: approveState.reason ?? `${mp} can’t be approved yet, so the batch can’t either.` }
      : { show: true, enabled: true }
  const counts = gateCounts(checks.gates)
  const findings = checks.current.findings
  const claims = claimFindings(findings)
  const busy = listing.status === 'generating' || listing.status === 'publishing'
  const runJob = recallJob(listing.id)

  function approve(rows: readonly Pick<Listing, 'id' | 'status' | 'status_reason' | 'current_version_id' | 'approved_version_id'>[]) {
    review.mutate(
      { items: approveItems(rows), key: approveKey.get() },
      {
        onSuccess: (res) => {
          approveKey.reset()
          const out = summarizeBatch(res)
          if (out.failed.length && !out.ok.length) {
            const f = out.failed[0]!
            toast.error(rows.length > 1 ? 'Nothing was approved' : `Couldn’t approve ${mp}`, {
              description: `${f.message}${f.requestId ? ` Reference: ${f.requestId}` : ''}`,
            })
          } else toast.success(rows.length > 1 ? itemsSummary(out.ok.length, out.failed, 'approved') : `${mp} approved`, {
            description: 'Nothing is sent until it is published.',
          })
        },
        onError: (e) => {
          if (isApiError(e) && !e.isNetwork) approveKey.reset()
          toastError(e, 'Couldn’t approve')
        },
      },
    )
  }

  function doPublish() {
    publish.mutate(
      { items: publishItems([listing]), key: publishKey.get() },
      {
        onSuccess: (res) => {
          publishKey.reset()
          const out = summarizeBatch(res)
          const ok: BatchItemResult | undefined = out.ok[0]
          if (ok?.job_id) {
            rememberJob(listing.id, ok.job_id)
            void navigate({ to: '/runs/$runId', params: { runId: ok.job_id } })
          } else if (out.failed[0]) {
            const f = out.failed[0]
            toast.error(`Couldn’t publish to ${mp}`, { description: `${f.message}${f.requestId ? ` Reference: ${f.requestId}` : ''}` })
          }
        },
        onError: (e) => {
          if (isApiError(e) && !e.isNetwork) publishKey.reset()
          toastError(e, 'Couldn’t publish')
        },
      },
    )
  }

  return (
    <div className="flex min-h-[calc(100svh-56px)] flex-col">
      <Page className="flex-1">
        <h1 className="sr-only">Review and approve</h1>
        <div className="mb-3 text-small text-ink-2" data-testid="review-product">
          {product ? (
            <Link to="/products/$productId" params={{ productId: product.id }} className="font-semibold text-ink hover:underline">
              {product.title}
            </Link>
          ) : (
            <Skeleton className="inline-block h-4 w-48 align-middle" />
          )}
          {product ? <span> · {product.sku}</span> : null}
        </div>
        <Banner tone="info" icon="shield" className="mb-4">
          <b>Approval is always on.</b> Nothing is sent to a marketplace until a person approves it.
        </Banner>

        <MarketplaceTabs siblings={siblings} currentId={listing.id} counts={counts} gatesKnown={checks.gates.length > 0} />

        {busy ? (
          <Banner
            tone="neutral"
            role="status"
            className="mb-4"
            title={listing.status === 'generating' ? 'The agent is writing this listing…' : `Sending to ${mp}…`}
            action={
              runJob ? (
                <Button size="sm" variant="secondary" asChild>
                  <Link to="/runs/$runId" params={{ runId: runJob }}>
                    Watch the run
                  </Link>
                </Button>
              ) : undefined
            }
          >
            This page updates when it finishes.
          </Banner>
        ) : null}
        {listing.status === 'approved' ? (
          <Banner
            tone="success"
            className="mb-4"
            title={`Approved for ${mp}.`}
            action={
              actions.publish.show ? (
                <ActionButton state={actions.publish} size="sm" disabled={publish.isPending} onClick={doPublish} data-testid="publish">
                  {publish.isPending ? 'Publishing…' : actions.publish.label}
                </ActionButton>
              ) : undefined
            }
          >
            {actions.publish.show ? 'Publishing sends this marketplace only.' : 'An operator or owner publishes it.'}
          </Banner>
        ) : null}
        {listing.status === 'published' ? (
          <Banner
            tone="neutral"
            className="mb-4"
            title={`Sent to ${mp}.`}
            action={
              <Button size="sm" variant="secondary" asChild>
                <Link to="/listings/$listingId/live" params={{ listingId: listing.id }}>
                  See status
                </Link>
              </Button>
            }
          >
            {listingChip(listing).label}. Live is shown only once {mp} confirms it.
          </Banner>
        ) : null}

        {!listing.content ? (
          <LaCard className="flex flex-col items-start gap-3" data-testid="review-empty">
            <h3 className="text-h3 text-ink">Nothing to review yet</h3>
            <p className="text-body text-ink-2">The agent has not written this listing. Start it and it comes back here for approval.</p>
            {listing.status === 'created' ? <ListOnButton productId={listing.product_id} marketplace={listing.marketplace} /> : null}
          </LaCard>
        ) : (
          <div className="grid items-start gap-4 lg:grid-cols-[1.6fr_1fr]">
            <div className="flex min-w-0 flex-col gap-4">
              <ReadsAs
                checks={checks}
                listing={listing}
                claims={claims}
                author={history.isPending || history.error ? 'unknown' : contentAuthor(history.rows, !history.hasNextPage)}
                onEdit={() => setEdit(true)}
                editState={actions.edit}
              />
              {findings.length ? <FindingsCard findings={findings} /> : null}
            </div>
            <div className="flex min-w-0 flex-col gap-4">
              <GatesCard
                gates={checks.gates}
                rulesCount={checks.rules?.length ?? null}
                listing={listing}
                validateState={actions.validate}
                validating={validate.isPending}
                onValidate={() => validate.mutate(listing.current_version_id ?? null)}
              />
              {claims.length ? (
                <LaCard emphasis="attention" data-testid="claim-card">
                  <b className="text-ink">{plural(claims.length, 'claim')} to check</b>
                  <ul className="m-0 mt-1 list-none p-0">
                    {claims.map((cl, i) => (
                      <li key={i} className="text-small text-attention-ink">
                        {cl.value_submitted ? `“${cl.value_submitted}”: ` : ''}
                        {cl.message}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-caption text-ink-2">Remove it from the text, or add the fact that supports it to the product.</p>
                  {actions.edit.show && actions.edit.enabled ? (
                    <Button size="sm" variant="secondary" className="mt-3" onClick={() => setEdit(true)}>
                      Edit the text
                    </Button>
                  ) : null}
                </LaCard>
              ) : null}
            </div>
          </div>
        )}
      </Page>

      {listing.content && (actions.approve.show || actions.reject.show) ? (
        <FooterBar status={allTargets.length > 1 ? 'Each marketplace is approved as its own listing.' : 'Approving does not send anything. Publishing sends this marketplace only.'}>
          <ActionButton state={actions.reject} variant="ghost" onClick={() => setSendBack(true)} data-testid="send-back">
            Send back with a note
          </ActionButton>
          <ActionButton
            state={approveState}
            variant={allTargets.length > 1 ? 'secondary' : 'primary'}
            disabled={review.isPending}
            onClick={() => approve([listing])}
            data-testid="approve"
          >
            {review.isPending ? 'Approving…' : `Approve ${mp}`}
          </ActionButton>
          {allTargets.length > 1 ? (
            <ActionButton state={approveAllState} disabled={review.isPending} onClick={() => approve(allTargets)} data-testid="approve-all">
              Approve all {allTargets.length}
            </ActionButton>
          ) : null}
        </FooterBar>
      ) : null}

      {sendBack && listing.current_version_id ? (
        <SendBackDialog
          open
          onOpenChange={setSendBack}
          listing={listing}
          marketplaceName={mp}
          onDone={(item, rewrite) => {
            setSendBack(false)
            if (rewrite && item.job_id) {
              rememberJob(listing.id, item.job_id)
              toast.success('Sent back. The agent is rewriting it.')
              void navigate({ to: '/runs/$runId', params: { runId: item.job_id } })
            } else toast.success('Sent back. The listing is blocked until someone changes it.')
          }}
        />
      ) : null}
      {edit && listing.content ? (
        <EditDialog
          open
          onOpenChange={setEdit}
          listing={listing}
          etag={checks.etag}
          onSaved={() => {
            setEdit(false)
            toast.success('Saved as a new version', { description: 'The checks ran again. Someone else approves your edit.' })
          }}
        />
      ) : null}
    </div>
  )
}

/* ---------------------------------------------------------------------------------------------- */

function MarketplaceTabs({
  siblings,
  currentId,
  counts,
  gatesKnown,
}: {
  siblings: readonly Listing[]
  currentId: string
  counts: ReturnType<typeof gateCounts>
  gatesKnown: boolean
}) {
  const sorted = [...siblings].sort((a, b) => a.marketplace.localeCompare(b.marketplace))
  return (
    <nav aria-label="Marketplaces" className="mb-5 flex w-full gap-1 overflow-x-auto border-b border-line" data-testid="review-tabs">
      {sorted.map((l) => {
        const on = l.id === currentId
        const chip = listingChip(l)
        return (
          <Link
            key={l.id}
            to="/listings/$listingId/review"
            params={{ listingId: l.id }}
            aria-current={on ? 'page' : undefined}
            className={cn(
              'focus-ring -mb-px inline-flex h-[42px] shrink-0 items-center gap-1.5 border-b-2 px-3.5 whitespace-nowrap transition-colors duration-150',
              on ? 'border-brand font-bold text-brand' : 'border-transparent font-medium text-ink-2 hover:text-ink',
            )}
          >
            {mpName(l.marketplace)}
            {on && gatesKnown ? (
              counts.blocked || counts.warning ? (
                <StatusChip status="needs-you" className="ml-1.5">
                  {counts.blocked + counts.warning}
                </StatusChip>
              ) : (
                <TagChip tone={counts.passed === counts.total ? 'plain' : 'tag'} className={cn('ml-1.5', counts.passed === counts.total && 'border-success-line bg-success-bg text-success')}>
                  {counts.passed} of {counts.total} checks
                </TagChip>
              )
            ) : !on ? (
              <StatusChip status={chip.status} iconOnly label={`${mpName(l.marketplace)}: ${chip.label}`} className="ml-1.5" />
            ) : null}
          </Link>
        )
      })}
    </nav>
  )
}

/* ---------------------------------------------------------------------------------------------- */

function bulletFinding(claims: readonly ErrorItem[], index: number, text: string): ErrorItem | undefined {
  return claims.find((f) => f.field === `content.bullets[${index}]` || (!!f.value_submitted && text.toLowerCase().includes(f.value_submitted.toLowerCase())))
}

function ReadsAs({
  checks,
  listing,
  claims,
  author,
  onEdit,
  editState,
}: {
  checks: ReturnType<typeof useListingChecks>
  listing: ListingDetail
  claims: readonly ErrorItem[]
  /** contentAuthor(): the version's confidence score is copied into edits, so history decides. */
  author: 'agent' | 'team' | 'unknown'
  onEdit: () => void
  editState: ActionState
}) {
  const canonical = listing.content!
  const content = canonical.content
  const [more, setMore] = useState(false)
  const mp = mpName(listing.marketplace)
  const preview = checks.preview
  const items = preview.data?.items ?? []
  const children = items.filter((i) => i.item_role === 'child').length
  const parents = items.filter((i) => i.item_role === 'parent').length
  const mappingErrors = preview.data?.report.errors ?? []
  return (
    <LaCard data-testid="reads-as">
      <CardHead
        title={`How it will read on ${mp}`}
        sub={
          author === 'agent' && canonical.confidence_score != null ? (
            <span className="inline-flex items-center gap-1.5">
              Written by the agent <SourceBadge source={{ kind: 'agent', confidence: canonical.confidence_score }} />
            </span>
          ) : author === 'team' ? (
            <span className="inline-flex items-center gap-1.5">
              Version {canonical.version} · last edited by your team <SourceBadge source={{ kind: 'you' }} />
            </span>
          ) : (
            `Version ${canonical.version}`
          )
        }
        action={
          <ActionButton state={editState} size="sm" variant="secondary" onClick={onEdit} data-testid="edit">
            <Icon name="file" size={14} />
            Edit
          </ActionButton>
        }
      />
      <div className="mt-4 flex flex-col items-start gap-4 sm:flex-row">
        <div
          className="flex size-[130px] shrink-0 flex-col items-center justify-center gap-1 rounded-[10px] bg-subtle text-ink-2"
          role="img"
          aria-label={`${canonical.images?.length ?? 0} images attached`}
        >
          <Icon name="image" size={28} />
          <span className="text-caption">{plural(canonical.images?.length ?? 0, 'image')}</span>
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-sans text-h3 font-bold text-ink" data-testid="reads-title">
            {content.title}
          </h2>
          <ul className="m-0 mt-3 list-disc pl-[18px] text-body leading-6 text-ink">
            {content.bullets.map((b, i) => {
              const flag = bulletFinding(claims, i, b)
              return (
                <li key={i} className={cn(flag && '-ml-1.5 list-inside rounded-[6px] bg-attention-bg pl-1.5')}>
                  {b} {flag ? (
                    <span className="ml-1 inline-flex h-[18px] items-center rounded-[5px] border border-attention-line bg-attention-bg px-1.5 align-middle text-[11px] leading-none font-semibold text-attention">
                      No evidence
                    </span>
                  ) : null}
                </li>
              )
            })}
          </ul>
          <p className={cn('mt-3 text-small whitespace-pre-line text-ink-2', !more && 'line-clamp-3')}>{content.description}</p>
          {content.description.length > 240 ? (
            <Button variant="link" size="sm" className="mt-1" onClick={() => setMore((m) => !m)} aria-expanded={more}>
              {more ? 'Show less' : 'Show the full description'}
            </Button>
          ) : null}
        </div>
      </div>
      <div className="mt-4 border-t border-line pt-3 text-caption text-ink-3" data-testid="preview-note">
        {preview.isPending && preview.fetchStatus !== 'idle' ? (
          'Building the marketplace preview…'
        ) : preview.error ? (
          isNotImplemented(preview.error) ? (
            `A preview of what ${mp} receives is not available for this marketplace yet.`
          ) : (
            `Couldn’t build the ${mp} preview. ${isApiError(preview.error) && preview.error.correlationId ? `Reference: ${preview.error.correlationId}` : ''}`
          )
        ) : preview.data ? (
          <>
            {mp} receives {plural(items.length, 'item')}
            {parents || children ? ` (${parents ? `${parents} parent, ` : ''}${plural(children, 'variant')})` : ''}
            {preview.data.product_type ? ` as product type ${preview.data.product_type}` : ''}.
            {mappingErrors.length ? (
              <span className="mt-1 block font-semibold text-attention-ink">{plural(mappingErrors.length, 'mapping problem')}: {mappingErrors[0]!.message}</span>
            ) : null}
          </>
        ) : null}
      </div>
    </LaCard>
  )
}

/* ---------------------------------------------------------------------------------------------- */

function GatesCard({
  gates,
  rulesCount,
  listing,
  validateState,
  validating,
  onValidate,
}: {
  gates: readonly GateResult[]
  rulesCount: number | null
  listing: ListingDetail
  validateState: ActionState
  validating: boolean
  onValidate: () => void
}) {
  const v = listing.validation
  const onCurrent = !!v && v.listing_version_id === listing.current_version_id
  const stage = onCurrent ? v.stages?.[v.stages.length - 1] : undefined
  return (
    <LaCard data-testid="gates-card">
      <CardHead
        title="Quality gates"
        action={
          validateState.show ? (
            <ActionButton state={validateState} size="sm" variant={onCurrent ? 'ghost' : 'secondary'} disabled={validating} onClick={onValidate} data-testid="run-checks">
              <Icon name="refresh" size={14} />
              {validating ? 'Checking…' : onCurrent ? 'Check again' : 'Run checks'}
            </ActionButton>
          ) : undefined
        }
      />
      <GateList gates={gates} />
      <p className="mt-3 text-caption text-ink-3" data-testid="gates-note">
        {onCurrent
          ? `${v.blocking_count} blocking, ${v.warning_count} ${v.warning_count === 1 ? 'warning' : 'warnings'} on version ${listing.content?.version ?? ''}${stage ? `, checked ${clock(stage.created_at)}` : ''}.`
          : 'This version has not been checked yet. Approval needs a passing check.'}
        {rulesCount != null ? ` ${plural(rulesCount, 'rule')} apply to this category.` : ''}
      </p>
      <GateLegend className="mt-2" />
    </LaCard>
  )
}

function FindingsCard({ findings }: { findings: readonly ErrorItem[] }) {
  const sorted = [...findings].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1))
  return (
    <LaCard data-testid="findings">
      <CardHead title="What the checks found" sub="Each item names the exact field." />
      <ul className="m-0 mt-3 flex list-none flex-col p-0">
        {sorted.map((f, i) => (
          <li key={i} className="flex items-start gap-3 border-b border-line py-3 last:border-b-0 last:pb-0">
            <StatusChip status={f.severity === 'error' ? 'blocked' : 'needs-you'} iconOnly label={f.severity === 'error' ? 'Blocking' : 'Warning'} />
            <div className="min-w-0 flex-1">
              <p className="text-body text-ink">{f.message}</p>
              <p className="text-caption text-ink-3">
                <code className="font-mono">{f.field}</code>
                {f.value_submitted ? ` · sent “${f.value_submitted}”` : ''}
              </p>
              {f.suggestion ? <p className="mt-0.5 text-small text-ink-2">{f.suggestion}</p> : null}
            </div>
          </li>
        ))}
      </ul>
    </LaCard>
  )
}
