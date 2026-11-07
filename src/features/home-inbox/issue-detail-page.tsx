/**
 * /issues/$issueId (hi-fi 16 Issue detail). The API has no GET /issues/{id}, so the issue is found
 * among its listing's issues (GET /issues?listing_id=…, every status). Links from the app pass
 * `?listing=`; a bare deep link searches the newest issues first.
 *
 *   header      GET /listings/{id} (status chip) + GET /products/{id} (title, SKU)
 *   issue card  IssueOut: raw marketplace text unchanged, plain language, class, next step,
 *               its own history (first seen, repeats, how it closed)
 *   attempts    GET /listings/{id}/submissions (attempt, outcome, error report)
 *   banner      this open issue's error came back on the newest submission of its version, and
 *               that error report says the attempts are used up or the error is not retryable
 *   actions     p16 "Choose category" (only for category issues) and "Ask support" have no API:
 *               shown disabled with the reason; "Open product" is the real way to change content.
 *               A category picker cannot work here: an issue belongs to a listing, a listing keeps
 *               the category it was made with (generation.py), and PATCH /products refuses a new
 *               category once the product has any listing (product_edit.py)
 *   dismiss     POST /issues/{id}/dismiss (open warnings, listing:approve)
 */
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { Page } from '@/components/app/page-header'
import { Banner } from '@/components/la/banner'
import { CardHead, LaCard } from '@/components/la/cards'
import { Icon } from '@/components/la/icons'
import { StatusChip } from '@/components/la/status-chip'
import { ErrorState, NotFound } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Skeleton } from '@/components/ui/skeleton'
import { NOT_YET, UnavailableButton } from '@/components/la/unavailable'
import { DismissIssueButton } from '@/features/inbox/dismiss-issue'
import { canDismiss, isAutoFix, issueHeadline, MARKETPLACE_LABEL, RESOLUTION_LABEL, SOURCE_LABEL, type Issue } from '@/features/inbox/model'
import { useListing, useListingSubmissions } from '@/features/listings/api'
import { FIXED_FOR_YOU_HASH } from '@/features/listing-flow/auto-fix-model'
import { ScreenHead } from '@/features/listing-flow/ui'
import { useProduct } from '@/features/products/api'
import { listingChip } from '@/lib/listing-chip'
import { useCan } from '@/lib/permissions'
import { supportMailto } from '@/lib/support'
import { useFindIssueListing, useListingIssues } from './api'
import {
  attemptsTimeline,
  issueAffects,
  issueChip,
  issueClassLine,
  issueFixTrail,
  issueNextStep,
  issuePlainLabel,
  issueTimeline,
  issueTrailLink,
  isCategoryIssue,
  issueTitle,
  plural,
  retriesStopped,
} from './model'
import { CodeBlock, FixTrail, KeyValues, Timeline } from './parts'

export function IssueDetailPage({ issueId, listingId }: { issueId: string; listingId: string | undefined }) {
  const find = useFindIssueListing(issueId, !listingId)
  const resolved = listingId ?? find.data ?? undefined
  if (!listingId && find.isPending) return <DetailSkeleton />
  if (!listingId && find.isError)
    return (
      <Page>
        <BackLink />
        <LaCard>
          <ErrorState error={find.error} title="Couldn't look up this issue" onRetry={() => void find.refetch()} />
        </LaCard>
      </Page>
    )
  if (!resolved) return <IssueNotFound />
  return <IssueForListing issueId={issueId} listingId={resolved} />
}

