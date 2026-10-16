/**
 * Inbox data. Checked against the backend:
 *   GET  /issues                    routers/issues.py issues_list   (tenant:read; status default 'open')
 *   POST /issues/{issue_id}/dismiss routers/issues.py issues_dismiss (listing:approve; Idempotency-Key;
 *                                   409 INVALID_STATUS_TRANSITION unless an open warning; 404 unknown id)
 *   GET  /tasks                     routers/tasks.py tasks_list     (tenant:read; status default 'open')
 */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, unwrap } from '@/api/client'
import { isApiError } from '@/api/errors'
import { idempotencyHeader, useIntentKey } from '@/api/idempotency'
import { PAGE_SIZE, useCursorList } from '@/hooks/use-cursor-list'
import { useKeys, type IssuesFilters, type TaskStatus } from '@/lib/query-keys'
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
