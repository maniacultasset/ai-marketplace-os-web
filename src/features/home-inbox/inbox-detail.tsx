/**
 * Inbox right pane (hi-fi 15) and the mobile task screen (15b): the selected question or issue.
 */
import { Link } from '@tanstack/react-router'
import { Banner } from '@/components/la/banner'
import { LaCard } from '@/components/la/cards'
import { Icon, IconTile } from '@/components/la/icons'
import { StatusChip } from '@/components/la/status-chip'
import { UnavailableButton } from '@/components/la/unavailable'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { DismissIssueButton } from '@/features/inbox/dismiss-issue'
import {
  canDismiss,
  issueHeadline,
  MARKETPLACE_LABEL,
  RESUME_LABEL,
  SOURCE_LABEL,
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
  issueChip,
  issueClassLine,
  issueTitle,
  itemKey,
  parseItemKey,
  positionLabel,
  RETRY_CLASS_TEXT,
  type InboxItem,
  type InboxSearch,
} from './model'
import { Ago, CodeBlock, KeyValues } from './parts'

/** The sentence the brief asks for, shown next to the disabled answer controls. */
export const ANSWER_SOON = 'Answering from here is coming soon.'

export function InboxDetail({
  selectedKey,
  items,
  pending,
  search,
  products,
}: {
  selectedKey: string | undefined
  items: readonly InboxItem[]
  pending: boolean
  search: InboxSearch
  products: Map<string, { sku: string; title: string }>
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
        ) : !item ? (
          <Missing selectedKey={selectedKey} hasItems={items.length > 0} />
        ) : item.kind === 'task' ? (
          <TaskDetail
            key={item.id}
            task={item.task}
            position={positionLabel(items, itemKey(item))}
            product={item.task.product_id ? products.get(item.task.product_id) : undefined}
            remaining={items.length - idx - 1}
          />
        ) : (
          <IssuePane key={item.id} issue={item.issue} position={positionLabel(items, itemKey(item))} />
        )}
      </div>
    </div>
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
  remaining,
}: {
  task: Task
  position: string | null
  product?: { sku: string; title: string }
  remaining: number
}) {
  const suggestions = suggestionTexts(task.suggestions, 6)
  const open = task.status === 'open'
  return (
    <article className="flex max-w-[760px] flex-col gap-4" data-testid="task-detail" data-task-id={task.id}>
      <div>
        {position ? <span className="text-caption text-ink-3">{position}</span> : null}
        <div className="mt-0.5 flex flex-wrap items-start gap-x-3 gap-y-1">
          <h2 className="font-display text-[22px] leading-7 font-bold text-ink lg:text-[28px] lg:leading-[34px]" data-testid="task-question">
            {task.question}
          </h2>
          {!open ? <StatusChip status={task.status === 'cancelled' ? 'not-listed' : 'live'}>{TASK_STATUS_LABEL[task.status]}</StatusChip> : null}
        </div>
      </div>

      <LaCard emphasis="tint" pad="sm">
        <h3 className="text-[15px] font-bold text-ink">Why we are asking</h3>
        <p className="mt-1 text-small text-ink" data-testid="task-reason">
          {task.reason}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-small text-ink">
          <span className="rounded-md border border-line-strong bg-surface px-2 py-px text-caption font-semibold text-ink-2">Affects</span>
          <span>
            {[product ? `${product.sku} · ${product.title}` : task.product_id ? 'One product' : null, task.target_path, TASK_KIND_LABEL[task.kind]]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </div>
        <p className="mt-2 text-caption text-ink-2">
          Asked <Ago iso={task.created_at} />. The agent resumes from {RESUME_LABEL[task.resume_from]} once this is answered.
        </p>
      </LaCard>

      {open && task.kind === 'reconnect_account' ? (
        <ReconnectTask task={task} remaining={remaining} />
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
              <b>{ANSWER_SOON}</b> This question stays open until the agent can resolve it.
            </span>
          </Banner>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <UnavailableButton reason={ANSWER_SOON} size="lg" className="max-sm:h-[52px] max-sm:w-full" data-testid="task-confirm">
              Confirm and continue
            </UnavailableButton>
            <UnavailableButton reason="Skipping questions is not available yet." variant="ghost" size="lg">
              Skip for now
            </UnavailableButton>
            <UnavailableButton reason="Assigning a question to a teammate is not available yet." variant="ghost" size="lg">
              Ask a teammate
            </UnavailableButton>
          </div>
          <TaskLinks task={task} />
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
          <TaskLinks task={task} />
        </>
      )}
    </article>
  )
}

/**
 * The only task the backend creates today (repositories/human_tasks.py): reconnect a marketplace
 * account. It closes by itself when the same seller reconnects on Marketplaces, or is cancelled
 * when the account is revoked. Answering in the Inbox does nothing for it, so no answer controls.
 */
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

function TaskLinks({ task }: { task: Task }) {
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
      {task.product_id ? (
        <Button asChild variant="secondary" data-testid="task-open-product">
          <Link to="/products/$productId" params={{ productId: task.product_id }}>
            Open product
          </Link>
        </Button>
      ) : null}
    </div>
  )
}

function IssuePane({ issue, position }: { issue: Issue; position: string | null }) {
  const can = useCan()
  const chip = issueChip(issue)
  const marketplace = MARKETPLACE_LABEL[issue.marketplace]
  const fromMarketplace = issue.source === 'amazon_adapter' || issue.source === 'flipkart_adapter'
  const plain = issue.plain_message?.trim()
  return (
    <article className="flex max-w-[760px] flex-col gap-4" data-testid="issue-pane" data-issue-id={issue.id}>
      <div>
        {position ? <span className="text-caption text-ink-3">{position}</span> : null}
        <div className="mt-0.5 flex flex-wrap items-start justify-between gap-3">
          <h2 className="font-display text-[22px] leading-7 font-bold text-ink lg:text-[28px] lg:leading-[34px]">{issueTitle(issue)}</h2>
          <StatusChip status={chip.status}>{chip.label}</StatusChip>
        </div>
      </div>
      <LaCard className="flex flex-col gap-3">
        <div>
          <div className="text-caption text-ink-3">{fromMarketplace ? `What ${marketplace} said (unchanged)` : `What the ${SOURCE_LABEL[issue.source].toLowerCase()} said`}</div>
          <CodeBlock>
            {[issue.marketplace_code ? `code ${issue.marketplace_code}` : null, `field: ${issue.field_path}`, issue.raw_message ?? issue.message]
              .filter(Boolean)
              .join(' · ')}
          </CodeBlock>
        </div>
        {plain ? (
          <div>
            <div className="text-caption text-ink-3">In plain language</div>
            <p className="mt-1 text-body text-ink">{issueHeadline(issue)}</p>
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
            ['Seen', <span key="seen">{issue.occurrences > 1 ? `${issue.occurrences} times, last ` : ''}<Ago iso={issue.last_seen_at} /></span>],
          ]}
        />
        <div className={cn('flex flex-wrap items-center gap-2 pt-1')}>
          <Button asChild data-testid="issue-open-detail">
            <Link to="/issues/$issueId" params={{ issueId: issue.id }} search={{ listing: issue.listing_id }}>
              Open issue details
            </Link>
          </Button>
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
