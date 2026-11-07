/**
 * Inbox data. Checked against the backend:
 *   GET  /issues                    routers/issues.py issues_list   (tenant:read; status default 'open')
 *   POST /issues/{issue_id}/dismiss routers/issues.py issues_dismiss (listing:approve; Idempotency-Key;
 *                                   409 INVALID_STATUS_TRANSITION unless an open warning; 404 unknown id)
 *   GET  /tasks                     routers/tasks.py tasks_list     (tenant:read; status default 'open')
 */
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, unwrap } from '@/api/client'
import { isApiError } from '@/api/errors'
import { idempotencyHeader, useIntentKey } from '@/api/idempotency'
import { PAGE_SIZE, useCursorList } from '@/hooks/use-cursor-list'
import { useKeys, type IssuesFilters, type QueryKeys, type TaskStatus } from '@/lib/query-keys'
import type { Issue, Task } from './model'

/** Sidebar badge refresh: cheap first-page refetch while the tab is visible. */
export const BADGE_REFRESH_MS = 120_000

export function fetchIssuesPage(f: IssuesFilters, cursor: string | undefined) {
  return unwrap(
    api.GET('/issues', {
      params: {
        query: {
          limit: PAGE_SIZE,
          cursor,
          status: f.status ?? 'open',
          listing_id: f.listingId,
          source: f.source,
          error_code: f.errorCode,
          marketplace: f.marketplace,
        },
      },
    }),
  )
}

export function fetchTasksPage(status: TaskStatus, cursor: string | undefined) {
  return unwrap(api.GET('/tasks', { params: { query: { limit: PAGE_SIZE, cursor, status } } }))
}

export function useIssuesList(f: IssuesFilters, opts: { enabled?: boolean; refetchInterval?: number | false } = {}) {
  const keys = useKeys()
  return useCursorList<Issue>({
    queryKey: keys.issues.list(f),
    fetchPage: (cursor) => fetchIssuesPage(f, cursor),
    enabled: opts.enabled,
    refetchInterval: opts.refetchInterval,
  })
}

export function useTasksList(status: TaskStatus, opts: { enabled?: boolean; refetchInterval?: number | false } = {}) {
  const keys = useKeys()
  return useCursorList<Task>({
    queryKey: keys.tasks.list(status),
    fetchPage: (cursor) => fetchTasksPage(status, cursor),
    enabled: opts.enabled,
    refetchInterval: opts.refetchInterval,
  })
}

/** Largest page GET /issues allows, and how many pages one listing's fix trail may take. */
const TRAIL_PAGE = 200
const TRAIL_PAGES = 3

/**
 * Every auto-fixed issue of one listing (GET /issues?status=auto_fixed&listing_id=…), walked up to
 * 600 rows. Under `issues.all()`, so a regenerate, edit or re-check refreshes it with the rest.
 */
export function autoFixedQuery(keys: QueryKeys, listingId: string) {
  return queryOptions({
    queryKey: [...keys.issues.list({ status: 'auto_fixed', listingId }), 'all'] as const,
    staleTime: 20_000,
    queryFn: async (): Promise<Issue[]> => {
      const rows: Issue[] = []
      let cursor: string | undefined
      for (let i = 0; i < TRAIL_PAGES; i++) {
        const page = await unwrap(
          api.GET('/issues', { params: { query: { status: 'auto_fixed', listing_id: listingId, limit: TRAIL_PAGE, cursor } } }),
        )
        rows.push(...page.data)
        if (!page.page.has_more || !page.page.next_cursor) break
        cursor = page.page.next_cursor
      }
      return rows
    },
  })
}

export function useAutoFixedIssues(listingId: string | undefined) {
  const keys = useKeys()
  return useQuery({ ...autoFixedQuery(keys, listingId ?? ''), enabled: !!listingId })
}

/**
 * Dismiss (accept) one open warning. One Idempotency-Key per issue intent: a network retry of the
 * same click replays the stored answer. Errors are handled by the caller (`meta.toast: false`).
 */
export function useDismissIssue(issue: Pick<Issue, 'id' | 'listing_id'>) {
  const keys = useKeys()
  const qc = useQueryClient()
  const intent = useIntentKey()
  return useMutation({
    meta: { toast: false },
    mutationFn: () =>
      unwrap(
        api.POST('/issues/{issue_id}/dismiss', {
          params: { path: { issue_id: issue.id }, header: idempotencyHeader(intent.get()) },
        }),
      ),
    onSuccess: () => intent.reset(),
    onError: (err) => {
      // A 409 means the state moved (or the key was reused): the next click is a new intent.
      if (isApiError(err) && err.status === 409) intent.reset()
    },
    onSettled: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: keys.issues.all() }),
        qc.invalidateQueries({ queryKey: keys.listings.detail(issue.listing_id) }),
      ]),
  })
}
