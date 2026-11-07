/**
 * 13 Review and approve (/listings/$listingId/review). Approval is always on in v1 (C-1): the
 * banner says so and there is no "Change in Settings". Data and actions:
 *   - tabs: the product's listings (GET /listings?product_id=), one per marketplace;
 *   - "How it will read": the current version (GET /listings/{id}) + the adapter preview
 *     (GET /listings/{id}/preview) for what is sent and its mapping problems;
 *   - quality gates: gates.ts over the latest validation, the rules and the preview; "Run checks"
 *     is POST /listings/validate;
 *   - claim card: only when the checks return UNSUPPORTED_CLAIM;
 *   - "Fixed for you": what Kuinn fixed on this version (GET /issues?status=auto_fixed&listing_id=),
 *     next to the gates; it lands with them, and Approve waits for it, so it is seen first;
 *   - Approve / Approve all: POST /listings/approve (Idempotency-Key, `listing_version_id`),
 *     maker-checker explained before the click (makerHint over the history) and per item after;
 *   - Send back with a note: POST /listings/approve `decision: reject` (+ `regenerate`);
 *   - once approved: Publish (POST /listings/publish) opens the publish run.
 */
import { useQueryClient } from '@tanstack/react-query'
import { Link, useLocation, useNavigate } from '@tanstack/react-router'
import { useId, useState } from 'react'
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
import { useFixCounts, useFixTrail } from '@/features/home-inbox/api'
import { invalidateListingWork, useListingHistory, usePublishListings, useReviewListings, useValidateListing } from '@/features/listings/api'
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
import { useJobPolling } from '@/hooks/use-job-polling'
import { useMe } from '@/lib/auth'
import { listingChip } from '@/lib/listing-chip'
import { useCan } from '@/lib/permissions'
import { useKeys } from '@/lib/query-keys'
import { toast, toastError } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { CONCEPT_ICON } from '@/components/la/concept-icons'
import { AutoFixedChip, FixedForYouCard } from './auto-fix'
import { autoFixTrail, FIXED_FOR_YOU_HASH, siblingFixes, versionRef } from './auto-fix-model'
import { EditDialog, SendBackDialog } from './dialogs'
import { clock, fieldLabel, mpName } from './format'
import { claimFindings, gateCounts, plural, type ErrorItem, type GateResult } from './gates'
import { ListOnButton } from './list-on'
import { approveAllTargets } from './review-model'
import { STAGE_SUB } from './run-steps'
import { ActionButton, CardSkeleton, GATE_CHIP, GateLegend, GateList, GateListSkeleton, ReadsAsSkeleton, ReviewTopSkeleton } from './ui'
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

/** Shaped like the screen: product line, approval banner, marketplace tabs, the two columns, the footer. */
function ReviewSkeleton() {
  const can = useCan()
  return (
    <div className="flex min-h-[calc(100svh-56px)] flex-col">
      <Page className="flex-1">
        <div aria-busy="true" aria-label="Loading the review">
          <Skeleton className="mb-3 h-4 w-56" />
          <Skeleton className="mb-4 h-[50px] w-full rounded-banner" />
          <div className="mb-5 flex h-[42px] items-center gap-4 border-b border-line">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-20" />
          </div>
          <div className="grid items-start gap-4 lg:grid-cols-[1.6fr_1fr]">
            <ReadsAsSkeleton />
            <CardSkeleton lines={5} />
          </div>
        </div>
      </Page>
      {can('listing:approve') ? <div aria-hidden className="h-[68px] border-t border-line bg-surface" /> : null}
    </div>
  )
}

