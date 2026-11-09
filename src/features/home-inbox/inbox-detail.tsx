/**
 * Inbox right pane (hi-fi 15) and the mobile task screen (15b): the selected question or issue.
 */
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { Banner } from '@/components/la/banner'
import { LaCard } from '@/components/la/cards'
import { Icon, IconTile } from '@/components/la/icons'
import { StatusChip } from '@/components/la/status-chip'
import { UnavailableButton } from '@/components/la/unavailable'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/states/error-state'
import { CategorySuggestionCard } from '@/features/assist/category-suggestion-card'
import { DismissIssueButton } from '@/features/inbox/dismiss-issue'
import { useProduct } from '@/features/products/api'
import { useListing } from '@/features/listings/api'
import { useListingResolution } from '@/features/listing-flow/api'
import { AnswerCard, AnswerResult, type AnswerOutcome } from '@/features/photo-facts/answer-card'
import { factKey, isBlockingTask, isPhotoQuestion, taskImageId } from '@/features/photo-facts/answer-spec'
import { fieldLabel } from '@/features/listing-flow/format'
import { SavedPhoto } from '@/components/la/saved-photo'
import { useRefreshProductViews } from '@/features/products/image-views'
import { factLabel } from '@/features/photo-facts/model'
import {
  canDismiss,
  isAccountReviewTask,
  issueHeadline,
  MARKETPLACE_LABEL,
  RESUME_LABEL,
  suggestionTexts,
  TASK_KIND_LABEL,
  TASK_STATUS_LABEL,
  type Issue,
  type Task,
} from '@/features/inbox/model'
import { useCan } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import {
  issueAffects,
  fixContext,
  issueChip,
  issueClassLine,
  issueFixTrail,
  issueCause,
  issueNextStep,
  issuePlainLabel,
  issueTitle,
  itemKey,
  parseItemKey,
  isIdentifierTask,
  rawMarketplaceText,
  sentenceCase,
  showSuggestion,
  positionLabel,
  type InboxItem,
  type InboxSearch,
} from './model'
import { AccountTask } from './account-task'
import type { ProductsById, ProductSummary } from './api'
import { Ago, CodeBlock, FixTrail, KeyValues } from './parts'

/** The sentence the brief asks for, shown next to the disabled answer controls. */
export const ANSWER_SOON = 'Answering from here is coming soon.'

export function InboxDetail({
  selectedKey,
  items,
  pending,
  error = false,
  search,
  products,
  issueProducts,
  openIssues = [],
  outcomes = {},
  onOutcome,
}: {
  selectedKey: string | undefined
  items: readonly InboxItem[]
  pending: boolean
  /** The list failed: the list pane says so once, and this pane stays blank (never "Nothing needs you"). */
  error?: boolean
  search: InboxSearch
  products: ProductsById
  /** Listing id to product id, for issues (IssueOut has listing_id only). */
  issueProducts?: ReadonlyMap<string, string>
  /** Open issues, to tell whether a question holds a listing back. */
  openIssues?: readonly Issue[]
  /** Questions answered (or found closed) on this screen, by task id: kept on screen. */
  outcomes?: Readonly<Record<string, AnswerOutcome>>
  onOutcome?: (o: AnswerOutcome) => void
}) {
  const item = selectedKey ? items.find((i) => itemKey(i) === selectedKey) : undefined
  const idx = item ? items.indexOf(item) : -1
  const backSearch = { ...search, item: undefined }

  return (
    <div className="flex flex-col">
      {/* 15b: mobile header with back link and position. */}
      <div className="flex h-[52px] items-center justify-between border-b border-line bg-surface px-4 lg:hidden">
        <Link to="/inbox" search={backSearch} className="focus-ring -ml-2 inline-flex h-11 items-center gap-1.5 rounded-control px-2 font-bold text-ink">
          <Icon name="chev" size={18} className="rotate-90" />
          Inbox
        </Link>
        {idx >= 0 ? (
          <span className="text-small text-ink-3">
            {idx + 1} of {items.length}
          </span>
        ) : null}
      </div>
      <div className="px-4 py-5 lg:px-12 lg:py-8">
        {pending ? (
          <DetailSkeleton />
        ) : error ? null : !item ? (
          <Missing selectedKey={selectedKey} hasItems={items.length > 0} />
        ) : item.kind === 'task' ? (
          <TaskDetail
            key={item.id}
            task={item.task}
            position={positionLabel(items, itemKey(item))}
            product={item.task.product_id ? products.map.get(item.task.product_id) : undefined}
            productPending={!!item.task.product_id && products.pending}
            remaining={items.length - idx - 1}
            linked={openIssues.filter((i) => i.human_task_id === item.task.id)}
            outcome={outcomes[item.task.id]}
            onOutcome={onOutcome}
            next={nextLink(items, idx, search, outcomes)}
          />
        ) : (
          <IssuePane
            key={item.id}
            issue={item.issue}
            position={positionLabel(items, itemKey(item))}
            product={productFor(products, issueProducts?.get(item.issue.listing_id) ?? undefined)}
          />
        )}
      </div>
    </div>
  )
}

