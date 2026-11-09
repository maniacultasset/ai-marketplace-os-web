/**
 * /inbox (hi-fi 15 Inbox, 15b mobile): two panes. Left, the list of open questions (GET /tasks)
 * and issues (GET /issues); right, the selected item. Below 1024px one pane at a time: the list,
 * or the item with a back link (15b).
 *
 * Fact questions (missing or conflicting facts, e.g. from the photo check) are answered here with
 * POST /tasks/{id}/answer; other question kinds keep their answer controls disabled with the reason.
 * Issue dismiss is real (POST /issues/{id}/dismiss with an Idempotency-Key).
 */
import { Link } from '@tanstack/react-router'
import { formatDistanceToNowStrict } from 'date-fns'
import { useCallback, useState } from 'react'
import { ScrollPane, SplitLayout } from '@/components/app/split-layout'
import { IconTile } from '@/components/la/icons'
import { Segmented } from '@/components/la/tabs'
import { ErrorState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useIssuesList, useTasksList } from '@/features/inbox/api'
import { ISSUE_STATUS_LABEL, MARKETPLACE_LABEL, TASK_STATUS_LABEL, type Issue } from '@/features/inbox/model'
import { fieldLabel } from '@/features/listing-flow/format'
import type { AnswerOutcome } from '@/features/photo-facts/answer-card'
import { useMediaQuery } from '@/lib/use-media-query'
import { cn } from '@/lib/utils'
import { useListingProductIds, useProductsById } from './api'
import { InboxDetail } from './inbox-detail'
import {
  fmtCount,
  inboxStatuses,
  issueChip,
  issueLane,
  issueTitle,
  itemKey,
  mergeInbox,
  standaloneIssues,
  taskMeta,
  visibleItems,
  withAiRewrites,
  type InboxItem,
  type InboxSearch,
  type InboxView,
} from './model'
import { ItemTile } from './parts'

export type OnInboxSearch = (patch: Partial<InboxSearch>, opts?: { replace?: boolean }) => void

