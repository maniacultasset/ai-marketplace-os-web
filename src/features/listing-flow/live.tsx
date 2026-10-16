/**
 * 14 Live confirmation (/listings/$listingId/live). "Live" is rendered only with proof (proof.ts):
 * marketplace state live, the marketplace's ID (via the live link the backend builds from it) and
 * the confirmation time of the live submission. Otherwise the same frame says honestly where the
 * listing is and what is missing. Reads:
 *   GET /listings/{id}, GET /listings/{id}/status (polled while the marketplace decides),
 *   GET /listings/{id}/submissions, GET /listings/{id}/history, GET /listings?product_id=,
 *   GET /products/{id}. Action: "Check status now" is POST /listings/{id}/refresh-status
 *   (Idempotency-Key; 429 inside 5 minutes).
 */
import { Link } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { BUILT } from '@/api/capabilities'
import { isApiError, isNotFound, isRateLimited } from '@/api/errors'
import { useIntentKey } from '@/api/idempotency'
import { Page } from '@/components/app/page-header'
import { Icon, LaCard, SUPPORTED_MARKETPLACES } from '@/components/la'
import { ErrorState } from '@/components/states/error-state'
import { NotFound } from '@/components/states/not-found'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useListing, useListingHistory, useListingSubmissions, useRefreshStatus } from '@/features/listings/api'
import { recallJob } from '@/features/listings/job-memory'
import { contentAuthor, listingActions, MARKETPLACE_STATE_META, type ListingDetail } from '@/features/listings/model'
import { useProduct } from '@/features/products/api'
import { useCan } from '@/lib/permissions'
import { toast, toastError } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { useListingStatus, useProductListings } from './api'
import { clock, mpName } from './format'
import { plural } from './gates'
import { ListOnButton } from './list-on'
import { liveProof, maskId, type Proof } from './proof'
import { CardSkeleton, KeyValues, Timeline, TimelineItem, type DotTone } from './ui'

