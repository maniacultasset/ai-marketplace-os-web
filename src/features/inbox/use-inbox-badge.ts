import { useHomeSummary } from '@/features/home-inbox/api'
import { BADGE_REFRESH_MS, useIssuesList, useTasksList } from './api'
import { badgeLabel } from './model'

/**
 * Sidebar count for the Inbox item: the Inbox's All count (open questions + issues no open
 * question stands for), from the first page of each open list (the same cache entries as the
 * /inbox default view). When either list has more, the exact count from GET /home/summary
 * (`inbox.open_items`, client pass 2 B16) replaces "50+", so the badge and the All tab agree.
 * Refetches every 2 min while the tab is visible, on focus, and whenever a mutation invalidates
 * issues/tasks. Call it only where the Inbox nav item is visible (role + capability live).
 */
export function useInboxBadgeLabel() {
  const issues = useIssuesList({}, { refetchInterval: BADGE_REFRESH_MS })
  const tasks = useTasksList('open', { refetchInterval: BADGE_REFRESH_MS })
  const more = !!issues.hasNextPage || !!tasks.hasNextPage
  const summary = useHomeSummary({ enabled: more })
  return badgeLabel(issues.data?.pages[0], tasks.data?.pages[0], more ? summary.data?.inbox : null)
}