export function InboxPage({ search, onSearch }: { search: InboxSearch; onSearch: OnInboxSearch }) {
  const view: InboxView = search.view ?? 'all'
  const statuses = inboxStatuses(search)
  // Open lists always load: they feed the counts (and share the sidebar badge's cache entries).
  const openTasks = useTasksList('open')
  const openIssues = useIssuesList({})
  const tasks = useTasksList(statuses.task, { enabled: statuses.task !== 'open' })
  const issues = useIssuesList({ status: statuses.issue }, { enabled: statuses.issue !== 'open' })
  // "Auto-fixed" also lists AI rewrites: they can only close as resolved (ai_correction), and the
  // API has no resolution filter, so they are picked from the resolved list.
  const withRewrites = statuses.issue === 'auto_fixed'
  const rewrites = useIssuesList({ status: 'resolved' }, { enabled: withRewrites })
  const taskList = statuses.task === 'open' ? openTasks : tasks
  const issueList = statuses.issue === 'open' ? openIssues : issues
  const issueRows = withRewrites ? withAiRewrites(issueList.rows, rewrites.rows) : issueList.rows

  const showsTasks = view !== 'issues'
  const showsIssues = view !== 'questions'
  const lists = [showsTasks && taskList, showsIssues && issueList, showsIssues && withRewrites && rewrites].filter((x) => !!x)
  const listsPending = lists.some((l) => l.isPending)
  const error = lists.find((l) => l.error)?.error
  // A question answered here stays on screen with its result after the open list refreshes
  // without it, so the seller sees what was saved and can move on.
  const [outcomes, setOutcomes] = useState<Record<string, AnswerOutcome>>({})
  const onOutcome = useCallback((o: AnswerOutcome) => setOutcomes((m) => ({ ...m, [o.task.id]: o })), [])
  const kept = statuses.task === 'open' ? Object.values(outcomes).filter((o) => !taskList.rows.some((t) => t.id === o.task.id)) : []
  const taskRows = [...taskList.rows, ...kept.map((o) => o.task)]
  const items = visibleItems(view, mergeInbox(showsTasks ? taskRows : [], showsIssues ? issueRows : [], openIssues.rows))
  const selectedKey = search.item ?? (items[0] ? itemKey(items[0]) : undefined)

  const tCount = { n: openTasks.rows.length, more: !!openTasks.hasNextPage }
  const iCount = { n: openIssues.rows.length, more: !!openIssues.hasNextPage }
  const countsReady = !!openTasks.data && !!openIssues.data
  // An issue linked to an open question is the same thing to do: All counts it once.
  const openTotal = { n: tCount.n + standaloneIssues(openIssues.rows, openTasks.rows).length, more: tCount.more || iCount.more }
  // An issue names its product too: its listing says which (IssueOut has listing_id only).
  const issueProducts = useListingProductIds(items.map((i) => (i.kind === 'issue' ? i.issue.listing_id : null)))
  const productOf = (i: InboxItem) => (i.kind === 'task' ? i.task.product_id : issueProducts.map.get(i.issue.listing_id))
  const products = useProductsById(items.map(productOf))
  // A card paints once, title and meta together: its product (SKU) is part of the meta.
  const pending = listsPending || issueProducts.pending || products.pending
  const filteredStatus = (view === 'questions' && statuses.task !== 'open') || (view === 'issues' && statuses.issue !== 'open')

  return (
    // Each side scrolls on its own: picking a row keeps the list where it is, and the detail starts
    // at its top for each new item.
    <SplitLayout className="min-h-[calc(100svh-var(--topbar-h))] lg:min-h-0 lg:grid-cols-[340px_minmax(0,1fr)]">
      <ScrollPane
        as="section"
        scrollId="inbox-list"
        aria-label="Inbox items"
        className={cn('flex min-w-0 flex-col gap-3 border-line bg-canvas px-4 py-5 lg:border-r', search.item && 'max-lg:hidden')}
        data-testid="inbox-list"
      >
        <h1 className="font-display text-h2 text-ink">
          Inbox
          {/* The count shows once, on the All segment; this copy is for screen readers only. */}
          <span className="sr-only" data-testid="inbox-open-count">
            {countsReady ? `${fmtCount(openTotal)} open` : null}
          </span>
        </h1>
        <Segmented<InboxView>
          label="Show"
          className="w-full"
          value={view}
          onChange={(v) => onSearch({ view: v === 'all' ? undefined : v, item: undefined }, { replace: true })}
          options={[
            { value: 'all', label: 'All', count: countsReady ? fmtCount(openTotal) : undefined },
            // All three counts appear together, once both open lists have answered.
            { value: 'questions', label: 'Questions', count: countsReady ? fmtCount(tCount) : undefined },
            { value: 'issues', label: 'Issues', count: countsReady ? fmtCount(iCount) : undefined },
          ]}
        />
        {view !== 'all' ? <StatusPicker view={view} search={search} onSearch={onSearch} /> : null}

        <ul className="flex flex-col gap-2.5" aria-busy={pending || undefined}>
          {error ? (
            <li>
              <ErrorState compact error={error} title="Couldn't load your Inbox" onRetry={() => lists.forEach((l) => void l.refetch())} />
            </li>
          ) : pending ? (
            Array.from({ length: 4 }, (_, i) => (
              <li key={i} className="flex items-center gap-3 rounded-card border border-line bg-surface p-4 shadow-raised-sm">
                <Skeleton className="size-9 shrink-0 rounded-tile" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-3/4" />
                  <div className="flex justify-between gap-2">
                    <Skeleton className="h-3 w-1/2" />
                    <Skeleton className="h-3 w-12" />
                  </div>
                </div>
              </li>
            ))
          ) : items.length === 0 ? (
            <li className="flex flex-col items-center rounded-card border border-dashed border-line-strong px-4 py-8 text-center" data-testid="inbox-empty">
              <IconTile icon={filteredStatus ? 'filter' : 'check'} tone={filteredStatus ? 'neutral' : 'ok'} size="lg" className="mb-3" />
              <p className="font-semibold text-ink">{filteredStatus ? 'Nothing here' : 'Nothing needs you'}</p>
              <p className="mt-1 text-small text-ink-2">
                {filteredStatus
                  ? 'No items with this status.'
                  : 'When the agent needs a fact or a marketplace refuses something, it appears here.'}
              </p>
            </li>
          ) : (
            items.map((it) => (
              <li key={itemKey(it)}>
                <ItemCard
                  item={it}
                  selected={itemKey(it) === selectedKey}
                  search={search}
                  product={productOf(it) ? products.map.get(productOf(it)!) : undefined}
                  linked={openIssues.rows}
                  answered={it.kind === 'task' && outcomes[it.task.id] ? outcomes[it.task.id]!.kind : undefined}
                />
              </li>
            ))
          )}
        </ul>
        {lists.some((l) => l.hasNextPage) ? (
          <Button
            variant="secondary"
            size="sm"
            className="self-start"
            disabled={lists.some((l) => l.isFetchingNextPage)}
            onClick={() => lists.forEach((l) => l.hasNextPage && void l.fetchNextPage())}
          >
            {lists.some((l) => l.isFetchingNextPage) ? 'Loading…' : 'Load more'}
          </Button>
        ) : null}
      </ScrollPane>

      <ScrollPane
        as="section"
        scrollId="inbox-detail"
        resetOnNavigate
        aria-label="Selected item"
        className={cn('bg-canvas', !search.item && 'max-lg:hidden')}
        data-testid="inbox-detail"
      >
        <InboxDetail
          selectedKey={selectedKey}
          items={items}
          pending={listsPending}
          error={!!error}
          search={search}
          products={products}
          issueProducts={issueProducts.map}
          openIssues={openIssues.rows}
          outcomes={outcomes}
          onOutcome={onOutcome}
        />
      </ScrollPane>
    </SplitLayout>
  )
}

