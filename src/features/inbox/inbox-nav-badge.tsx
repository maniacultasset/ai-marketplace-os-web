import { BADGE_REFRESH_MS, useIssuesList, useTasksList } from './api'
import { badgeLabel } from './model'

/**
 * Sidebar count for the Inbox item: open issues + open tasks on the first page of each (the same
 * cache entries as the /inbox default view), "50+" when either has more. Refetches every 2 min
 * while the tab is visible, on focus, and whenever a mutation invalidates issues/tasks.
 * Mounted only when the Inbox nav item is visible (role + capability live).
 */
export function InboxNavBadge() {
  const issues = useIssuesList({}, { refetchInterval: BADGE_REFRESH_MS })
  const tasks = useTasksList('open', { refetchInterval: BADGE_REFRESH_MS })
  const label = badgeLabel(issues.data?.pages[0], tasks.data?.pages[0])
  if (!label) return null
  // Hidden while zero (hi-fi p05). Attention pill: "needs you" items.
  return (
    <span
      data-testid="inbox-nav-badge"
      aria-label={`${label} open items`}
      className="ml-auto rounded-full border border-attention-line bg-attention-bg px-[7px] text-caption leading-[18px] font-bold text-attention"
    >
      {label}
    </span>
  )
}
