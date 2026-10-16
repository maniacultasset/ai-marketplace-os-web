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
 *               shown disabled with the reason; "Open product" is the real way to change content
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
import { Skeleton } from '@/components/ui/skeleton'
import { NOT_YET, UnavailableButton } from '@/components/la/unavailable'
import { DismissIssueButton } from '@/features/inbox/dismiss-issue'
import { canDismiss, issueHeadline, MARKETPLACE_LABEL, RESOLUTION_LABEL, SOURCE_LABEL, type Issue } from '@/features/inbox/model'
import { useListing, useListingSubmissions } from '@/features/listings/api'
import { useProduct } from '@/features/products/api'
import { listingChip } from '@/lib/listing-chip'
import { useCan } from '@/lib/permissions'
import { useFindIssueListing, useListingIssues } from './api'
import {
  attemptsTimeline,
  issueAffects,
  issueChip,
  issueClassLine,
  issueTimeline,
  isCategoryIssue,
  issueTitle,
  plural,
  retriesStopped,
  RETRY_CLASS_TEXT,
} from './model'
import { CodeBlock, KeyValues, Timeline } from './parts'

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
  const others = issues.data.filter((i) => i.id !== issueId)
  const openCount = issues.data.filter((i) => i.status === 'open').length
  const stopped = retriesStopped(submissions.rows, issue)
  const marketplace = MARKETPLACE_LABEL[issue.marketplace]
  const chip = l ? listingChip(l) : null

  return (
    <Page>
      <BackLink />
      <header className="flex flex-col gap-3 pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-center gap-3.5">
          <span aria-hidden className="inline-flex size-14 shrink-0 items-center justify-center rounded-card border border-line bg-subtle text-ink-2">
            <Icon name="box" size={24} />
          </span>
          <div className="min-w-0">
            <h1 className="truncate font-display text-h1 text-ink" data-testid="issue-product-title">
              {product.data?.title ?? (product.isPending && l ? <Skeleton className="h-8 w-56" /> : `${marketplace} listing`)}
            </h1>
            <p className="text-body text-ink-2">
              {[product.data?.sku, marketplace, `${openCount} open ${plural(openCount, 'issue')}`].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>
        {chip ? (
          <StatusChip status={chip.status} className="self-start">
            {chip.label}
          </StatusChip>
        ) : null}
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <LaCard className="flex flex-col gap-3" data-testid="issue-card" data-issue-id={issue.id}>
          <IssueBody issue={issue} />
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {issue.status === 'open' && isCategoryIssue(issue) ? (
              <UnavailableButton reason={NOT_YET.chooseCategory} data-testid="issue-choose-category">
                Choose category
              </UnavailableButton>
            ) : null}
            {l ? (
              <Button
                asChild
                variant={issue.status === 'open' && isCategoryIssue(issue) ? 'secondary' : 'primary'}
                data-testid="issue-open-product"
              >
                <Link to="/products/$productId" params={{ productId: l.product_id }}>
                  Open product
                </Link>
              </Button>
            ) : null}
            {canDismiss(issue, can('listing:approve')) ? <DismissIssueButton issue={issue} /> : null}
            <UnavailableButton variant="ghost" reason={NOT_YET.askSupport} data-testid="issue-ask-support">
              Ask support
            </UnavailableButton>
          </div>
        </LaCard>

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
      </div>

      {stopped ? (
        <Banner tone="attention" className="mt-4" role="status">
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
                    className="focus-ring flex items-start justify-between gap-3 rounded-card border border-line bg-surface p-4 shadow-sm hover:border-line-strong"
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
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-display text-h3 text-ink">{issueTitle(issue)}</h2>
        <StatusChip status={chip.status}>{chip.label}</StatusChip>
      </div>
      <div>
        <div className="text-caption text-ink-3">
          {fromMarketplace ? `What ${marketplace} said (unchanged)` : `What the ${SOURCE_LABEL[issue.source].toLowerCase()} said`}
        </div>
        <CodeBlock>
          <span data-testid="issue-raw">
            {[issue.marketplace_code ? `code ${issue.marketplace_code}` : null, `field: ${issue.field_path}`, issue.raw_message ?? issue.message]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </CodeBlock>
      </div>
      {plain ? (
        <div>
          <div className="text-caption text-ink-3">In plain language</div>
          <p className="mt-1 text-body text-ink" data-testid="issue-plain">
            {plain}
          </p>
        </div>
      ) : null}
      {issue.suggestion ? (
        <div>
          <div className="text-caption text-ink-3">Suggested fix</div>
          <p className="mt-1 text-body text-ink">{issue.suggestion}</p>
        </div>
      ) : null}
      <KeyValues
        rows={[
          ['Affects', issueAffects(issue)],
          ['Class', issueClassLine(issue)],
          ['Next step', RETRY_CLASS_TEXT[issue.retry_class]],
          ...(issue.value_submitted ? ([['Value sent', <code key="v" className="font-mono text-[12px]">{issue.value_submitted}</code>]] as [string, ReactNode][]) : []),
        ]}
      />
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
      <div className="flex items-center gap-3.5 pb-5">
        <Skeleton className="size-14 rounded-card" />
        <div className="space-y-2">
          <Skeleton className="h-7 w-64" />
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
