import { BADGE_REFRESH_MS, useIssuesList, useTasksList } from './api'
import { badgeLabel } from './model'

/**
 * Sidebar count for the Inbox item: open issues + open tasks on the first page of each (the same
 * cache entries as the /inbox default view), "50+" when either has more. Refetches every 2 min
 * while the tab is visible, on focus, and whenever a mutation invalidates issues/tasks.
 * Call it only where the Inbox nav item is visible (role + capability live).
 */
export function useInboxBadgeLabel() {
  const issues = useIssuesList({}, { refetchInterval: BADGE_REFRESH_MS })
  const tasks = useTasksList('open', { refetchInterval: BADGE_REFRESH_MS })
  return badgeLabel(issues.data?.pages[0], tasks.data?.pages[0])
}
