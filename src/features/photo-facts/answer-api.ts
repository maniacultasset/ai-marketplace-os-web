/**
 * Fact questions (SI3), checked against the backend:
 *
 *   POST /tasks/{task_id}/answer  tasks.py tasks_answer (product:import; Idempotency-Key)
 *                                 `{value}` or `{skip: true}`; 200 the task `applied`,
 *                                 409 INVALID_STATUS_TRANSITION, 422 at `value`
 */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef } from 'react'
import { api, unwrap } from '@/api/client'
import { isApiError } from '@/api/errors'
import { idempotencyHeader, useIntentKey } from '@/api/idempotency'
import type { Schema } from '@/api/types'
import { useKeys } from '@/lib/query-keys'
import type { AnswerValue } from './answer-spec'

type Task = Schema<'TaskOut'>
export type AnswerBody = { value: AnswerValue } | { skip: true }

/**
 * Answer one fact question. One Idempotency-Key per answer: a network retry of the same answer
 * replays the stored response; a different answer, or any refusal, starts a new key. Errors are
 * shown on the card (`meta.toast: false`).
 */
export function useAnswerTask(task: Pick<Task, 'id' | 'product_id'>) {
  const keys = useKeys()
  const qc = useQueryClient()
  const intent = useIntentKey()
  const sent = useRef<string | null>(null)
  return useMutation({
    meta: { toast: false },
    mutationFn: (body: AnswerBody) => {
      const text = JSON.stringify(body)
      if (sent.current !== text) intent.reset()
      sent.current = text
      return unwrap(
        api.POST('/tasks/{task_id}/answer', {
          params: { path: { task_id: task.id }, header: idempotencyHeader(intent.get()) },
          body,
        }),
      )
    },
    onSuccess: () => intent.reset(),
    onError: (err) => {
      // Only a lost response keeps the key, so the retry replays instead of answering twice.
      if (!isApiError(err) || err.status !== 0) intent.reset()
    },
    onSettled: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: keys.tasks.all() }),
        task.product_id ? qc.invalidateQueries({ queryKey: keys.products.detail(task.product_id) }) : null,
        qc.invalidateQueries({ queryKey: keys.listings.lists() }),
      ]),
  })
}
