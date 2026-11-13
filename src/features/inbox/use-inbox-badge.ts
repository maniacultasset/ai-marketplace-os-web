import { useHomeSummary } from '@/features/home-inbox/api'
import { BADGE_REFRESH_MS, useIssuesList, useTasksList } from './api'
import { badgeFromCounts, inboxCounts } from './model'

/**
 * Sidebar count for the Inbox item: the Inbox's All count (open questions + issues no open
 * question stands for), from the open lists' loaded rows (the same cache entries as the /inbox
 * default view) and the same "more pages" condition as the Inbox tabs (`hasNextPage`). While
 * either list has more, the exact count from GET /home/summary (`inbox.open_items`, client pass
 * 2 B16) replaces "50+", so the badge and the All tab always agree. Refetches every 2 min while
 * the tab is visible, on focus, and whenever a mutation invalidates issues/tasks.
 * Call it only where the Inbox nav item is visible (role + capability live).
 */
export function useInboxBadgeLabel() {
  const issues = useIssuesList({}, { refetchInterval: BADGE_REFRESH_MS })
  const tasks = useTasksList('open', { refetchInterval: BADGE_REFRESH_MS })
  const more = !!issues.hasNextPage || !!tasks.hasNextPage
  const summary = useHomeSummary({ enabled: more })
  if (!issues.data && !tasks.data) return null
  return badgeFromCounts(inboxCounts(tasks.rows, !!tasks.hasNextPage, issues.rows, !!issues.hasNextPage, more ? summary.data?.inbox : null))
}
