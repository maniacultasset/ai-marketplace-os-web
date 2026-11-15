import { useHomeSummary } from '@/features/home-inbox/api'
import { badgeFromCounts, inboxCounts } from './model'

/**
 * Sidebar count for the Inbox item: the Inbox's All count (open questions + issues no open
 * question stands for), from the backend's exact counts (`GET /home/summary` `inbox`), the same
 * cache entry the Inbox header and Home read, so the three always agree (B28). "99+" past 99,
 * hidden at zero and until the counts have loaded: never a number from a first page of 50.
 * Refetches every minute while the tab is visible (every 20 s while drafts are being written),
 * on focus, and whenever a mutation invalidates listings, issues or tasks.
 * Call it only where the Inbox nav item is visible (role + capability live).
 */
export function useInboxBadgeLabel() {
  const summary = useHomeSummary()
  return badgeFromCounts(inboxCounts(null, false, null, false, summary.data?.inbox))
}
