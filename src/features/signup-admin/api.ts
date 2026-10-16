/**
 * Sign-up endpoints (ADR-0019). Checked against the backend:
 *   POST /signup                                   routers/signup.py signup_create   → 202 SignupAccepted
 *   POST /signup/status                            routers/signup.py signup_status   → 200 SignupStatusOut | 401
 *   GET  /admin/signup-requests                    routers/admin.py  list (oldest first, cursor, ?status)
 *   POST /admin/signup-requests/{id}/approve       routers/admin.py  → SignupRequestOut (tenant_id set) | 404 | 409
 *   POST /admin/signup-requests/{id}/reject        routers/admin.py  → SignupRequestOut | 404 | 409
 * None of these take an Idempotency-Key (approve and reject are idempotent on the server; handover §7).
 * The two public ops never carry a bearer token and their 401 never ends a session (src/api/client.ts).
 */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, unwrap } from '@/api/client'
import { PAGE_SIZE, useCursorList } from '@/hooks/use-cursor-list'
import { useKeys } from '@/lib/query-keys'
import { decisionNeedsRefresh, tabToStatus, type QueueTab, type SignupRequest } from './format'
import type { SignupCreateBody, SignupStatusBody, SignupApproveBody, SignupRejectBody } from './schema'

export function useCreateSignup() {
  return useMutation({
    mutationFn: (body: SignupCreateBody) => unwrap(api.POST('/signup', { body })),
    meta: { toast: false },
  })
}

export function useCheckSignupStatus() {
  return useMutation({
    mutationFn: (body: SignupStatusBody) => unwrap(api.POST('/signup/status', { body })),
    meta: { toast: false },
  })
}

export function useSignupQueue(tab: QueueTab) {
  const keys = useKeys()
  const status = tabToStatus(tab)
  return useCursorList<SignupRequest>({
    queryKey: keys.signups.list(status),
    fetchPage: (cursor) =>
      unwrap(
        api.GET('/admin/signup-requests', {
          params: { query: { limit: PAGE_SIZE, ...(status ? { status } : {}), ...(cursor ? { cursor } : {}) } },
        }),
      ),
  })
}

/** After any decision (or a 404/409 that proves the row is stale) every queue tab is re-read. */
function useInvalidateQueue() {
  const qc = useQueryClient()
  const keys = useKeys()
  return () => qc.invalidateQueries({ queryKey: keys.signups.all() })
}

export function useApproveSignup() {
  const invalidate = useInvalidateQueue()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: SignupApproveBody }) =>
      unwrap(api.POST('/admin/signup-requests/{request_id}/approve', { params: { path: { request_id: id } }, body })),
    onSuccess: () => invalidate(),
    onError: (e) => {
      if (decisionNeedsRefresh(e)) void invalidate()
    },
    meta: { toast: false },
  })
}

export function useRejectSignup() {
  const invalidate = useInvalidateQueue()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: SignupRejectBody }) =>
      unwrap(api.POST('/admin/signup-requests/{request_id}/reject', { params: { path: { request_id: id } }, body })),
    onSuccess: () => invalidate(),
    onError: (e) => {
      if (decisionNeedsRefresh(e)) void invalidate()
    },
    meta: { toast: false },
  })
}
