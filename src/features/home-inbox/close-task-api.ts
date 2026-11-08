/**
 * SI9: close an account task (`marketplace_error_review`, `permission_decision`).
 *
 *   POST /tasks/{task_id}/close  product:import, Idempotency-Key
 *        {resolution: done | dismissed, note?}  200 the task; the same close again is 200;
 *        another close of a closed task 409 INVALID_STATUS_TRANSITION; another task kind 422
 *
 * Offered only by a backend that has it (its TaskOut carries `resolution`).
 */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef } from 'react'
import { api, unwrap } from '@/api/client'
import { describeError, isApiError } from '@/api/errors'
import { idempotencyHeader, useIntentKey } from '@/api/idempotency'
import { useKeys } from '@/lib/query-keys'

export type Resolution = 'done' | 'dismissed'

export const supportsClose = (task: object) => 'resolution' in task

/** One sentence for a refused close. */
export function closeRefusal(e: unknown): string {
  if (!isApiError(e)) return describeError(e)
  if (e.status === 409) return 'This was already closed. The Inbox is up to date now.'
  if (e.status === 422) return 'This kind of task closes on its own once it is answered.'
  if (e.status === 403) return 'Your role can’t close tasks. An owner or operator can.'
  return describeError(e)
}

export function useCloseTask(taskId: string) {
  const qc = useQueryClient()
  const keys = useKeys()
  const intent = useIntentKey()
  const sent = useRef<Resolution | null>(null)
  return useMutation({
    meta: { toast: false },
    mutationFn: (resolution: Resolution) => {
      if (sent.current !== resolution) intent.reset()
      sent.current = resolution
      return unwrap(
        api.POST('/tasks/{task_id}/close', {
          params: { path: { task_id: taskId }, header: idempotencyHeader(intent.get()) },
          body: { resolution },
        }),
      )
    },
    onSuccess: () => intent.reset(),
    onError: (err) => {
      if (!isApiError(err) || err.status !== 0) intent.reset()
    },
    onSettled: () => qc.invalidateQueries({ queryKey: keys.tasks.all() }),
  })
}
