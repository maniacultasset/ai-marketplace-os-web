/**
 * /inbox (hi-fi 15 Inbox, 15b mobile): two panes. Left, the list of open questions (GET /tasks)
 * and issues (GET /issues); right, the selected item. Below 1024px one pane at a time: the list,
 * or the item with a back link (15b).
 *
 * Answering a question has no API yet (no POST /tasks/{id}/answer): the question, its reason and
 * the suggested answers are shown, and the answer controls are disabled with the reason. Issue
 * dismiss is real (POST /issues/{id}/dismiss with an Idempotency-Key).
 */
import { Link } from '@tanstack/react-router'
import { formatDistanceToNowStrict } from 'date-fns'
import { IconTile } from '@/components/la/icons'
import { Segmented } from '@/components/la/tabs'
import { ErrorState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useIssuesList, useTasksList } from '@/features/inbox/api'
import { ISSUE_STATUS_LABEL, MARKETPLACE_LABEL, TASK_KIND_LABEL, TASK_STATUS_LABEL } from '@/features/inbox/model'
import { cn } from '@/lib/utils'
import { useProductsById } from './api'
import { InboxDetail } from './inbox-detail'
import {
  fmtCount,
  inboxStatuses,
  issueTitle,
  itemKey,
  mergeInbox,
  visibleItems,
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
  const taskList = statuses.task === 'open' ? openTasks : tasks
  const issueList = statuses.issue === 'open' ? openIssues : issues

  const showsTasks = view !== 'issues'
  const showsIssues = view !== 'questions'
  const lists = [showsTasks && taskList, showsIssues && issueList].filter((x) => !!x)
  const pending = lists.some((l) => l.isPending)
  const error = lists.find((l) => l.error)?.error
  const items = visibleItems(view, mergeInbox(showsTasks ? taskList.rows : [], showsIssues ? issueList.rows : []))
  const selectedKey = search.item ?? (items[0] ? itemKey(items[0]) : undefined)

  const tCount = { n: openTasks.rows.length, more: !!openTasks.hasNextPage }
  const iCount = { n: openIssues.rows.length, more: !!openIssues.hasNextPage }
  const countsReady = !!openTasks.data && !!openIssues.data
  const openTotal = { n: tCount.n + iCount.n, more: tCount.more || iCount.more }
  const products = useProductsById(items.map((i) => (i.kind === 'task' ? i.task.product_id : null)))
  const filteredStatus = (view === 'questions' && statuses.task !== 'open') || (view === 'issues' && statuses.issue !== 'open')

  return (
    <div className="grid min-h-[calc(100svh-var(--topbar-h))] grid-cols-1 lg:grid-cols-[340px_minmax(0,1fr)]">
      <section
        aria-label="Inbox items"
        className={cn('flex min-w-0 flex-col gap-3 border-line bg-canvas px-4 py-5 lg:border-r', search.item && 'max-lg:hidden')}
        data-testid="inbox-list"
      >
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="font-display text-h2 text-ink">Inbox</h1>
          <span className="text-small text-ink-3" data-testid="inbox-open-count">
            {countsReady ? `${fmtCount(openTotal)} open` : null}
          </span>
        </div>
        <Segmented<InboxView>
          label="Show"
          className="w-full"
          value={view}
          onChange={(v) => onSearch({ view: v === 'all' ? undefined : v, item: undefined }, { replace: true })}
          options={[
            { value: 'all', label: 'All', count: countsReady ? fmtCount(openTotal) : undefined },
            { value: 'questions', label: 'Questions', count: openTasks.data ? fmtCount(tCount) : undefined },
            { value: 'issues', label: 'Issues', count: openIssues.data ? fmtCount(iCount) : undefined },
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
              <li key={i} className="flex gap-3 rounded-card border border-line bg-surface p-4 shadow-raised-sm">
                <Skeleton className="size-10 rounded-[11px]" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
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
                <ItemCard item={it} selected={itemKey(it) === selectedKey} search={search} product={it.kind === 'task' && it.task.product_id ? products.get(it.task.product_id) : undefined} />
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
      </section>

      <section aria-label="Selected item" className={cn('min-w-0 bg-canvas', !search.item && 'max-lg:hidden')} data-testid="inbox-detail">
        <InboxDetail
          selectedKey={selectedKey}
          items={items}
          pending={pending}
          search={search}
          products={products}
        />
      </section>
    </div>
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
}: {
  item: InboxItem
  selected: boolean
  search: InboxSearch
  product?: { sku: string; title: string }
}) {
  const title = item.kind === 'task' ? item.task.question : issueTitle(item.issue)
  const meta =
    item.kind === 'task'
      ? [product?.sku, TASK_KIND_LABEL[item.task.kind]].filter(Boolean).join(' · ')
      : `${MARKETPLACE_LABEL[item.issue.marketplace]} · ${item.issue.field_path}`
  return (
    <Link
      to="/inbox"
      search={{ ...search, item: itemKey(item) }}
      replace
      aria-current={selected ? 'true' : undefined}
      data-testid="inbox-item"
      data-item={itemKey(item)}
      className={cn(
        'focus-ring tactile block rounded-card border p-4',
        selected
          ? 'border-brand bg-brand-bg shadow-[var(--selected-ring),var(--shadow-inset-sm)]'
          : 'lift border-line bg-surface shadow-raised-sm hover:border-line-strong active:shadow-pressed',
      )}
    >
      <div className="flex items-center gap-3">
        <ItemTile item={item} />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 font-bold text-ink">{title}</p>
          <p className="truncate text-caption text-ink-2">{meta}</p>
        </div>
      </div>
      {selected ? (
        <p className="mt-2 text-caption text-ink-2">
          <time dateTime={item.at}>{formatDistanceToNowStrict(new Date(item.at), { addSuffix: true })}</time>
        </p>
      ) : null}
    </Link>
  )
}