function ReviewBody({ checks, listing }: { checks: ReturnType<typeof useListingChecks>; listing: ListingDetail }) {
  const can = useCan()
  const me = useMe()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const keys = useKeys()
  const history = useListingHistory(listing.id)
  const fixesQ = useFixTrail(listing.id)
  const fixes = autoFixTrail(fixesQ.data ?? [], versionRef(listing))
  const hash = useLocation({ select: (l) => l.hash })
  const validate = useValidateListing(listing.id)
  const review = useReviewListings()
  const publish = usePublishListings()
  const approveKey = useIntentKey()
  const publishKey = useIntentKey()
  const [sendBack, setSendBack] = useState(false)
  const [edit, setEdit] = useState(false)
  // Approve / publish stay "…ing" until the listing refetch shows the new status, so the buttons
  // never snap back to their resting label for a moment before the page changes.
  const [settling, setSettling] = useState<'approve' | 'publish' | null>(null)

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
  // The reviewer sees what Kuinn fixed before approving: Approve waits for that read too.
  const approveState: ActionState =
    history.isPending && actions.approve.enabled
      ? { show: true, enabled: false, reason: 'Checking who worked on this version…' }
      : fixesQ.isPending && actions.approve.enabled
        ? { show: true, enabled: false, reason: 'Checking what Kuinn fixed…' }
        : actions.approve
  // The product line and tabs land together, once the product and its listings are read.
  const siblingsPending = checks.siblings.isPending
  const topReady = !checks.product.isPending && !siblingsPending
  const siblings = checks.siblings.rows.length ? checks.siblings.rows : [listing]
  const allTargets = can('listing:approve') && !siblingsPending ? approveAllTargets(siblings) : []
  // Until the other marketplaces are read, the footer holds one Approve, so its width never changes.
  const approveShown: ActionState =
    siblingsPending && approveState.show ? { show: true, enabled: false, reason: 'Checking the other marketplaces…' } : approveState
  // "Approve all" approves the other marketplaces' fixes too: read them, and name them in the footer.
  const others = allTargets.filter((l) => l.id !== listing.id)
  const otherFixes = useFixCounts(others)
  const batchFixes = siblingFixes(others, otherFixes.counts, listing.id)
  // The batch includes this listing, so it is offered only when approving this listing alone is.
  const approveAllState: ActionState =
    allTargets.some((l) => l.id === listing.id) && !approveState.enabled
      ? { show: true, enabled: false, reason: approveState.reason ?? `${mp} can’t be approved yet, so the batch can’t either.` }
      : otherFixes.pending
        ? { show: true, enabled: false, reason: 'Checking what Kuinn fixed on the other marketplaces…' }
        : { show: true, enabled: true }
  const counts = gateCounts(checks.gates)
  const findings = checks.current.findings
  const claims = claimFindings(findings)
  const otherFindings = findings.filter((f) => f.error_code !== 'UNSUPPORTED_CLAIM')
  const busy = listing.status === 'generating' || listing.status === 'publishing'
  const runJob = recallJob(listing.id)
  // Follow the run while the agent works, so the page turns over within seconds of the job ending.
  const run = useJobPolling(busy ? runJob : null, {
    onTerminal: () => invalidateListingWork(qc, keys, [listing.id]),
  })
  // A remembered job that already ended belongs to an earlier run: its stage would be stale.
  const liveJob = run.job && !run.isTerminal ? run.job : null
  const approving = review.isPending || settling === 'approve'
  const publishing = publish.isPending || settling === 'publish'
  const refetchListing = () => qc.invalidateQueries({ queryKey: keys.listings.detail(listing.id) })

  async function approve(rows: readonly Pick<Listing, 'id' | 'status' | 'status_reason' | 'current_version_id' | 'approved_version_id'>[]) {
    setSettling('approve')
    try {
      const res = await review.mutateAsync({ items: approveItems(rows), key: approveKey.get() })
      approveKey.reset()
      await refetchListing()
      const out = summarizeBatch(res)
      if (out.failed.length && !out.ok.length) {
        const f = out.failed[0]!
        toast.error(rows.length > 1 ? 'Nothing was approved' : `Couldn’t approve ${mp}`, {
          description: `${f.message}${f.requestId ? ` Reference: ${f.requestId}` : ''}`,
        })
      } else
        toast.success(rows.length > 1 ? itemsSummary(out.ok.length, out.failed, 'approved') : `${mp} approved`, {
          description: 'Nothing is sent until it is published.',
        })
    } catch (e) {
      if (isApiError(e) && !e.isNetwork) approveKey.reset()
      toastError(e, 'Couldn’t approve')
    } finally {
      setSettling(null)
    }
  }

  async function doPublish() {
    setSettling('publish')
    try {
      const res = await publish.mutateAsync({ items: publishItems([listing]), key: publishKey.get() })
      publishKey.reset()
      await refetchListing()
      const out = summarizeBatch(res)
      const ok: BatchItemResult | undefined = out.ok[0]
      if (ok?.job_id) {
        rememberJob(listing.id, ok.job_id)
        void navigate({ to: '/runs/$runId', params: { runId: ok.job_id } })
      } else if (out.failed[0]) {
        const f = out.failed[0]
        toast.error(`Couldn’t publish to ${mp}`, { description: `${f.message}${f.requestId ? ` Reference: ${f.requestId}` : ''}` })
      }
    } catch (e) {
      if (isApiError(e) && !e.isNetwork) publishKey.reset()
      toastError(e, 'Couldn’t publish')
    } finally {
      setSettling(null)
    }
  }

  const approvalBanner = (
    <Banner tone="info" icon={CONCEPT_ICON.approval} className="mb-4">
      <b>Approval is always on.</b> Nothing is sent to a marketplace until a person approves it.
    </Banner>
  )

  return (
    <div className="flex min-h-[calc(100svh-56px)] flex-col">
      <Page className="flex-1">
        <h1 className="sr-only">Review and approve</h1>
        {topReady ? (
          <>
            <div className="mb-3 min-h-5 text-small text-ink-2" data-testid="review-product">
              {product ? (
                <>
                  <Link to="/products/$productId" params={{ productId: product.id }} className="font-semibold text-ink hover:underline">
                    {product.title}
                  </Link>
                  <span> · {product.sku}</span>
                </>
              ) : null}
            </div>
            {approvalBanner}
            <MarketplaceTabs siblings={siblings} currentId={listing.id} counts={counts} gatesKnown={checks.gatesReady} />
          </>
        ) : (
          <ReviewTopSkeleton>{approvalBanner}</ReviewTopSkeleton>
        )}

        {busy ? (
          <Banner
            tone="neutral"
            role="status"
            className="mb-4 animate-page-in"
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
            {runJob && listing.status === 'generating'
              ? liveJob?.stage
                ? STAGE_SUB[liveJob.stage]
                : 'Starting…'
              : 'This page updates on its own.'}
          </Banner>
        ) : null}
        {listing.status === 'approved' ? (
          <Banner
            tone="success"
            className="mb-4"
            title={`Approved for ${mp}.`}
            action={
              actions.publish.show ? (
                <ActionButton state={actions.publish} size="sm" disabled={publishing} onClick={() => void doPublish()} data-testid="publish">
                  {publishing ? 'Publishing…' : actions.publish.label}
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
          <div
            aria-busy={busy}
            className={cn('grid items-start gap-4 transition-opacity duration-200 lg:grid-cols-[1.6fr_1fr]', busy && 'pointer-events-none opacity-60')}
          >
            <div className="flex min-w-0 flex-col gap-4">
              <ReadsAs
                checks={checks}
                listing={listing}
                claims={claims}
                author={history.isPending || history.error ? 'unknown' : contentAuthor(history.rows, !history.hasNextPage)}
                authorPending={history.isPending}
                onEdit={() => setEdit(true)}
                editState={actions.edit}
              />
              {/* Unsupported claims already show on the bullet and in the claim card. */}
              {otherFindings.length ? <FindingsCard findings={otherFindings} /> : null}
            </div>
            <div className="flex min-w-0 flex-col gap-4">
              <GatesCard
                gates={checks.gates}
                ready={checks.gatesReady && !fixesQ.isPending}
                neverChecked={!checks.current.checked}
                listed={otherFindings}
                rulesCount={checks.rules?.length ?? null}
                listing={listing}
                validateState={actions.validate}
                validating={validate.isPending}
                onValidate={() => validate.mutate(listing.current_version_id ?? null)}
              />
              {/* Lands with the gates (same ready flag), so it never pushes the cards below it. */}
              {fixesQ.isPending ? null : (
                <FixedForYouCard
                  fixes={fixes}
                  error={fixesQ.data ? undefined : fixesQ.error}
                  onRetry={() => void fixesQ.refetch()}
                  defaultOpen={hash === FIXED_FOR_YOU_HASH}
                />
              )}
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

      {listing.content && !busy && (actions.approve.show || actions.reject.show) ? (
        <FooterBar
          status={
            allTargets.length > 1 ? (
              <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
                <span>Each marketplace is approved as its own listing.</span>
                {batchFixes.map(({ listing: l, count }) => (
                  <AutoFixedChip key={l.id} listingId={l.id} count={count} label={`${mpName(l.marketplace)}: ${count} fixed`} />
                ))}
              </span>
            ) : (
              `Publishing sends ${mp} only.`
            )
          }
        >
          <ActionButton state={actions.reject} variant="ghost" onClick={() => setSendBack(true)} data-testid="send-back">
            Send back with a note
          </ActionButton>
          <ActionButton
            state={approveShown}
            variant={allTargets.length > 1 ? 'secondary' : 'primary'}
            disabled={approving}
            onClick={() => void approve([listing])}
            data-testid="approve"
          >
            {approving ? 'Approving…' : `Approve ${mp}`}
          </ActionButton>
          {allTargets.length > 1 ? (
            <ActionButton state={approveAllState} disabled={approving} onClick={() => void approve(allTargets)} data-testid="approve-all">
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
            {on && !gatesKnown ? (
              <span aria-hidden className="skeleton ml-1.5 inline-block h-[22px] w-16 rounded-full bg-subtle" />
            ) : on ? (
              <span className="ml-1.5 inline-flex" title={`${counts.passed} passed · ${counts.unchecked} not checked`}>
                {counts.blocked || counts.warning ? (
                  <StatusChip status="needs-you">{counts.blocked + counts.warning}</StatusChip>
                ) : counts.passed === 0 ? (
                  <TagChip tone="plain">Not checked yet</TagChip>
                ) : (
                  <TagChip tone="tag" className={cn(counts.passed === counts.total && 'border-success-line bg-success-bg text-success')}>
                    {counts.passed} passed
                  </TagChip>
                )}
              </span>
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
  authorPending,
  onEdit,
  editState,
}: {
  checks: ReturnType<typeof useListingChecks>
  listing: ListingDetail
  claims: readonly ErrorItem[]
  /** contentAuthor(): the version's confidence score is copied into edits, so history decides. */
  author: 'agent' | 'team' | 'unknown'
  /** The history is still being read: the author line is a placeholder, not a guess. */
  authorPending: boolean
  onEdit: () => void
  editState: ActionState
}) {
  const canonical = listing.content!
  const content = canonical.content
  const [more, setMore] = useState(false)
  const [removedOpen, setRemovedOpen] = useState(false)
  const mp = mpName(listing.marketplace)
  const preview = checks.preview
  const items = preview.data?.items ?? []
  const children = items.filter((i) => i.item_role === 'child').length
  const parents = items.filter((i) => i.item_role === 'parent').length
  const mappingErrors = preview.data?.report.errors ?? []
  const imageCount = canonical.images?.length ?? 0
  // Claims the agent dropped because the product facts did not back them (real data on the version).
  const removed = canonical.claims?.filter((c) => c.status === 'removed') ?? []
  const removedWhere = [...new Set(removed.map((c) => fieldLabel(c.text_path)))]
  const removedShown = removedOpen ? removedWhere : removedWhere.slice(0, 2)
  const removedHidden = removedWhere.length - removedShown.length
  return (
    <LaCard data-testid="reads-as">
      <CardHead
        title={`How it will read on ${mp}`}
        sub={
          authorPending ? (
            <span aria-hidden className="skeleton inline-block h-4 w-44 rounded-md bg-subtle align-middle" />
          ) : author === 'agent' && canonical.confidence_score != null ? (
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
        <div className="flex shrink-0 flex-col items-center gap-2">
          <div
            className={cn(
              'flex size-[130px] shrink-0 flex-col items-center justify-center gap-1 rounded-xl border shadow-inset-md',
              imageCount ? 'border-line bg-field text-ink-2' : 'border-attention-line bg-attention-bg text-attention-ink',
            )}
            role="img"
            aria-label={`${imageCount} images attached`}
          >
            <Icon name="image" size={28} />
            <span className="text-caption">{imageCount ? plural(imageCount, 'image') : 'No images'}</span>
          </div>
          {imageCount ? null : (
            <Button size="sm" variant="secondary" asChild>
              <Link to="/products/$productId" params={{ productId: listing.product_id }} search={{ tab: 'media' }} data-testid="add-images">
                Add images
              </Link>
            </Button>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-sans text-h3 font-bold text-ink" data-testid="reads-title">
            {content.title}
          </h2>
          <ul className="m-0 mt-3 list-disc pl-[18px] text-body leading-6 text-ink">
            {content.bullets.map((b, i) => {
              const flag = bulletFinding(claims, i, b)
              // Every bullet keeps its outside marker; a flagged one highlights its text only.
              return (
                <li key={i}>
                  {flag ? (
                    <>
                      <span className="-mx-1 box-decoration-clone rounded-sm bg-attention-bg px-1">{b}</span>{' '}
                      <StatusChip status="needs-you" className="align-middle">
                        No evidence
                      </StatusChip>
                    </>
                  ) : (
                    b
                  )}
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
      {mappingErrors.length ? (
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-control bg-attention-bg px-3 py-2 text-small text-attention-ink" data-testid="mapping-problems">
          <span className="flex min-w-0 flex-1 items-start gap-2">
            <Icon name="alert" size={16} className="mt-0.5 shrink-0" aria-hidden />
            <span className="min-w-0 break-words">
              <b>{plural(mappingErrors.length, 'mapping problem')}:</b> {mappingErrors[0]!.message}
            </span>
          </span>
          <Button size="sm" variant="ghost" asChild>
            <Link to="/listings/$listingId/mapping" params={{ listingId: listing.id }}>
              See field mapping
            </Link>
          </Button>
        </div>
      ) : null}
      <div className="mt-4 min-h-[2lh] border-t border-line pt-3 text-caption text-ink-3" data-testid="preview-note">
        {preview.isPending && preview.fetchStatus !== 'idle' ? (
          <>
            <Skeleton className="h-3 w-72 max-w-full" />
            <span className="sr-only">Building the marketplace preview…</span>
          </>
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
          </>
        ) : null}
        {removed.length ? (
          <span className="mt-1 block" data-testid="removed-claims">
            The agent left out {plural(removed.length, 'claim')} your product facts did not support ({removedShown.join(', ')}
            {removedHidden ? `, and ${removedHidden} more` : ''}).
            {removedWhere.length > 2 ? (
              <Button variant="link" size="sm" className="ml-1 h-auto p-0 align-baseline text-caption" onClick={() => setRemovedOpen((o) => !o)} aria-expanded={removedOpen}>
                {removedOpen ? 'Hide details' : 'Show details'}
              </Button>
            ) : null}
          </span>
        ) : null}
      </div>
    </LaCard>
  )
}

/* ---------------------------------------------------------------------------------------------- */

const NEEDS_WORD = { blocked: 'Blocked', warning: 'Warning' } as const

function GatesCard({
  gates,
  ready,
  neverChecked,
  listed,
  rulesCount,
  listing,
  validateState,
  validating,
  onValidate,
}: {
  gates: readonly GateResult[]
  /** Every read the gates depend on has settled; until then the card holds their shape. */
  ready: boolean
  /** The checks never ran on the current version: open the full list by default. */
  neverChecked: boolean
  /** Findings listed in "What the checks found", so a gate row can point to them. */
  listed: readonly ErrorItem[]
  rulesCount: number | null
  listing: ListingDetail
  validateState: ActionState
  validating: boolean
  onValidate: () => void
}) {
  const [open, setOpen] = useState(neverChecked)
  const panelId = useId()
  const v = listing.validation
  const onCurrent = !!v && v.listing_version_id === listing.current_version_id
  const stage = onCurrent ? v.stages?.[v.stages.length - 1] : undefined
  const counts = gateCounts(gates)
  const needs = gates.filter((g) => g.state === 'blocked' || g.state === 'warning')
  const listedSet = new Set(listed)
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
      {!ready ? (
        <div aria-busy="true" aria-label="Loading the quality gates">
          {open ? <GateListSkeleton /> : <Skeleton className="mt-3 h-4 w-56" />}
          <Skeleton className="mt-3 h-3 w-64 max-w-full" />
        </div>
      ) : (
        <>
          <p className="mt-2 text-small text-ink-2 tabular-nums" data-testid="gates-summary">
            {counts.blocked + counts.warning} need you · {counts.passed} passed · {counts.unchecked} not checked yet
          </p>
          {needs.length ? (
            <ul className="m-0 mt-2 flex list-none flex-col gap-1.5 p-0" data-testid="gates-needs">
              {needs.map((g) => {
                const n = g.findings.filter((f) => listedSet.has(f)).length
                return (
                  <li key={g.id} className="flex items-start gap-2 text-small text-ink">
                    <StatusChip status={GATE_CHIP[g.state]} iconOnly label={`${g.label}: ${NEEDS_WORD[g.state as keyof typeof NEEDS_WORD]}`} className="mt-px" />
                    <span className="min-w-0 flex-1 break-words">
                      {g.label}: {g.note}
                      {n ? (
                        <>
                          {' '}
                          <a href="#findings" className="focus-ring rounded-sm font-semibold whitespace-nowrap text-brand hover:underline">
                            See {plural(n, 'finding')}
                          </a>
                        </>
                      ) : null}
                    </span>
                  </li>
                )
              })}
            </ul>
          ) : onCurrent ? (
            <p className="mt-2 text-small text-ink">
              {counts.passed === counts.total ? `All ${counts.total} checks passed.` : 'Nothing blocks approval in the checks that ran.'}
            </p>
          ) : null}
        </>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="mt-2 -ml-2"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        data-testid="gates-toggle"
      >
        {open ? 'Hide checks' : `Show all ${gates.length || 9} checks`}
        <Icon name="chev" size={14} aria-hidden className={cn('motion-safe:transition-transform motion-safe:duration-150', open && 'rotate-180')} />
      </Button>
      {/* Always in the DOM (the tests and the summary rows point at it); `hidden` when collapsed. */}
      <div id={panelId} hidden={!open || !ready}>
        <GateList gates={gates} />
        <p className="mt-3 text-caption text-ink-3" data-testid="gates-note">
          {onCurrent
            ? `${v.blocking_count} blocking, ${v.warning_count} ${v.warning_count === 1 ? 'warning' : 'warnings'} on version ${listing.content?.version ?? ''}${stage ? `, checked ${clock(stage.created_at)}` : ''}.`
            : 'This version has not been checked yet. Approval needs a passing check.'}
          {rulesCount != null ? ` ${plural(rulesCount, 'rule')} apply to this category.` : ''}
        </p>
        <GateLegend className="mt-2" />
        <Button variant="ghost" size="sm" className="mt-2 -ml-2" asChild>
          <Link to="/listings/$listingId/mapping" params={{ listingId: listing.id }}>
            See field mapping
          </Link>
        </Button>
      </div>
    </LaCard>
  )
}

const WARNINGS_SHOWN = 3

function FindingsCard({ findings }: { findings: readonly ErrorItem[] }) {
  const [allWarnings, setAllWarnings] = useState(false)
  const errors = findings.filter((f) => f.severity === 'error')
  const warnings = findings.filter((f) => f.severity !== 'error')
  const hiddenCount = Math.max(0, warnings.length - WARNINGS_SHOWN)
  const shown = [...errors, ...(allWarnings ? warnings : warnings.slice(0, WARNINGS_SHOWN))]
  return (
    <LaCard data-testid="findings" id="findings" className="scroll-mt-20">
      <CardHead title="What the checks found" sub="Fix blocking items first." />
      <ul className="m-0 mt-3 flex list-none flex-col p-0">
        {shown.map((f, i) => (
          <li key={i} className="flex items-start gap-3 border-b border-line py-3 last:border-b-0 last:pb-0">
            <StatusChip status={f.severity === 'error' ? 'blocked' : 'needs-you'} iconOnly label={f.severity === 'error' ? 'Blocking' : 'Warning'} />
            <div className="min-w-0 flex-1">
              <p className="text-body text-ink">{f.message}</p>
              <p className="text-caption text-ink-3">
                <span title={f.field}>{fieldLabel(f.field)}</span>
                {f.value_submitted ? ` · sent “${f.value_submitted}”` : ''}
              </p>
              {f.suggestion ? <p className="mt-0.5 text-small text-ink-2">{f.suggestion}</p> : null}
            </div>
          </li>
        ))}
      </ul>
      {hiddenCount ? (
        <Button variant="ghost" size="sm" className="mt-2 -ml-2" aria-expanded={allWarnings} onClick={() => setAllWarnings((o) => !o)}>
          {allWarnings ? 'Show fewer warnings' : `Show ${plural(hiddenCount, 'more warning')}`}
        </Button>
      ) : null}
    </LaCard>
  )
}