function productFor(products: ProductsById, productId: string | null | undefined) {
  if (!productId) return undefined
  const p = products.map.get(productId)
  return p ? { ...p, id: productId } : undefined
}

const ADAPTER_SOURCES = new Set(['amazon_adapter', 'flipkart_adapter'])

/** "Next question" once a question is answered: the next item in the list that is still open. */
function nextLink(items: readonly InboxItem[], idx: number, search: InboxSearch, done: Readonly<Record<string, AnswerOutcome>>) {
  const next = items.slice(idx + 1).find((i) => i.kind === 'issue' || (i.task.status === 'open' && !done[i.task.id]))
  if (!next) return undefined
  return (
    <Button asChild data-testid="inbox-next">
      <Link to="/inbox" search={{ ...search, item: itemKey(next) }} replace>
        {next.kind === 'task' ? 'Next question' : 'Next item'}
        <Icon name="arrow" size={16} />
      </Link>
    </Button>
  )
}

function Missing({ selectedKey, hasItems }: { selectedKey: string | undefined; hasItems: boolean }) {
  const parsed = parseItemKey(selectedKey)
  if (!parsed)
    return (
      <div className="flex flex-col items-center py-16 text-center" data-testid="inbox-detail-empty">
        <IconTile icon={hasItems ? 'inbox' : 'check'} tone={hasItems ? 'brand' : 'ok'} size="lg" className="mb-4" />
        <p className="font-display text-h2 text-ink">{hasItems ? 'Pick an item' : 'Nothing needs you'}</p>
        <p className="mt-1 text-body text-ink-2">
          {hasItems ? 'Choose a question or an issue on the left.' : 'The agent asks here when a fact is missing, and marketplace problems land here too.'}
        </p>
      </div>
    )
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center py-12 text-center" data-testid="inbox-detail-missing">
      <IconTile icon="search" size="lg" className="mb-4" />
      <p className="font-display text-h2 text-ink">This item is not in the list</p>
      <p className="mt-1 text-body text-ink-2">
        It may be closed already, or further down than the loaded rows. Change the filter or load more on the left.
      </p>
      {parsed.kind === 'issue' ? (
        <Button asChild variant="secondary" className="mt-4">
          <Link to="/issues/$issueId" params={{ issueId: parsed.id }}>
            Look up this issue
          </Link>
        </Button>
      ) : null}
    </div>
  )
}

