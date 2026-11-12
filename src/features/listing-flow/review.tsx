/**
 * 13 Review and approve (/listings/$listingId/review). Approval is always on in v1 (C-1): the
 * banner says so and there is no "Change in Settings". Data and actions:
 *   - tabs: the product's listings (GET /listings?product_id=), one per marketplace;
 *   - "How it will read": the current version (GET /listings/{id}) + the adapter preview
 *     (GET /listings/{id}/preview) for what is sent and its mapping problems;
 *   - quality gates: gates.ts over the latest validation, the rules and the preview; "Run checks"
 *     is POST /listings/validate;
 *   - claim card: only when the checks return UNSUPPORTED_CLAIM;
 *   - "Read from your photos": the product's photo values nobody has confirmed, with Confirm /
 *     Reject (PATCH /products/{id}, features/photo-facts); after a reject, Generate again
 *     (POST /listings/{id}/regenerate) so the text drops the removed value;
 *   - "Fixed for you": what Kuinn fixed on this version (GET /issues?status=auto_fixed&listing_id=),
 *     next to the gates; it lands with them, and Approve waits for it, so it is seen first;
 *   - Approve / Approve all: POST /listings/approve (Idempotency-Key, `listing_version_id`),
 *     maker-checker explained before the click (the server's approve_hint, else makerHint over the
 *     history) and per item after; an owner alone is offered owner approval (ADR-0031), and a
 *     self-approval says it is recorded (ListingDetail.self_approval);
 *   - Send back with a note: POST /listings/approve `decision: reject` (+ `regenerate`);
 *   - once approved: Publish (POST /listings/publish) opens the publish run.
 *   - client feedback 14 and 16: one card per section (sections.tsx: Title, Key features,
 *     Description, Search terms, Attributes), each with its own limit, errors, Save (no AI; the
 *     edit is locked) and "Regenerate this section"; "How it will read" is the full preview,
 *     folded by default; answered facts name the sections they affect ("Update these sections");
 *   - SI11 "What Kuinn did" (GET /listings/{id}/resolution, Amazon only): the resolution card
 *     lands with the gates. On a resend (a fix Kuinn prepared, or a change after a send) the
 *     approve button is "Approve and resend" (approve, then publish; resend.ts) for a teammate who
 *     did not make the version; its maker or editor sees "Sent to a teammate for approval".
 *   - Feedback item 20 "Issues and fixes" (GET /listings/{id}/issue-history, every marketplace):
 *     each marketplace issue by who handles it and each fix Kuinn made; lands with the gates.
 */
import { useQueryClient } from '@tanstack/react-query'
import { Link, useLocation, useNavigate } from '@tanstack/react-router'
import { useId, useState } from 'react'
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
import { useTasksList } from '@/features/inbox/api'
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
import { ReviewPhotoValues } from '@/features/photo-facts/review-photo-values'
import { mainView, useRefreshProductViews, viewsById } from '@/features/products/image-views'
import { SavedPhoto } from '@/components/la/saved-photo'
import { useJobPolling } from '@/hooks/use-job-polling'
import { useMe } from '@/lib/auth'
import { listingChip } from '@/lib/listing-chip'
import { OP_ACTION, useCan } from '@/lib/permissions'
import { useKeys } from '@/lib/query-keys'
import { toast, toastError } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { STICKY_ASIDE } from '@/components/app/split-layout'
import { CONCEPT_ICON } from '@/components/la/concept-icons'
import { AMAZON_PUBLISHING_PAUSED_TEXT } from '@/features/brand/api'
import { approverNoticeFor, OWN_EDIT_COPY, useApproverState, useOwnerMayApproveOwn } from '@/features/team-account/approver'
import { ApproverNotice, SelfApprovalNote } from '@/features/team-account/approver-notice'
import { AutoFixedChip, FixedForYouCard } from './auto-fix'
import { autoFixTrail, FIXED_FOR_YOU_HASH, siblingFixes, versionRef } from './auto-fix-model'
import { EditDialog, SendBackDialog } from './dialogs'
import { clock, fieldLabel, mpName, plainMessage, sentenceCase } from './format'
import { FindingBody, FindingsCard } from './findings-card'
import { claimFindings, gateCounts, gatesSummary, needsGates, plural, type ErrorItem, type GateResult } from './gates'
import { IdentifierFix } from './identifier-fix'
import { answeredAfter } from './review-model'
import { SectionCards } from './sections'
import { outsideSections, SECTION_LABEL, sectionOf, type Section } from './sections-model'
import { MarketplacePreviewDialog } from './marketplace-preview'
import { AnswersBanner, RegenerateButton } from './answers-banner'
import { ListOnButton } from './list-on'
import { useListingRequirements, useListingResolution } from './api'
import { useChipContext, usePublishGate } from './publishing'
import { approveThenPublish, isResend, resendView, sectionSavedToast, TEAMMATE_TEXT } from './resend'
import { hasResolution, resolutionView } from './resolution-model'
import { ListingIssuesAndFixes } from './issues-and-fixes'
import { ResolutionActionLink, ResolutionCard } from './resolution-timeline'
import { approveAllTargets, approveBlockers, reviewApproveState } from './review-model'
import { STAGE_SUB } from './run-steps'
import { ActionButton, CardSkeleton, GATE_CHIP, GateLegend, GateList, GateListSkeleton, ReadsAsSkeleton, ReviewTopSkeleton } from './ui'
import { useListingChecks } from './use-listing-checks'