function IssueForListing({ issueId, listingId }: { issueId: string; listingId: string }) {
  const issues = useListingIssues(listingId)
  const listing = useListing(listingId)
  const product = useProduct(listing.data?.data.product_id)
  const submissions = useListingSubmissions(listingId)
  const can = useCan()

  if (issues.isPending) return <DetailSkeleton />
  if (issues.isError)
    return (
      <Page>
        <BackLink />
        <LaCard>
          <ErrorState error={issues.error} title="Couldn't load this issue" onRetry={() => void issues.refetch()} />
        </LaCard>
      </Page>
    )
  const issue = issues.data.find((i) => i.id === issueId)
  if (!issue) return <IssueNotFound />

  const l = listing.data?.data
  const fixed = isAutoFix(issue)
  const trailLink = l ? issueTrailLink(issue, l) : null
  const others = issues.data.filter((i) => i.id !== issueId)
  const openCount = issues.data.filter((i) => i.status === 'open').length
  // Only once the attempts have loaded: the banner lands with them, in the same paint.
  const stopped = submissions.isPending ? null : retriesStopped(submissions.rows, issue)
  const marketplace = MARKETPLACE_LABEL[issue.marketplace]
  const chip = l ? listingChip(l) : null
  // The head paints once: title, SKU line and chip together. Until the listing (and then its
  // product) has answered, each slot holds a skeleton of its own size. "<Marketplace> listing"
  // is only the fallback when one of those reads failed.
  const headPending = listing.isPending || (!!l && product.isPending)

  return (
    <Page>
      <BackLink />
      {/* Same head as the run, review and mapping screens; null shows the title skeleton. */}
      <ScreenHead
        title={
          product.data?.title ? (
            <span data-testid="issue-product-title">{product.data.title}</span>
          ) : headPending ? null : (
            <span data-testid="issue-product-title">{`${marketplace} listing`}</span>
          )
        }
        sub={
          headPending ? (
            // The sub line is a <p>: an inline placeholder (a Skeleton is a div) keeps the markup valid.
            <span aria-hidden data-slot="skeleton" className="skeleton inline-block h-4 w-48 max-w-full rounded-md bg-subtle align-middle" />
          ) : (
            [product.data?.sku, marketplace, `${openCount} open ${plural(openCount, 'issue')}`].filter(Boolean).join(' · ')
          )
        }
        right={
          headPending ? (
            <Skeleton className="h-[22px] w-20 rounded-full" />
          ) : chip ? (
            <StatusChip status={chip.status}>{chip.label}</StatusChip>
          ) : null
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <LaCard className="flex flex-col gap-3" data-testid="issue-card" data-issue-id={issue.id}>
          <IssueBody issue={issue} />
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {issue.status === 'open' && isCategoryIssue(issue) ? (
              <UnavailableButton reason={NOT_YET.chooseCategory} data-testid="issue-choose-category">
                Choose category
              </UnavailableButton>
            ) : null}
            {/* A fix links to the review only while it belongs to the version there; an older
                version's fix is history, on the product's Activity tab. */}
            {!fixed ? null : listing.isPending ? (
              <Skeleton className="h-9 w-40 rounded-control" />
            ) : l && trailLink === 'review' ? (
              <Button asChild data-testid="issue-open-review">
                <Link to="/listings/$listingId/review" params={{ listingId }} hash={FIXED_FOR_YOU_HASH}>
                  See it in the review
                </Link>
              </Button>
            ) : l ? (
              <Button asChild data-testid="issue-open-activity">
                <Link to="/products/$productId" params={{ productId: l.product_id }} search={{ tab: 'activity' }}>
                  See it in Activity
                </Link>
              </Button>
            ) : null}
            {listing.isPending ? (
              <Skeleton className="h-9 w-32 rounded-control" />
            ) : l ? (
              <Button
                asChild
                variant={(issue.status === 'open' && isCategoryIssue(issue)) || fixed ? 'secondary' : 'primary'}
                data-testid="issue-open-product"
              >
                <Link to="/products/$productId" params={{ productId: l.product_id }}>
                  Open product
                </Link>
              </Button>
            ) : null}
            {canDismiss(issue, can('listing:approve')) ? <DismissIssueButton issue={issue} /> : null}
            <Button asChild variant="ghost" data-testid="issue-ask-support">
              <a href={supportMailto(`Help with ${issue.error_code}`, `Issue ${issue.id}${l ? ` on listing ${l.id}` : ''}.\n\n`)}>Ask support</a>
            </Button>
          </div>
        </LaCard>

        {/* The attempts column: the "Retries stopped" banner sits under its card, so it lands with
            the attempts and never pushes content that is already on screen. */}
        <div className="flex min-w-0 flex-col gap-4">
          <LaCard className="flex flex-col gap-3" data-testid="attempts-card">
            <CardHead title={`Submissions to ${marketplace}`} sub="Every attempt to send this listing, oldest first." />
            {submissions.isPending ? (
              <div className="space-y-3">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ) : submissions.isError ? (
              <ErrorState compact error={submissions.error} title="Couldn't load the attempts" onRetry={() => void submissions.refetch()} />
            ) : submissions.rows.length === 0 ? (
              <p className="text-small text-ink-2" data-testid="attempts-empty">
                Not sent to {marketplace} yet. This issue was found by our own checks before sending.
              </p>
            ) : (
              <>
                <Timeline label="Submission attempts" entries={attemptsTimeline(submissions.rows)} />
                {submissions.hasNextPage ? (
                  <Button variant="ghost" size="sm" className="self-start" onClick={() => void submissions.fetchNextPage()}>
                    Load older attempts
                  </Button>
                ) : null}
              </>
            )}
          </LaCard>
        {stopped ? (
          <Banner tone="attention" role="status">
            <span data-testid="retries-stopped" data-reason={stopped.reason}>
              {stopped.reason === 'exhausted' ? (
                <>
                  <b>
                    Retries stopped after {stopped.attempts} {plural(stopped.attempts, 'attempt')}.
                  </b>{' '}
                  {stopped.attempts > 1 ? 'The same error came back without any new input, so we' : 'We'} will not resubmit
                  until something changes.
                </>
              ) : (
                <>
                  <b>Not retried.</b> {marketplace} reported an error that sending the same listing again cannot fix, so we
                  will not resubmit until something changes.
                </>
              )}{' '}
              Changing the listing and approving it again starts a new attempt.
            </span>
          </Banner>
        ) : null}
        </div>
      </div>


      {others.length ? (
        <section className="mt-6" aria-labelledby="other-issues">
          <h2 id="other-issues" className="font-display text-h3 text-ink">
            Other issues on this listing
          </h2>
          <ul className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
            {others.map((o) => {
              const c = issueChip(o)
              return (
                <li key={o.id}>
                  <Link
                    to="/issues/$issueId"
                    params={{ issueId: o.id }}
                    search={{ listing: listingId }}
                    className="focus-ring tactile lift flex items-start justify-between gap-3 rounded-card border border-line bg-surface p-4 shadow-raised-sm hover:border-line-strong active:shadow-pressed"
                    data-testid="other-issue"
                  >
                    <span className="min-w-0">
                      <span className="block font-bold text-ink">{issueTitle(o)}</span>
                      <span className="line-clamp-2 text-small text-ink-2">{issueHeadline(o)}</span>
                    </span>
                    <StatusChip status={c.status}>{c.label}</StatusChip>
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}
    </Page>
  )
}

function IssueBody({ issue }: { issue: Issue }) {
  const chip = issueChip(issue)
  const marketplace = MARKETPLACE_LABEL[issue.marketplace]
  const fromMarketplace = issue.source === 'amazon_adapter' || issue.source === 'flipkart_adapter'
  const plain = issue.plain_message?.trim()
  const trail = issueFixTrail(issue)
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-display text-h3 text-ink">{issueTitle(issue)}</h2>
        <StatusChip status={chip.status}>{chip.label}</StatusChip>
      </div>
      {trail ? <FixTrail trail={trail} /> : null}
      {/* What it means first; the marketplace's own words stay one click away. */}
      {plain ? (
        <div>
          <div className="text-caption text-ink-3">{issuePlainLabel(issue)}</div>
          <p className="mt-1 text-body text-ink" data-testid="issue-plain">
            {plain}
          </p>
        </div>
      ) : (
        <p className="text-body text-ink">{issue.message}</p>
      )}
      {issue.suggestion && issue.status === 'open' ? (
        <div>
          <div className="text-caption text-ink-3">Suggested fix</div>
          <p className="mt-1 text-body text-ink">{issue.suggestion}</p>
        </div>
      ) : null}
      <KeyValues
        rows={[
          ['Affects', issueAffects(issue)],
          ['Class', issueClassLine(issue)],
          ['Next step', issueNextStep(issue)],
          ...(issue.value_submitted ? ([['Value sent', <code key="v" className="font-mono text-caption">{issue.value_submitted}</code>]] as [string, ReactNode][]) : []),
        ]}
      />
      <Collapsible className="rounded-control border border-line">
        <CollapsibleTrigger className="group focus-ring flex min-h-10 w-full items-center justify-between gap-2 rounded-control px-3 text-left text-small font-semibold text-ink-2 transition-colors duration-150 hover:bg-hover hover:text-ink">
          {fromMarketplace ? `What ${marketplace} said (unchanged)` : `What the ${SOURCE_LABEL[issue.source].toLowerCase()} said`}
          <Icon name="chev" size={16} className="shrink-0 transition-transform duration-150 group-data-[state=open]:rotate-180 motion-reduce:transition-none" />
        </CollapsibleTrigger>
        {/* Kept in the DOM while closed (hidden), so the raw text stays findable and testable. */}
        <CollapsibleContent forceMount className="px-3 pb-3 data-[state=closed]:hidden">
          <CodeBlock>
            <span data-testid="issue-raw">
              {[issue.marketplace_code ? `code ${issue.marketplace_code}` : null, `field: ${issue.field_path}`, issue.raw_message ?? issue.message]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </CodeBlock>
        </CollapsibleContent>
      </Collapsible>
      <Timeline label="History of this issue" className="mt-1" entries={issueTimeline(issue, (r) => RESOLUTION_LABEL[r])} />
    </>
  )
}

function BackLink() {
  return (
    <Link to="/inbox" className="focus-ring mb-3 inline-flex h-8 items-center gap-1 rounded-control text-small font-semibold text-ink-2 hover:text-ink">
      <Icon name="chev" size={16} className="rotate-90" />
      Inbox
    </Link>
  )
}

function IssueNotFound() {
  return (
    <Page>
      <BackLink />
      <NotFound
        title="Issue not found"
        description="It may belong to another brand, or it is older than the issues we can search. Open it from the Inbox or the product instead."
        backTo="/inbox"
        backLabel="Open Inbox"
      />
    </Page>
  )
}

function DetailSkeleton() {
  return (
    <Page>
      <Skeleton className="mb-3 h-5 w-16" />
      <div className="mb-5 flex items-center gap-3.5">
        <Skeleton className="size-14 rounded-2xl" />
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-48" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Skeleton className="h-72 rounded-card" />
        <Skeleton className="h-72 rounded-card" />
      </div>
      <span className="sr-only">Loading the issue…</span>
    </Page>
  )
}