export function LiveScreen({ listingId }: { listingId: string }) {
  const listingQ = useListing(listingId)
  if (listingQ.isPending)
    return (
      <Page>
        <div aria-busy="true" aria-label="Loading the listing status">
          <Skeleton className="h-[100px] w-full rounded-card" />
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <CardSkeleton lines={7} />
            <CardSkeleton lines={4} />
          </div>
        </div>
      </Page>
    )
  if (listingQ.error || !listingQ.data) {
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
  return <LiveBody listing={listingQ.data.data} />
}

const HERO: Record<Proof['state'], { tone: 'success' | 'danger' | 'neutral' }> = {
  live: { tone: 'success' },
  unconfirmed: { tone: 'neutral' },
  partial: { tone: 'neutral' },
  waiting: { tone: 'neutral' },
  problem: { tone: 'danger' },
  'not-sent': { tone: 'neutral' },
}

function heroCopy(p: Proof, title: string, mp: string): { title: string; line: string } {
  switch (p.state) {
    case 'live':
      return {
        title: `${title} is live on ${mp}`,
        line: `${mp} confirmed ${confirmedWhat(p.variants)} at ${clock(p.confirmedAt)}.`,
      }
    case 'unconfirmed':
      return { title: `${mp} reports ${title} live`, line: `We can’t confirm it yet: ${p.missing.join(', ')}.` }
    case 'partial':
      return {
        title: `${title} is only partly live on ${mp}`,
        line: `${mp} reports ${p.variants ? `${p.variants.live} of ${p.variants.total} variants live` : 'some variants live and others not'}. Open the checks to see which ones need attention.`,
      }
    case 'waiting':
      return { title: `Waiting for ${mp} to confirm`, line: `Sent${p.sentAt ? ` at ${clock(p.sentAt)}` : ''}. ${mp} reports: ${MARKETPLACE_STATE_META[p.marketplaceState].label.toLowerCase()}.` }
    case 'problem':
      return { title: `${title} is not live on ${mp}`, line: `${mp} reports: ${MARKETPLACE_STATE_META[p.marketplaceState].label.toLowerCase()}. Open the checks to see why.` }
    case 'not-sent':
      return { title: `${title} has not been sent to ${mp}`, line: 'It goes out after a person approves it and it is published.' }
  }
}

function confirmedWhat(v: Proof['variants']): string {
  if (!v || v.total <= 1) return 'it'
  return v.live === v.total ? `all ${v.total} variants` : `${v.live} of ${v.total} variants`
}

function LiveBody({ listing }: { listing: ListingDetail }) {
  const can = useCan()
  const mp = mpName(listing.marketplace)
  const product = useProduct(listing.product_id)
  const status = useListingStatus(listing.id, { poll: true })
  const subs = useListingSubmissions(listing.id)
  const siblings = useProductListings(listing.product_id)
  const refresh = useRefreshStatus(listing.id)
  const refreshKey = useIntentKey()
  const [copied, setCopied] = useState(false)

  const proof = liveProof(listing, status.data, subs.rows)
  const title = product.data?.title ?? 'This product'
  const hero = heroCopy(proof, title, mp)
  const actions = listingActions({ listing, validation: listing.validation, can, publishBuilt: BUILT['listings.publish'] })

  // The design's toast: once, when this page watches the listing turn live with proof.
  const was = useRef<Proof['state'] | null>(null)
  useEffect(() => {
    if (subs.isPending || status.isPending) return
    if (was.current && was.current !== 'live' && proof.state === 'live')
      toast.success(`${title} is live`, { description: `${mp}${proof.externalId ? ` · ID ${maskId(proof.externalId)}` : ''}` })
    was.current = proof.state
  }, [proof.state, proof.externalId, subs.isPending, status.isPending, title, mp])

  const others = SUPPORTED_MARKETPLACES.filter((m) => m.id !== listing.marketplace)
  const runJob = recallJob(listing.id)

  return (
    <Page>
      <h1 className="sr-only">{hero.title}</h1>
      <LaCard
        emphasis={proof.state === 'live' ? 'success' : 'default'}
        className={cn('flex flex-col gap-4 sm:flex-row sm:items-center', HERO[proof.state].tone === 'danger' && 'border-danger-line bg-danger-bg')}
        data-testid="live-hero"
        data-state={proof.state}
      >
        <span
          aria-hidden
          className={cn(
            'inline-flex size-11 shrink-0 items-center justify-center rounded-full border text-[15px]',
            proof.state === 'live' ? 'border-success-line bg-success-bg text-success' : 'border-line-strong bg-subtle text-ink-2',
          )}
        >
          {proof.state === 'live' ? '●' : proof.state === 'problem' ? '✕' : '◐'}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-h2 text-ink">{product.isPending ? <Skeleton className="h-6 w-72" /> : hero.title}</h2>
          <p className={cn('mt-0.5 text-small', proof.state === 'live' ? 'text-success-ink' : 'text-ink-2')}>
            {subs.isPending || status.isPending ? 'Reading the marketplace status…' : hero.line}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {proof.state === 'live' && proof.liveUrl ? (
            <Button variant="secondary" asChild>
              <a href={proof.liveUrl} target="_blank" rel="noreferrer noopener" data-testid="view-live">
                View live listing
                <Icon name="arrow" size={14} />
              </a>
            </Button>
          ) : null}
          {proof.state === 'problem' || proof.state === 'partial' ? (
            <Button variant="warn" asChild>
              <Link to="/listings/$listingId/mapping" params={{ listingId: listing.id }}>
                See the checks
              </Link>
            </Button>
          ) : null}
          {proof.state === 'not-sent' ? (
            <Button variant="secondary" asChild>
              <Link to="/listings/$listingId/review" params={{ listingId: listing.id }}>
                Review and approve
              </Link>
            </Button>
          ) : null}
          {actions.refreshStatus.show && proof.state !== 'not-sent' ? (
            <Button
              variant="ghost"
              disabled={refresh.isPending}
              data-testid="refresh-status"
              onClick={() =>
                refresh.mutate(refreshKey.get(), {
                  onSuccess: () => {
                    refreshKey.reset()
                    toast.success(`Asked ${mp} for the latest status`, { description: 'This page updates when it answers.' })
                  },
                  onError: (e) => {
                    // A network failure keeps the key, so a retry replays the same request.
                    if (isApiError(e) && !e.isNetwork) refreshKey.reset()
                    if (isRateLimited(e)) toast.info('Checked recently', { description: 'You can check again a few minutes after the last check.' })
                    else toastError(e, 'Couldn’t check the marketplace status')
                  },
                })
              }
            >
              <Icon name="refresh" size={14} />
              {refresh.isPending ? 'Checking…' : 'Check status now'}
            </Button>
          ) : null}
        </div>
      </LaCard>

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-2">
        <LaCard data-testid="proof">
          <h3 className="text-h3 text-ink">{proof.state === 'live' ? 'Proof we hold' : 'What we hold so far'}</h3>
          {subs.isPending ? (
            <div className="mt-4 flex flex-col gap-2" aria-hidden>
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-4" />
              ))}
            </div>
          ) : subs.error ? (
            <ErrorState error={subs.error} compact title="Couldn’t load the submissions" onRetry={() => void subs.refetch()} />
          ) : (
            <KeyValues
              className="mt-4"
              rows={[
                { term: 'Marketplace status', value: MARKETPLACE_STATE_META[proof.marketplaceState].label, testId: 'proof-state' },
                {
                  term: 'Listing ID',
                  value: proof.externalId ? <span title={proof.externalId}>{maskId(proof.externalId)}</span> : <span className="text-ink-2">Not received yet</span>,
                },
                {
                  term: 'Seller SKU mapped',
                  value: proof.skus.length ? (
                    <span title={proof.skus.join(', ')}>
                      {proof.skus.length > 1 ? `${product.data?.sku ?? proof.skus[0]} · ${proof.skus.length} SKUs` : proof.skus[0]}
                      {proof.state === 'live' ? ' ✓' : ''}
                    </span>
                  ) : (
                    <span className="text-ink-2">{product.data?.sku ?? '—'}</span>
                  ),
                },
                { term: 'Variants live', value: proof.variants ? `${proof.variants.live} of ${proof.variants.total}` : <span className="text-ink-2">Not reported</span> },
                {
                  term: 'Live link',
                  value: proof.liveUrl ? (
                    <a href={proof.liveUrl} target="_blank" rel="noreferrer noopener" className="break-all text-brand hover:underline">
                      {proof.liveUrl.replace(/^https?:\/\/(www\.)?/, '')}
                    </a>
                  ) : (
                    <span className="text-ink-2">{listing.marketplace === 'flipkart' ? 'Flipkart does not return a link' : 'Not received yet'}</span>
                  ),
                },
                {
                  term: 'Submitted',
                  value: proof.latest ? `${proof.sentAt ? clock(proof.sentAt) : 'Queued'} · attempt ${proof.attempt}` : <span className="text-ink-2">Not yet</span>,
                },
                { term: 'Confirmed', value: proof.confirmedAt ? clock(proof.confirmedAt) : <span className="text-ink-2">Not yet</span> },
              ]}
            />
          )}
          {proof.state !== 'live' && runJob && (listing.status === 'publishing' || listing.status === 'approved') ? (
            <Button variant="link" size="sm" className="mt-3" asChild>
              <Link to="/runs/$runId" params={{ runId: runJob }}>
                Watch the publish run
              </Link>
            </Button>
          ) : null}
        </LaCard>

        <div className="flex min-w-0 flex-col gap-4">
          <AgentDid listing={listing} />
          <LaCard data-testid="next">
            <h3 className="text-h3 text-ink">Next</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {others.map((m) => {
                const existing = siblings.rows.find((l) => l.marketplace === m.id)
                if (existing)
                  return (
                    <Button key={m.id} variant="secondary" asChild>
                      <Link to="/listings/$listingId/review" params={{ listingId: existing.id }}>
                        Open {m.name}
                      </Link>
                    </Button>
                  )
                return siblings.isPending ? null : <ListOnButton key={m.id} productId={listing.product_id} marketplace={m.id as 'amazon' | 'flipkart'} />
              })}
              {can('product:import') ? (
                <Button variant="secondary" asChild>
                  <Link to="/add">Add next product</Link>
                </Button>
              ) : null}
              {proof.liveUrl ? (
                <Button
                  variant="ghost"
                  onClick={() =>
                    void navigator.clipboard
                      ?.writeText(proof.liveUrl!)
                      .then(() => {
                        setCopied(true)
                        setTimeout(() => setCopied(false), 1500)
                      })
                      .catch(() => undefined)
                  }
                >
                  {copied ? 'Copied' : 'Copy link'}
                </Button>
              ) : null}
            </div>
            {others.some((m) => !siblings.rows.some((l) => l.marketplace === m.id)) && can('listing:generate') ? (
              <p className="mt-3 text-small text-ink-2">The other marketplace is prepared from the same product record.</p>
            ) : null}
          </LaCard>
        </div>
      </div>
      {status.error ? (
        <p className="mt-3 text-caption text-ink-3">
          Couldn’t refresh the status{isApiError(status.error) && status.error.correlationId ? ` (reference ${status.error.correlationId})` : ''}. Showing the last known state.
        </p>
      ) : null}
      <span className="sr-only" aria-live="polite">
        {proof.state === 'live' ? `${title} is live on ${mp}` : ''}
      </span>
    </Page>
  )
}