function TaskDetail({
  task,
  position,
  product,
  productPending,
  remaining,
  linked = [],
  outcome,
  onOutcome,
  next,
}: {
  task: Task
  position: string | null
  product?: ProductSummary
  /** The product is still on its first read: hold its line with a skeleton, never "One product". */
  productPending: boolean
  remaining: number
  /** Open issues linked to this question (human_task_id). */
  linked?: readonly Issue[]
  outcome?: AnswerOutcome
  onOutcome?: (o: AnswerOutcome) => void
  next?: ReactNode
}) {
  const suggestions = suggestionTexts(task.suggestions, 6)
  const shown = outcome?.task ?? task
  const open = shown.status === 'open' && outcome?.kind !== 'closed'
  const fact = factKey(task)
  const photo = isPhotoQuestion(task)
  const blocking = isBlockingTask(task, linked)
  const account = isAccountReviewTask(task)
  const identifier = isIdentifierTask(task)
  // An answer to a question behind a marketplace refusal goes into a new version by itself.
  const refusal = linked.some((i) => ADAPTER_SOURCES.has(i.source))
  // The photo the question is about. Its frame is held from the first paint (the id is on the task),
  // so the picture fades in once the product read lands, with nothing moving.
  const imageId = task.product_id ? taskImageId(task) : null
  return (
    <article className="flex max-w-[760px] flex-col gap-4" data-testid="task-detail" data-task-id={task.id}>
      <div>
        {position ? <span className="text-caption text-ink-3">{position}</span> : null}
        <div className="mt-0.5 flex flex-wrap items-start gap-x-3 gap-y-1">
          <h2 className="font-display text-[22px] leading-7 font-bold text-ink lg:text-[28px] lg:leading-[34px]" data-testid="task-question">
            {task.question}
          </h2>
          {!open && outcome?.kind !== 'closed' ? (
            <StatusChip status={shown.status === 'cancelled' ? 'not-listed' : 'live'}>{outcome ? 'Answered' : TASK_STATUS_LABEL[shown.status]}</StatusChip>
          ) : null}
        </div>
      </div>

      <LaCard emphasis="tint" pad="sm">
        <h3 className="text-[15px] font-bold text-ink">Why we are asking</h3>
        {imageId ? (
          <div className="mt-1 flex items-start gap-3">
            <TaskPhoto productId={task.product_id} src={product?.views?.get(imageId)} />
            <p className="min-w-0 flex-1 text-small text-ink" data-testid="task-reason">
              {task.reason}
            </p>
          </div>
        ) : (
          <p className="mt-1 text-small text-ink" data-testid="task-reason">
            {task.reason}
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2 text-small text-ink">
          <span className="rounded-md border border-line-strong bg-surface px-2 py-px text-caption font-semibold text-ink-2">Affects</span>
          {productPending && !product ? (
            <Skeleton className="h-4 w-48" data-testid="task-affects-loading" />
          ) : (
            <span>
              {/* "One product" only when the product read failed: the SKU and title are unknown. */}
              {[
                product ? `${product.sku} · ${product.title}` : task.product_id ? 'One product' : null,
                // An account task's target is an internal path (account.error_review): not shown.
                fact ? factLabel(fact) : account ? 'Your marketplace account' : fieldLabel(task.target_path),
                TASK_KIND_LABEL[task.kind],
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          )}
        </div>
        <p className="mt-2 text-caption text-ink-2" data-testid="task-resume">
          Asked <Ago iso={task.created_at} />.{' '}
          {photo && !blocking
            ? 'This doesn’t block your listing. Answer to improve it.'
            : account
              ? ''
              : task.kind === 'category_review'
                ? 'Drafts can start once the category is chosen.'
                : identifier
                ? 'This holds your listing back. Regenerate the listing after you add it.'
                : fact && refusal
                  ? 'Kuinn adds your answer to a new version and checks it. A teammate then approves the resend.'
                  : fact
                    ? `${photo ? 'This holds your listing back. ' : ''}Regenerate the listing after you answer to use it.`
                    : `The agent resumes from ${RESUME_LABEL[task.resume_from]} once this is answered.`}
        </p>
      </LaCard>

      {outcome ? (
        <AnswerResult outcome={outcome} next={next} />
      ) : open && fact && onOutcome ? (
        <>
          <AnswerCard task={task} onOutcome={onOutcome} />
          {remaining > 0 ? <p className="text-center text-small text-ink-3 lg:hidden">{remaining} more after this</p> : null}
        </>
      ) : open && task.kind === 'reconnect_account' ? (
        <ReconnectTask task={task} remaining={remaining} />
      ) : open && isAccountReviewTask(task) ? (
        <AccountTask task={task} kind={task.kind} remaining={remaining} />
      ) : open && task.kind === 'category_review' ? (
        <CategoryReviewTask task={task} remaining={remaining} />
      ) : open && identifier ? (
        <IdentifierTask task={task} remaining={remaining} />
      ) : open ? (
        <>
          <fieldset disabled className="flex flex-col gap-2" aria-describedby={`answer-soon-${task.id}`}>
            <legend className="sr-only">Suggested answers</legend>
            {suggestions.map((s) => (
              <label key={s} className="flex min-h-[52px] cursor-not-allowed items-center gap-3 rounded-tile border border-line-strong bg-surface px-3.5 py-3 text-body text-ink lg:min-h-[46px]">
                <input type="radio" name={`answer-${task.id}`} className="size-[18px] accent-[var(--brand)]" disabled />
                {s}
              </label>
            ))}
            <label className="flex min-h-[52px] cursor-not-allowed items-center gap-3 rounded-tile border border-line-strong bg-surface px-3.5 py-3 text-body text-ink-3 lg:min-h-[46px]">
              <input type="radio" name={`answer-${task.id}`} className="size-[18px]" disabled />
              {suggestions.length ? 'Something else: type the answer' : 'Type the answer'}
            </label>
          </fieldset>
          <Banner tone="neutral" icon="clock">
            <span id={`answer-soon-${task.id}`} data-testid="answer-soon">
              <b>{ANSWER_SOON}</b> Until then, open the product to fill this in.
            </span>
          </Banner>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <UnavailableButton reason={ANSWER_SOON} size="lg" className="max-sm:h-[52px] max-sm:w-full" data-testid="task-confirm">
              Confirm and continue
            </UnavailableButton>
          </div>
          <TaskLinks task={task} photoFixes={product?.photoFixes === true} />
          {remaining > 0 ? <p className="text-center text-small text-ink-3 lg:hidden">{remaining} more after this</p> : null}
        </>
      ) : (
        <>
          {suggestions.length ? (
            <p className="text-small text-ink-2">Suggested answers were: {suggestions.join(', ')}.</p>
          ) : null}
          {task.cancelled_reason ? <p className="text-small text-ink-2">Cancelled: {task.cancelled_reason}</p> : null}
          {task.answered_at ? (
            <p className="text-small text-ink-2">
              Answered <Ago iso={task.answered_at} />.
            </p>
          ) : null}
          <TaskLinks task={task} photoFixes={product?.photoFixes === true} />
        </>
      )}
    </article>
  )
}

/**
 * A missing barcode (facts.identifier). The tasks API cannot take this answer: the seller adds the
 * barcode, or marks it exempt, on the product, and the question closes once the listing is checked
 * again (backend human_tasks.cancel_if_closed).
 */
function IdentifierTask({ task, remaining }: { task: Task; remaining: number }) {
  const can = useCan()
  const variant = (task.target_path ?? '').startsWith('variants[')
  return (
    <>
      <Banner tone="attention" icon="info">
        <span data-testid="identifier-how">
          <b>Add the barcode (EAN, UPC or GTIN) on the product, or mark it GTIN exempt.</b> Amazon needs one to identify the
          product. This closes on its own once the listing is checked again.
        </span>
      </Banner>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        {can('product:import') ? (
          <Button asChild size="lg" className="max-sm:h-[52px] max-sm:w-full" data-testid="task-add-barcode">
            <Link to="/products/$productId" params={{ productId: task.product_id! }} search={variant ? { tab: 'variants' } : undefined}>
              Add the barcode
              <Icon name="arrow" size={16} />
            </Link>
          </Button>
        ) : (
          <UnavailableButton
            size="lg"
            className="max-sm:h-[52px] max-sm:w-full"
            reason="An operator or owner adds the barcode on the product."
            data-testid="task-add-barcode"
          >
            Add the barcode
          </UnavailableButton>
        )}
      </div>
      {remaining > 0 ? <p className="text-center text-small text-ink-3 lg:hidden">{remaining} more after this</p> : null}
    </>
  )
}

/**
 * The only task the backend creates today (repositories/human_tasks.py): reconnect a marketplace
 * account. It closes by itself when the same seller reconnects on Marketplaces, or is cancelled
 * when the account is revoked. Answering in the Inbox does nothing for it, so no answer controls.
 */
/**
 * SI14 `category_review`: Kuinn was not confident about a product's category. The seller confirms a
 * candidate or picks another right here; saving the category closes the task on the server.
 */
function CategoryReviewTask({ task, remaining }: { task: Task; remaining: number }) {
  const product = useProduct(task.product_id)
  return (
    <>
      {product.isPending ? (
        <Skeleton className="h-48 rounded-card" data-testid="category-review-loading" />
      ) : product.data && product.data.category === null && product.data.category_suggest_enabled ? (
        <CategorySuggestionCard product={product.data} />
      ) : product.data ? (
        <Banner tone="neutral" role="status">
          {product.data.category
            ? 'This product has a category now. Nothing else is needed here.'
            : 'Choose the category on the product page.'}
        </Banner>
      ) : product.error ? (
        <ErrorState error={product.error} compact onRetry={() => void product.refetch()} />
      ) : null}
      <TaskLinks task={task} photoFixes={false} />
      {remaining > 0 ? <p className="text-center text-small text-ink-3 lg:hidden">{remaining} more after this</p> : null}
    </>
  )
}

function ReconnectTask({ task, remaining }: { task: Task; remaining: number }) {
  const can = useCan()
  const allowed = can('marketplace:connect')
  return (
    <>
      <Banner tone="attention" icon="link">
        <span data-testid="reconnect-how">
          <b>Reconnect the account to close this.</b> Publishing to this marketplace waits until you do. The task closes on its
          own once the same seller account is connected again.
        </span>
      </Banner>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        {allowed ? (
          <Button asChild size="lg" className="max-sm:h-[52px] max-sm:w-full" data-testid="task-reconnect">
            <Link to="/marketplaces">
              <Icon name="link" size={16} />
              Reconnect on Marketplaces
            </Link>
          </Button>
        ) : (
          <UnavailableButton
            size="lg"
            className="max-sm:h-[52px] max-sm:w-full"
            reason="Only an owner or admin can reconnect a marketplace account. Ask one of them."
            data-testid="task-reconnect"
          >
            Reconnect on Marketplaces
          </UnavailableButton>
        )}
        {task.product_id ? (
          <Button asChild variant="secondary" size="lg" data-testid="task-open-product">
            <Link to="/products/$productId" params={{ productId: task.product_id }}>
              Open product
            </Link>
          </Button>
        ) : null}
      </div>
      {remaining > 0 ? <p className="text-center text-small text-ink-3 lg:hidden">{remaining} more after this</p> : null}
    </>
  )
}

/** The photo a question is about, from the product read's signed link (a failed link reads it again). */
function TaskPhoto({ productId, src }: { productId: string | null | undefined; src: string | undefined }) {
  const refresh = useRefreshProductViews(productId)
  return (
    <SavedPhoto
      src={src}
      alt="The product photo this question is about"
      onError={refresh}
      iconSize={20}
      testId="task-photo"
      className="size-[72px] rounded-tile border border-line bg-field text-ink-3 shadow-inset-sm"
    />
  )
}

function TaskLinks({ task, photoFixes }: { task: Task; photoFixes: boolean }) {
  if (!task.product_id && !task.marketplace_account_id) return null
  return (
    <div className="flex flex-wrap gap-2">
      {task.kind === 'reconnect_account' || task.marketplace_account_id ? (
        <Button asChild variant="secondary" data-testid="task-open-marketplaces">
          <Link to="/marketplaces">
            <Icon name={task.kind === 'reconnect_account' ? 'link' : 'store'} size={16} />
            {task.kind === 'reconnect_account' ? 'Reconnect on Marketplaces' : 'Open Marketplaces'}
          </Link>
        </Button>
      ) : null}
      {task.product_id && task.kind === 'image_replacement' && photoFixes ? (
        // The product's Media tab holds the photo fixes (white background, framing).
        <Button asChild variant="secondary" data-testid="task-open-photos">
          <Link to="/products/$productId" params={{ productId: task.product_id }} search={{ tab: 'media' }}>
            <Icon name="image" size={16} />
            Fix the photo
          </Link>
        </Button>
      ) : task.product_id ? (
        <Button asChild variant="secondary" data-testid="task-open-product">
          <Link to="/products/$productId" params={{ productId: task.product_id }}>
            Open product
          </Link>
        </Button>
      ) : null}
    </div>
  )
}

function IssuePane({ issue, position, product }: { issue: Issue; position: string | null; product?: ProductSummary & { id: string } }) {
  const can = useCan()
  // A closed Kuinn fix needs the listing's attempts to say "Fixed for you" (SI11 lanes).
  const closedFix = issue.status !== 'open' && !!issue.lane
  const listing = useListing(issue.listing_id, { enabled: closedFix })
  const resolution = useListingResolution(issue.listing_id, { enabled: closedFix && issue.marketplace === 'amazon' })
  const fix = fixContext(resolution.data, listing.data?.data)
  const chip = issueChip(issue, fix)
  const marketplace = MARKETPLACE_LABEL[issue.marketplace]
  const fromMarketplace = issue.source === 'amazon_adapter' || issue.source === 'flipkart_adapter'
  const plain = issue.plain_message?.trim()
  const trail = issueFixTrail(issue)
  return (
    <article className="flex max-w-[760px] flex-col gap-4" data-testid="issue-pane" data-issue-id={issue.id}>
      <div>
        {position ? <span className="text-caption text-ink-3">{position}</span> : null}
        <div className="mt-0.5 flex flex-wrap items-start justify-between gap-3">
          <h2 className="font-display text-[22px] leading-7 font-bold text-ink lg:text-[28px] lg:leading-[34px]">{issueTitle(issue)}</h2>
          <StatusChip status={chip.status}>{chip.label}</StatusChip>
        </div>
      </div>
      {trail ? <FixTrail trail={trail} /> : null}
      <LaCard className="flex flex-col gap-3">
        {/* The marketplace's own words stay verbatim; Kuinn's checks speak in plain language only. */}
        {fromMarketplace ? (
          <div>
            <div className="text-caption text-ink-3">What {marketplace} said (unchanged)</div>
            <CodeBlock>{rawMarketplaceText(issue)}</CodeBlock>
          </div>
        ) : !plain ? (
          <p className="text-body text-ink">{sentenceCase(issue.message)}</p>
        ) : null}
        {plain ? (
          <div>
            <div className="text-caption text-ink-3">{issuePlainLabel(issue)}</div>
            <p className="mt-1 text-body text-ink">{issueHeadline(issue)}</p>
          </div>
        ) : null}
        {/* A suggestion is work for a person: only while the issue is open. */}
        {showSuggestion(issue) ? (
          <div>
            <div className="text-caption text-ink-3">Suggested fix</div>
            <p className="mt-1 text-body text-ink">{issue.suggestion}</p>
          </div>
        ) : null}
        <KeyValues
          rows={[
            ['Affects', issueAffects(issue, product)],
            ['Kind', issueClassLine(issue)],
            ['Next step', issueNextStep(issue, fix)],
            ...(issueCause(issue) ? ([['Cause', issueCause(issue)]] as [string, ReactNode][]) : []),
            ['Seen', <span key="seen">{issue.occurrences > 1 ? `${issue.occurrences} times, last ` : ''}<Ago iso={issue.last_seen_at} /></span>],
          ]}
        />
        <div className={cn('flex flex-wrap items-center gap-2 pt-1')}>
          <Button asChild data-testid="issue-open-detail">
            <Link to="/issues/$issueId" params={{ issueId: issue.id }} search={{ listing: issue.listing_id }}>
              Open issue details
            </Link>
          </Button>
          {product ? (
            <Button asChild variant="secondary" data-testid="issue-open-product">
              <Link to="/products/$productId" params={{ productId: product.id }}>
                Open product
              </Link>
            </Button>
          ) : null}
          {canDismiss(issue, can('listing:approve')) ? <DismissIssueButton issue={issue} /> : null}
        </div>
      </LaCard>
    </article>
  )
}

function DetailSkeleton() {
  return (
    <div className="flex max-w-[760px] flex-col gap-4" aria-hidden>
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-28 w-full rounded-card" />
      <Skeleton className="h-12 w-full rounded-tile" />
      <Skeleton className="h-12 w-full rounded-tile" />
    </div>
  )
}
