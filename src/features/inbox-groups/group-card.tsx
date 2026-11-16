/**
 * Inbox list > one card for identical open items across products (G1): "34 products need a
 * manufacturer", "Blocks 68 listings". Opens the group in the right pane (`?item=group:<key>`).
 */
import { Link } from '@tanstack/react-router'
import { formatDistanceToNowStrict } from 'date-fns'
import { ItemTile } from '@/features/home-inbox/parts'
import { groupItemKey, groupMeta, groupTitle, type InboxGroup } from './model'
import type { InboxSearch } from '@/features/home-inbox/model'
import { useMediaQuery } from '@/lib/use-media-query'
import { cn } from '@/lib/utils'

export function GroupCard({
  group,
  selected,
  search,
  done,
}: {
  group: InboxGroup
  selected: boolean
  search: InboxSearch
  /** Answered on this screen: the line that says what was saved. */
  done?: string
}) {
  const twoPane = useMediaQuery('(min-width: 1024px)')
  const key = groupItemKey(group.key)
  const tile =
    group.item_kind === 'task' && group.sample_task
      ? ({ kind: 'task', task: group.sample_task } as const)
      : group.sample_issue
        ? ({ kind: 'issue', issue: group.sample_issue } as const)
        : group.task_kind
          ? ({ kind: 'task', task: { kind: group.task_kind } } as const)
          : null
  return (
    <Link
      to="/inbox"
      search={{ ...search, item: key }}
      replace={twoPane}
      aria-current={selected ? 'true' : undefined}
      data-testid="inbox-group"
      data-item={key}
      data-count={group.count}
      className={cn(
        'focus-ring tactile block rounded-card border p-4',
        selected
          ? 'border-brand bg-brand-bg shadow-selected-inset'
          : 'lift border-line bg-surface shadow-raised-sm hover:border-line-strong active:shadow-pressed',
      )}
    >
      <div className="flex items-center gap-3">
        {tile ? <ItemTile item={tile} /> : null}
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 font-bold text-ink" data-testid="inbox-group-title">
            {groupTitle(group)}
          </p>
          <div className="flex items-baseline justify-between gap-2">
            <p className="min-w-0 truncate text-caption text-ink-2" data-testid="inbox-group-meta">
              {done ?? groupMeta(group)}
            </p>
            <time dateTime={group.at} className="shrink-0 text-caption text-ink-3 tabular-nums">
              {formatDistanceToNowStrict(new Date(group.at), { addSuffix: true })}
            </time>
          </div>
        </div>
      </div>
    </Link>
  )
}