/** "What the agent did for you": only what the version and history prove. */
function AgentDid({ listing }: { listing: ListingDetail }) {
  const history = useListingHistory(listing.id)
  const c = listing.content
  const v = listing.validation
  const approved = history.rows.find((e) => e.action === 'listing.approved')
  const edits = history.rows.filter((e) => e.action === 'listing.edited').length
  const regen = history.rows.filter((e) => e.action === 'listing.regenerate_requested' || (e.action === 'listing.rejected' && e.after?.['status'] === 'generating')).length
  const author = contentAuthor(history.rows, !history.hasNextPage)
  const items: { text: string; tone: DotTone }[] = []
  if (c)
    items.push({
      tone: 'ok',
      text:
        author === 'agent'
          ? `Wrote the title, ${plural(c.content.bullets.length, 'bullet')} and the description`
          : author === 'team'
            ? 'Wrote the first draft. Your team made the last change to this text'
            : 'Wrote the first draft',
    })
  if (c?.keywords?.search_terms?.length) items.push({ tone: 'ok', text: `Chose ${plural(c.keywords.search_terms.length, 'search term')}` })
  if (v && v.listing_version_id === listing.current_version_id)
    items.push(
      v.passed
        ? { tone: 'ok', text: 'Passed the marketplace rules on this version' }
        : { tone: 'need', text: `Found ${plural(v.blocking_count, 'blocking issue')} on this version` },
    )
  if (regen) items.push({ tone: 'ok', text: `Rewrote it ${regen === 1 ? 'once' : `${regen} times`} after feedback` })
  if (edits) items.push({ tone: 'ok', text: `Kept ${plural(edits, 'edit')} made by your team` })
  if (approved) items.push({ tone: 'ok', text: `Waited for approval (approved ${clock(approved.occurred_at)})` })
  return (
    <LaCard data-testid="agent-did">
      <h3 className="text-h3 text-ink">What the agent did for you</h3>
      {history.isPending ? (
        <div className="mt-4 flex flex-col gap-2" aria-hidden>
          <Skeleton className="h-4" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      ) : items.length ? (
        <Timeline className="mt-4" label="What the agent did">
          {items.map((t) => (
            <TimelineItem key={t.text} tone={t.tone}>
              <span className="text-ink">{t.text}</span>
            </TimelineItem>
          ))}
        </Timeline>
      ) : (
        <p className="mt-3 text-small text-ink-2">Nothing recorded yet.</p>
      )}
    </LaCard>
  )
}