function StatusPicker({ view, search, onSearch }: { view: 'questions' | 'issues'; search: InboxSearch; onSearch: OnInboxSearch }) {
  if (view === 'questions')
    return (
      <Select value={search.tasks ?? 'open'} onValueChange={(v) => onSearch({ tasks: v === 'open' ? undefined : (v as InboxSearch['tasks']), item: undefined }, { replace: true })}>
        <SelectTrigger size="sm" aria-label="Question status" data-testid="inbox-task-status" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(TASK_STATUS_LABEL) as (keyof typeof TASK_STATUS_LABEL)[]).map((s) => (
            <SelectItem key={s} value={s}>
              {TASK_STATUS_LABEL[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  return (
    <Select value={search.status ?? 'open'} onValueChange={(v) => onSearch({ status: v === 'open' ? undefined : (v as InboxSearch['status']), item: undefined }, { replace: true })}>
      <SelectTrigger size="sm" aria-label="Issue status" data-testid="inbox-issue-status" className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {(Object.keys(ISSUE_STATUS_LABEL) as (keyof typeof ISSUE_STATUS_LABEL)[]).map((s) => (
          <SelectItem key={s} value={s}>
            {ISSUE_STATUS_LABEL[s]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function ItemCard({
  item,
  selected,
  search,
  product,
  linked,
  answered,
}: {
  item: InboxItem
  selected: boolean
  search: InboxSearch
  product?: { sku: string; title: string }
  /** Open issues: a photo question with an open error behind it holds a listing back. */
  linked: readonly Issue[]
  /** Answered (or found closed) on this screen. */
  answered?: AnswerOutcome['kind']
}) {
  const title = item.kind === 'task' ? item.task.question : issueTitle(item.issue)
  const meta =
    item.kind === 'task'
      ? [product?.sku, answered === 'answered' ? 'Answered' : answered === 'closed' ? 'Closed' : taskMeta(item.task, linked)].filter(Boolean).join(' · ')
      : // A closed issue says so in words, first so the line's truncation never hides it.
        [
          product?.sku,
          item.issue.status === 'open' ? (issueLane(item.issue)?.chip.label ?? null) : issueChip(item.issue).label,
          MARKETPLACE_LABEL[item.issue.marketplace],
          fieldLabel(item.issue.field_path),
        ]
          .filter(Boolean)
          .join(' · ')
  // Two panes (lg+): a click only changes the selection. One pane: opening an item is a new
  // screen, so Back returns to the list.
  const twoPane = useMediaQuery('(min-width: 1024px)')
  return (
    <Link
      to="/inbox"
      search={{ ...search, item: itemKey(item) }}
      replace={twoPane}
      aria-current={selected ? 'true' : undefined}
      data-testid="inbox-item"
      data-item={itemKey(item)}
      className={cn(
        'focus-ring tactile block rounded-card border p-4',
        selected
          ? 'border-brand bg-brand-bg shadow-selected-inset'
          : 'lift border-line bg-surface shadow-raised-sm hover:border-line-strong active:shadow-pressed',
      )}
    >
      <div className="flex items-center gap-3">
        <ItemTile item={item} />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 font-bold text-ink">{title}</p>
          {/* Time on every card, so a card keeps its height when it is selected. */}
          <div className="flex items-baseline justify-between gap-2">
            <p className="min-w-0 truncate text-caption text-ink-2">{meta}</p>
            <time dateTime={item.at} className="shrink-0 text-caption text-ink-3 tabular-nums">
              {formatDistanceToNowStrict(new Date(item.at), { addSuffix: true })}
            </time>
          </div>
        </div>
      </div>
    </Link>
  )
}