/** Resets an intent key once the server answered (a network failure keeps it, so a retry replays). */
async function keyed<T>(key: { reset: () => void }, call: Promise<T>): Promise<T> {
  try {
    const out = await call
    key.reset()
    return out
  } catch (e) {
    if (isApiError(e) && !e.isNetwork) key.reset()
    throw e
  }
}

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
  const amazon = listing.marketplace === 'amazon'
  const resolutionQ = useListingResolution(listing.id, { enabled: amazon })
  const resolution = amazon ? (resolutionQ.data ?? null) : null
  const resolutionPending = amazon && resolutionQ.isPending
  const validate = useValidateListing(listing.id)
  // Open questions (shared with the Inbox badge's cache): read only for a listing blocked on one.
  const openTasks = useTasksList('open', { enabled: listing.status === 'blocked' && listing.status_reason === 'human_task_open' })
  const appliedTasks = useTasksList('applied', { enabled: !!listing.content && listing.status !== 'created' })
  const review = useReviewListings()
  const publish = usePublishListings()
  const approveKey = useIntentKey()
  const publishKey = useIntentKey()
  const [sendBack, setSendBack] = useState(false)
  const [edit, setEdit] = useState(false)
  // Approve / publish stay "…ing" until the listing refetch shows the new status, so the buttons
  // never snap back to their resting label for a moment before the page changes.
  const [settling, setSettling] = useState<'approve' | 'publish' | null>(null)
  /** SI9: the blocking items an approve was refused for (422 VALIDATION_FAILED), for the version they belong to. */
  const [blockers, setBlockers] = useState<{ version: string | null | undefined; items: ErrorItem[] } | null>(null)

  const mp = mpName(listing.marketplace)
  const product = checks.product.data
  // Amazon publishing switched off for this deployment: nothing here offers or promises a send.
  const { paused: publishingPaused, publishBuilt } = usePublishGate(listing.marketplace)
  const actions = listingActions({
    listing,
    validation: listing.validation,
    can,
    maker: makerHint(history.rows, me.data?.user_id),
    canApprove: listing.can_approve,
    approveHint: listing.approve_hint,
    publishBuilt,
  })
  // The server is the authority on maker-checker; until the history is read, say so instead of guessing.
  // The reviewer sees what Kuinn fixed before approving: Approve waits for that read too.
  // With the server's own answer (SI10 can_approve) there is nothing to wait for in the history.
  const approveState = reviewApproveState(actions.approve, {
    canApprove: listing.can_approve,
    historySettled: !history.isPending && !history.isFetching,
    fixesPending: fixesQ.isPending,
  })
  // The product line and tabs land together, once the product and its listings are read.
  const siblingsPending = checks.siblings.isPending
  const approver = useApproverState()
  const topReady = !checks.product.isPending && !siblingsPending && approver !== 'loading'
  const siblings = checks.siblings.rows.length ? checks.siblings.rows : [listing]
  const allTargets = can('listing:approve') && !siblingsPending ? approveAllTargets(siblings) : []
  // Until the other marketplaces are read, the footer holds one Approve, so its width never changes.
  const approveShown: ActionState =
    siblingsPending && approveState.show
      ? { show: true, enabled: false, reason: 'Checking the other marketplaces…' }
      : resolutionPending && approveState.show
        ? { show: true, enabled: false, reason: 'Checking what Kuinn did…' }
        : approveState
  // SI11: a resend is one click (approve, then publish) by a teammate who did not make the version.
  const resend = resendView({ resolution, listing, approve: approveShown, can, publishBuilt })
  // While publishing is paused an edit is saved as a plain new version: nothing is resent.
  const resendEdit = amazon && isResend(resolution) && !publishingPaused
  const ownApproval = useOwnerMayApproveOwn()
  const rview = resolution && hasResolution(resolution) ? resolutionView(resolution, { marketplace: listing.marketplace, marketplaceState: listing.marketplace_state, canAnswer: can('product:import'), publishingPaused, ownApproval }) : null
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
  // Client feedback 16: a finding on a section's field shows beside that field; the general card
  // lists only the rest (images, the listing, facts), so nothing is said twice.
  const generalFindings = outsideSections(otherFindings)
  const requirementsQ = useListingRequirements(listing.id)
  const requirements = requirementsQ.isError ? null : requirementsQ.data
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
      const blocking = approveBlockers(res, listing.id)
      setBlockers(blocking ? { version: listing.current_version_id, items: blocking } : null)
      if (blocking && rows.length === 1) {
        toast.error(`Couldn’t approve ${mp}`, { description: 'The marketplace check found blocking issues. They are listed on this page.' })
      } else if (out.failed.length && !out.ok.length) {
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

  async function approveAndResend() {
    setSettling('approve')
    try {
      const out = await approveThenPublish(listing, {
        approve: (items) => keyed(approveKey, review.mutateAsync({ items, key: approveKey.get() })),
        publish: (items) => keyed(publishKey, publish.mutateAsync({ items, key: publishKey.get() })),
      })
      const ref = (id: string | null) => (id ? ` Reference: ${id}` : '')
      if (out.step === 'sent') {
        if (out.jobId) {
          rememberJob(listing.id, out.jobId)
          toast.success(`Approved. Sending to ${mp} again.`)
          void navigate({ to: '/runs/$runId', params: { runId: out.jobId } })
        } else toast.success(`Approved. Sending to ${mp} again.`)
      } else if (out.step === 'approve_failed') {
        const blocking = out.result ? approveBlockers(out.result, listing.id) : null
        setBlockers(blocking ? { version: listing.current_version_id, items: blocking } : null)
        toast.error(`Couldn’t approve ${mp}`, {
          description: blocking ? 'The marketplace check found blocking issues. They are listed on this page.' : `${out.message}${ref(out.requestId)} Nothing was sent.`,
        })
      } else {
        // The approval stands; the page now offers Publish to try the send again.
        toast.error(`Approved, but couldn’t send to ${mp}`, { description: `${out.message}${ref(out.requestId)}` })
      }
    } finally {
      // Never hold the button on "Sending…" behind a slow or rate-limited re-read.
      setSettling(null)
      void refetchListing()
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

  const infoBanner = (
    <Banner tone="info" icon={CONCEPT_ICON.approval} className="mb-4">
      <b>Approval is always on.</b> Nothing is sent to a marketplace until a person approves it.
    </Banner>
  )
  // A brand where nobody else can approve learns it here, before the click (maker-checker). The
  // server's answer for this listing wins over the team read; an owner can turn on owner approval.
  const notice = approverNoticeFor(listing, approver)
  // A role that cannot approve learns why nothing here is for them (operators, admins).
  const waitingForReviewer = !can('listing:approve') && (listing.status === 'validated' || listing.status === 'needs_review')
  const approvalBanner = waitingForReviewer ? (
    <Banner tone="info" icon={CONCEPT_ICON.approval} className="mb-4" data-testid="waiting-for-reviewer">
      <b>Waiting for a reviewer to approve.</b> An owner or reviewer approves it before it goes to {mp}.
    </Banner>
  ) : notice && can('listing:approve') ? (
    <ApproverNotice state={notice} className="mb-4" />
  ) : (
    infoBanner
  )
  // Blocked on a question that is no longer open: the answers are saved, and nothing moves until
  // the listing is generated again (backend tasks.py: resuming is not automatic).
  // Prod demo 9 Nov: a photo question still open kept this hidden after an answer, so nothing on
  // Review offered Regenerate. A fact answered after this version was written shows it too.
  const answered =
    (listing.status === 'blocked' &&
      listing.status_reason === 'human_task_open' &&
      !!openTasks.data &&
      !openTasks.rows.some((t) => t.product_id === listing.product_id)) ||
    answeredAfter(appliedTasks.rows, listing.product_id, listing.content?.created_at)
  const shownBlockers = blockers && blockers.version === listing.current_version_id ? blockers.items : null
  // Client feedback 14: the sections the answered facts feed (the server's dependency map).
  const affected: Section[] = listing.affected_sections ?? []

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
            {/* Said once: the approved banner carries the line itself, and a sent listing has nothing to approve. */}
            {publishingPaused && listing.status !== 'approved' && listing.status !== 'published' ? <PublishingPausedNote /> : null}
            <MarketplaceTabs siblings={siblings} currentId={listing.id} counts={counts} gatesKnown={checks.gatesReady} />
          </>
        ) : (
          <ReviewTopSkeleton>{infoBanner}</ReviewTopSkeleton>
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
        {(answered || affected.length > 0) && !busy ? <AnswersBanner listing={listing} affected={affected} state={actions.regenerate} /> : null}
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
            {publishingPaused
              ? AMAZON_PUBLISHING_PAUSED_TEXT
              : actions.publish.show
                ? 'Publishing sends this marketplace only.'
                : 'An operator or owner publishes it.'}
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
              {shownBlockers ? <ApproveBlockersCard items={shownBlockers} onClose={() => setBlockers(null)} /> : null}
              <ReadsAs
                checks={checks}
                listing={listing}
                claims={claims}
                author={history.isPending || history.error ? 'unknown' : contentAuthor(history.rows, !history.hasNextPage)}
                authorPending={history.isPending}
              />
              <SectionCards
                listing={listing}
                etag={checks.etag}
                findings={findings}
                editState={actions.edit}
                regenerateState={actions.regenerate}
                requirements={requirements}
                onSaved={(section) => {
                  // Item 17: with owner approval on, the owner approves their own edit (as EditDialog says).
                  const t = sectionSavedToast(SECTION_LABEL[section], { ownApproval, resendEdit, mp })
                  toast.success(t.title, { description: t.description })
                }}
              />
              {/* Unsupported claims already show on the bullet and in the claim card; section findings on their field. */}
              {generalFindings.length ? <FindingsCard findings={generalFindings} productId={listing.product_id} /> : null}
            </div>
            {/* What Kuinn did, the gates and the photo facts stay in view while the listing scrolls. */}
            <div className={cn('flex min-w-0 flex-col gap-4', STICKY_ASIDE)}>
              {/* Lands with the gates (same ready flag), so it never pushes the cards below it. */}
              {rview && checks.gatesReady && !fixesQ.isPending ? (
                <ResolutionCard
                  view={rview}
                  marketplace={listing.marketplace}
                  action={
                    rview.action.kind === 'change' ? (
                      actions.edit.show && actions.edit.enabled ? (
                        <Button size="sm" variant="secondary" onClick={() => setEdit(true)} data-testid="resolution-edit">
                          Edit the text
                        </Button>
                      ) : null
                    ) : rview.action.kind === 'approve' ? null : rview.action.kind === 'regenerate' ? (
                      <RegenerateButton listing={listing} state={actions.regenerate} testId="resolution-regenerate" />
                    ) : rview.action.kind === 'answer' && !can('product:import') ? null : (
                      <ResolutionActionLink
                        action={rview.action}
                        listingId={listing.id}
                        marketplace={listing.marketplace}
                        productId={can(OP_ACTION['PATCH /products/{product_id}']) ? listing.product_id : null}
                      />
                    )
                  }
                />
              ) : null}
              <ListingIssuesAndFixes
                listingId={listing.id}
                marketplace={listing.marketplace}
                ready={checks.gatesReady && !fixesQ.isPending}
                poll={!!rview?.headline.working}
                linkFields={false}
              />
              <GatesCard
                gates={checks.gates}
                ready={checks.gatesReady && !fixesQ.isPending && !resolutionPending}
                neverChecked={!checks.current.checked}
                listed={generalFindings}
                rulesCount={checks.rules?.length ?? null}
                listing={listing}
                validateState={actions.validate}
                validating={validate.isPending}
                onValidate={() => validate.mutate(listing.current_version_id ?? null)}
              />
              {/* Lands with the gates and "Fixed for you", so nothing below it moves. */}
              {product && checks.gatesReady && !fixesQ.isPending ? (
                <ReviewPhotoValues
                  product={product}
                  afterReject={<RegenerateButton listing={listing} state={actions.regenerate} />}
                />
              ) : null}
              {/* Lands with the gates (same ready flag), so it never pushes the cards below it. */}
              {fixesQ.isPending || !checks.gatesReady ? null : (
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
            <>
              <SelfApprovalNote
                selfApproval={listing.self_approval}
                enabled={resend.kind === 'approve_and_resend' ? resend.state.enabled : approveShown.enabled}
                className="mb-0.5"
              />
              {publishingPaused ? (
                <span data-testid="approve-bar-paused">
                  {resend.kind === 'teammate' ? <b className="text-ink">{TEAMMATE_TEXT}. </b> : null}
                  {AMAZON_PUBLISHING_PAUSED_TEXT}
                </span>
              ) : resend.kind === 'teammate' ? (
                <span data-testid="resend-teammate">
                  <b className="text-ink">{TEAMMATE_TEXT}.</b> You made this version, so a teammate approves it and sends it to {mp} again.
                </span>
              ) : resend.kind === 'approve_and_resend' ? (
                `Approving sends this version to ${mp} again.`
              ) : allTargets.length > 1 ? (
                <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span>Each marketplace is approved as its own listing.</span>
                  {batchFixes.map(({ listing: l, count }) => (
                    <AutoFixedChip key={l.id} listingId={l.id} count={count} label={`${mpName(l.marketplace)}: ${count} fixed`} />
                  ))}
                </span>
              ) : actions.publish.show ? (
                `Publishing sends ${mp} only.`
              ) : (
                `Approving does not send it. An operator or owner publishes it to ${mp}.`
              )}
            </>
          }
        >
          <ActionButton state={actions.reject} variant="ghost" onClick={() => setSendBack(true)} data-testid="send-back">
            Send back with a note
          </ActionButton>
          {resend.kind === 'teammate' ? null : resend.kind === 'approve_and_resend' ? (
            <ActionButton state={resend.state} disabled={approving} onClick={() => void approveAndResend()} data-testid="approve-resend">
              {approving ? 'Sending…' : 'Approve and resend'}
            </ActionButton>
          ) : (
            <ActionButton
              state={approveShown}
              variant={allTargets.length > 1 ? 'secondary' : 'primary'}
              disabled={approving}
              onClick={() => void approve([listing])}
              data-testid="approve"
            >
              {approving ? 'Approving…' : `Approve ${mp}`}
            </ActionButton>
          )}
          {allTargets.length > 1 && resend.kind === 'none' ? (
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
          resend={resendEdit}
          onSaved={() => {
            setEdit(false)
            if (ownApproval)
              toast.success('Saved as a new version', { description: resendEdit ? OWN_EDIT_COPY.toastResend(mp) : OWN_EDIT_COPY.toast })
            else if (resendEdit) toast.success(TEAMMATE_TEXT, { description: `Saved as a new version. A teammate approves it and sends it to ${mp} again.` })
            else toast.success('Saved as a new version', { description: 'The checks ran again. Someone else approves your edit.' })
          }}
        />
      ) : null}
    </div>
  )
}

/** The calm line a review page shows while Amazon publishing is switched off. */
function PublishingPausedNote() {
  return (
    <Banner tone="neutral" className="mb-4" data-testid="publishing-paused">
      {AMAZON_PUBLISHING_PAUSED_TEXT}
    </Banner>
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
  const chipCtx = useChipContext()
  const sorted = [...siblings].sort((a, b) => a.marketplace.localeCompare(b.marketplace))
  return (
    <nav aria-label="Marketplaces" className="mb-5 flex w-full gap-1 overflow-x-auto border-b border-line" data-testid="review-tabs">
      {sorted.map((l) => {
        const on = l.id === currentId
        const chip = listingChip(l, chipCtx)
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
}: {
  checks: ReturnType<typeof useListingChecks>
  listing: ListingDetail
  claims: readonly ErrorItem[]
  /** contentAuthor(): the version's confidence score is copied into edits, so history decides. */
  author: 'agent' | 'team' | 'unknown'
  /** The history is still being read: the author line is a placeholder, not a guess. */
  authorPending: boolean
}) {
  const canonical = listing.content!
  const content = canonical.content
  const [more, setMore] = useState(false)
  // The section cards below show every field; the full preview is one click away (client feedback 16).
  const [open, setOpen] = useState(false)
  const bodyId = useId()
  const [removedOpen, setRemovedOpen] = useState(false)
  // Client feedback 16: the complete listing, laid out like the marketplace's page.
  const [looks, setLooks] = useState(false)
  const mp = mpName(listing.marketplace)
  const preview = checks.preview
  const items = preview.data?.items ?? []
  const children = items.filter((i) => i.item_role === 'child').length
  const parents = items.filter((i) => i.item_role === 'parent').length
  const mappingErrors = preview.data?.report.errors ?? []
  const imageCount = canonical.images?.length ?? 0
  // The listing's lead photo, shown from the product read's signed views (refreshed before expiry).
  const product = checks.product.data
  const views = viewsById(product)
  const lead = [...(canonical.images ?? [])].sort((a, b) => Number(b.slot === 'main') - Number(a.slot === 'main') || (a.position ?? 0) - (b.position ?? 0))
  const leadView = lead.map((ref) => views.get(ref.image_id)).find(Boolean) ?? mainView(product)
  const refreshViews = useRefreshProductViews(listing.product_id)
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
          <span className="flex flex-wrap items-center justify-end gap-1">
            <Button size="sm" variant="secondary" onClick={() => setLooks(true)} data-testid="mp-preview-open">
              <Icon name="eye" size={14} aria-hidden />
              Preview on {mp}
            </Button>
            <Button size="sm" variant="ghost" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen((o) => !o)} data-testid="reads-as-toggle">
              {open ? 'Hide the summary' : 'Show the summary'}
              <Icon name="chev" size={14} aria-hidden className={cn('motion-safe:transition-transform motion-safe:duration-150', open && 'rotate-180')} />
            </Button>
          </span>
        }
      />
      <MarketplacePreviewDialog open={looks} onOpenChange={setLooks} listing={listing} product={product} />
      <div className="mt-4 flex flex-col items-start gap-4 sm:flex-row">
        <div className="flex shrink-0 flex-col items-center gap-2">
          {imageCount && leadView ? (
            <figure className="relative m-0 size-[130px] shrink-0" data-testid="reads-as-photo">
              <SavedPhoto
                src={leadView}
                alt={`Main photo, one of ${plural(imageCount, 'image')} attached`}
                onError={refreshViews}
                iconSize={28}
                className="size-full rounded-xl border border-line bg-field text-ink-2 shadow-inset-md"
              />
              <figcaption className="absolute bottom-2 left-2 rounded-md border border-line bg-surface/95 px-1.5 py-0.5 text-caption font-semibold text-ink shadow-raised-sm">
                {plural(imageCount, 'image')}
              </figcaption>
            </figure>
          ) : (
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
          )}
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
          <div id={bodyId} hidden={!open}>
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
      </div>
      {mappingErrors.length ? (
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-control bg-attention-bg px-3 py-2 text-small text-attention-ink" data-testid="mapping-problems">
          <span className="flex min-w-0 flex-1 items-start gap-2">
            <Icon name="alert" size={16} className="mt-0.5 shrink-0" aria-hidden />
            <span className="min-w-0 break-words">
              <b>{plural(mappingErrors.length, 'mapping problem')}:</b> {sentenceCase(plainMessage(mappingErrors[0]!.message))}
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
  const can = useCan()
  const panelId = useId()
  const v = listing.validation
  const onCurrent = !!v && v.listing_version_id === listing.current_version_id
  const stage = onCurrent ? v.stages?.[v.stages.length - 1] : undefined
  const counts = gateCounts(gates)
  const needs = needsGates(gates)
  const serverBlocking = listing.display_state === 'needs_you' ? (listing.needs_you_count ?? 0) : 0
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
            {gatesSummary(counts)}
          </p>
          {needs.length ? (
            <ul className="m-0 mt-2 flex list-none flex-col gap-1.5 p-0" data-testid="gates-needs">
              {needs.map((g) => {
                const n = g.findings.filter((f) => listedSet.has(f)).length
                // A finding on a section's field is shown on that card (client feedback 16).
                const onCard = n ? null : (g.findings.map((f) => sectionOf(f.field)).find((x) => x !== null) ?? null)
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
                      ) : onCard ? (
                        <>
                          {' '}
                          <a href={`#section-${onCard}`} className="focus-ring rounded-sm font-semibold whitespace-nowrap text-brand hover:underline">
                            See it on {SECTION_LABEL[onCard]}
                          </a>
                        </>
                      ) : null}
                      {g.id === 'identity' ? (
                        <IdentifierFix gate={g} productId={listing.product_id} marketplace={listing.marketplace} canEdit={can(OP_ACTION['PATCH /products/{product_id}'])} canEditVariants={can('product:import')} />
                      ) : null}
                    </span>
                  </li>
                )
              })}
            </ul>
          ) : serverBlocking > 0 ? (
            // The open issues could not be read here, but the server counts them: never "nothing blocks".
            <p className="mt-2 text-small text-ink" data-testid="gates-server-blocking">
              {plural(serverBlocking, 'open issue')} {serverBlocking === 1 ? 'blocks' : 'block'} approval.{' '}
              <Link to="/inbox" className="focus-ring rounded-sm font-semibold text-brand hover:underline">
                Open the Inbox
              </Link>
            </p>
          ) : onCurrent ? (
            <p className="mt-2 text-small text-ink">
              {counts.passed === counts.total ? `All ${counts.total} checks passed.` : 'Nothing blocks approval in the checks that ran.'}
              {counts.recommended ? (
                <>
                  {' '}
                  <a href="#section-attributes" className="focus-ring rounded-sm font-semibold whitespace-nowrap text-brand hover:underline" data-testid="gates-recommended">
                    See {counts.recommended} recommended
                  </a>
                </>
              ) : null}
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
            ? `${v.blocking_count} blocking, ${v.warning_count} ${v.warning_count === 1 ? 'warning' : 'warnings'}${counts.recommended ? `, ${counts.recommended} recommended` : ''} on version ${listing.content?.version ?? ''}${stage ? `, checked ${clock(stage.created_at)}` : ''}.`
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

/** SI9: why approve was refused: the marketplace check's blocking items, and what to do about each. */
function ApproveBlockersCard({ items, onClose }: { items: readonly ErrorItem[]; onClose: () => void }) {
  return (
    <LaCard emphasis="attention" data-testid="approve-blockers" role="alert">
      <CardHead
        icon="alert"
        iconTone="warn"
        title="Approve was stopped"
        sub="The marketplace check found what it would refuse. Fix these, then approve."
        action={
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Hide these issues">
            <Icon name="x" size={16} />
          </Button>
        }
      />
      {items.length ? (
        <ul className="m-0 mt-3 flex list-none flex-col p-0">
          {items.map((f, i) => (
            <li key={i} className="flex items-start gap-3 border-b border-attention-line py-3 last:border-b-0 last:pb-0">
              <StatusChip status={f.severity === 'error' ? 'blocked' : 'needs-you'} iconOnly label={f.severity === 'error' ? 'Blocking' : 'Warning'} />
              <FindingBody f={f} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-body text-ink-2">Run checks to see the details.</p>
      )}
    </LaCard>
  )
}
