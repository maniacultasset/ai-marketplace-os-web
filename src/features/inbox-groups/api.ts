/**
 * G1 reads and writes. Checked against the backend (`routers/inbox_groups.py`, surface.py):
 *
 *   GET  /inbox/groups?view=all|questions|issues   inbox_groups_list (tenant:read). Off switch:
 *                                                  200 `{enabled: false, groups: []}`.
 *   POST /inbox/groups/answer                      inbox_groups_answer (product:import; Idempotency-Key)
 *                                                  `{group, task_ids (1..100), value}`; 200 applied,
 *                                                  skipped, listings; 422 at task_ids[i], group or
 *                                                  value; 501 when the switch is off.
 *   POST /listings/{id}/regenerate                 via regenerateBody (listing:regenerate; one key
 *                                                  per listing; B19: 202 waiting_for_slot past the cap).
 *                                                  The sections the answer feeds with for_answers: true;
 *                                                  the whole listing only when none are given.
 *   GET  /listings/{id}                            after a brand-wide save: status and affected_sections.
 *   POST /listings/validate                        listing:edit; a failed check is still 200.
 *
 * The groups read sits under `tasks.all()`, so every answer, close or regenerate that refreshes the
 * questions refreshes it too; the page also re-reads it when the summary's counts move (an issue
 * dismissed elsewhere).
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useRef, useState } from 'react'
import { api, unwrap } from '@/api/client'
import { isApiError } from '@/api/errors'
import { idempotencyHeader, newIdempotencyKey } from '@/api/idempotency'
import { isAiPausedError, markAiPaused } from '@/features/ai-credit/model'
import { fetchTasksPage, homeSummaryKey } from '@/features/inbox/api'
import type { Task } from '@/features/inbox/model'
import { invalidateListingWork, regenerateBody } from '@/features/listings/api'
import { isWaitingForSlot, type JobAccepted } from '@/features/products-add/generate'
import type { InboxView } from '@/features/home-inbox/model'
import { useKeys } from '@/lib/query-keys'
import {
  chunks,
  listingPlan,
  mergeAnswers,
  normalizeGroups,
  type AnswerScalar,
  type GroupAnswerOut,
  type RedraftOutcome,
  type RedraftPlanItem,
  type RedraftResult,
  type RedraftSection,
} from './model'

export const inboxGroupsKey = (keys: ReturnType<typeof useKeys>, view: InboxView) => [...keys.tasks.all(), 'inbox-groups', view] as const

export function useInboxGroups(view: InboxView, opts: { enabled?: boolean } = {}) {
  const keys = useKeys()
  return useQuery({
    queryKey: inboxGroupsKey(keys, view),
    queryFn: async ({ signal }) => normalizeGroups(await unwrap(api.GET('/inbox/groups', { params: { query: { view } }, signal }))),
    enabled: opts.enabled ?? true,
    // A failed read falls back to the ungrouped lists, quietly (an older backend has no groups).
    meta: { toast: false },
    retry: false,
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  })
}

export type GroupAnswerVars = { group: string; taskIds: readonly string[]; value: AnswerScalar }
/** What one answer did. `error` is set when a later chunk failed after earlier ones were saved. */
export type GroupAnswerRun = { result: GroupAnswerOut; error: unknown }

/**
 * Answer a group, 100 task ids per request, one Idempotency-Key per chunk. A lost response keeps
 * that chunk's key, so trying again replays it instead of answering twice; any other outcome
 * starts new keys. A failure on the first chunk throws; a later one returns what was saved.
 */
export function useAnswerGroup() {
  const keys = useKeys()
  const qc = useQueryClient()
  const sent = useRef(new Map<string, string>())
  return useMutation({
    meta: { toast: false },
    mutationFn: async ({ group, taskIds, value }: GroupAnswerVars): Promise<GroupAnswerRun> => {
      const parts: GroupAnswerOut[] = []
      for (const ids of chunks(taskIds)) {
        const print = JSON.stringify([group, value, ids])
        const key = sent.current.get(print) ?? newIdempotencyKey()
        sent.current.set(print, key)
        try {
          parts.push(
            await unwrap(
              api.POST('/inbox/groups/answer', {
                params: { header: idempotencyHeader(key) },
                body: { group, task_ids: ids, value },
              }),
            ),
          )
          sent.current.delete(print)
        } catch (error) {
          if (!isApiError(error) || error.status !== 0) sent.current.delete(print)
          if (!parts.length) throw error
          return { result: mergeAnswers(parts), error }
        }
      }
      return { result: mergeAnswers(parts), error: null }
    },
    onSettled: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: keys.tasks.all() }),
        qc.invalidateQueries({ queryKey: keys.issues.all() }),
        qc.invalidateQueries({ queryKey: keys.products.all() }),
        qc.invalidateQueries({ queryKey: homeSummaryKey(keys) }),
      ]),
  })
}

/** Run `work` over `items`, at most `concurrency` at a time, in order. */
async function pool<T, R>(items: readonly T[], work: (item: T, i: number) => Promise<R>, concurrency = 3): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await work(items[i]!, i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker))
  return out
}

/** How a refused regenerate reads. A 429 or an AI pause stops the rest (they would be refused too). */
export function redraftOutcome(error: unknown): { outcome: RedraftOutcome; stop: boolean } {
  if (isAiPausedError(error)) return { outcome: 'failed', stop: true }
  if (isApiError(error) && error.status === 429) return { outcome: 'limited', stop: true }
  if (isApiError(error) && error.type === 'LISTING_BUSY') return { outcome: 'busy', stop: false }
  return { outcome: 'failed', stop: false }
}

export type RegenerateSend = (
  listingId: string,
  key: string,
  sections: readonly RedraftSection[],
) => Promise<Pick<JobAccepted, 'status' | 'waiting_for_slot'>>
/** A listing to redraft: only `sections` (for the answers), or the whole listing when empty. */
export type RedraftTarget = { listingId: string; sections: readonly RedraftSection[] }

export const regenerateOne: RegenerateSend = (listingId, key, sections) =>
  unwrap(
    api.POST('/listings/{listing_id}/regenerate', {
      params: { path: { listing_id: listingId }, header: idempotencyHeader(key) },
      body: regenerateBody(null, sections, true),
    }),
  )

/** The plan for listings after a brand-wide save, read one by one (pool of 3); an unreadable one is left out. */
export async function fetchListingPlan(listingIds: readonly string[], aiPaused: boolean): Promise<RedraftPlanItem[]> {
  const out = await pool(listingIds, async (listing_id) => {
    try {
      return listingPlan(await unwrap(api.GET('/listings/{listing_id}', { params: { path: { listing_id } } })), aiPaused)
    } catch {
      return null
    }
  })
  return out.filter((x): x is RedraftPlanItem => !!x)
}

/**
 * Redraft each listing (pool of 3), one Idempotency-Key per listing kept for this screen: "Redraft
 * the rest" after a 429 resends the same keys, and a listing already started replays its job.
 */
export async function redraftMany(
  targets: readonly RedraftTarget[],
  keyFor: (listingId: string) => string,
  send: RegenerateSend = regenerateOne,
  onProgress?: (done: number) => void,
): Promise<RedraftResult[]> {
  let stop: RedraftOutcome | null = null
  let done = 0
  return pool(targets, async ({ listingId, sections }) => {
    let outcome: RedraftOutcome
    if (stop) outcome = stop
    else
      try {
        const job = await send(listingId, keyFor(listingId), sections)
        outcome = isWaitingForSlot(job) ? 'waiting' : 'accepted'
      } catch (error) {
        const r = redraftOutcome(error)
        if (isAiPausedError(error)) markAiPaused()
        if (r.stop) stop = r.outcome
        outcome = r.outcome
      }
    onProgress?.(++done)
    return { listingId, outcome }
  })
}

export function useRedraft() {
  const keys = useKeys()
  const qc = useQueryClient()
  const keyRef = useRef(new Map<string, string>())
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const run = useCallback(
    async (targets: readonly RedraftTarget[]) => {
      const listingIds = targets.map((t) => t.listingId)
      const keyFor = (id: string) => {
        let k = keyRef.current.get(id)
        if (!k) keyRef.current.set(id, (k = newIdempotencyKey()))
        return k
      }
      setProgress({ done: 0, total: listingIds.length })
      try {
        return await redraftMany(targets, keyFor, regenerateOne, (done) => setProgress({ done, total: listingIds.length }))
      } finally {
        setProgress(null)
        invalidateListingWork(qc, keys, listingIds)
      }
    },
    [qc, keys],
  )
  return { run, progress }
}

/**
 * Re-run the checks on each listing with the current facts (no AI). `closed` is how many Inbox
 * items closed meanwhile (the summary's open items before less after; null when unknown).
 */
export function useRecheck() {
  const keys = useKeys()
  const qc = useQueryClient()
  const [running, setRunning] = useState(false)
  const run = useCallback(
    async (listingIds: readonly string[]): Promise<{ failed: number; closed: number | null }> => {
      setRunning(true)
      const summaryKey = homeSummaryKey(keys)
      const openItems = () => qc.getQueryData<{ inbox?: { open_items: number } }>(summaryKey)?.inbox?.open_items
      const before = openItems()
      try {
        const results = await pool(listingIds, async (listing_id) => {
          try {
            await unwrap(api.POST('/listings/validate', { body: { listing_id, listing_version_id: null } }))
            return true
          } catch {
            return false
          }
        })
        invalidateListingWork(qc, keys, listingIds)
        await qc.refetchQueries({ queryKey: summaryKey, exact: true })
        const after = openItems()
        return { failed: results.filter((ok) => !ok).length, closed: before === undefined || after === undefined ? null : Math.max(0, before - after) }
      } finally {
        setRunning(false)
      }
    },
    [qc, keys],
  )
  return { run, running }
}

/** Pages of open questions walked to find one by id (the API has no GET /tasks/{id}). */
const FIND_TASK_PAGES = 10

/** An open question by id, for a group member opened from the group (null when it is not open). */
export function useFindOpenTask(taskId: string | null) {
  const keys = useKeys()
  return useQuery({
    queryKey: [...keys.tasks.all(), 'find-open', taskId] as const,
    enabled: !!taskId,
    meta: { toast: false },
    queryFn: async (): Promise<Task | null> => {
      let cursor: string | undefined
      for (let i = 0; i < FIND_TASK_PAGES; i++) {
        const page = await fetchTasksPage('open', cursor)
        const hit = page.data.find((t) => t.id === taskId)
        if (hit) return hit
        if (!page.page.has_more || !page.page.next_cursor) return null
        cursor = page.page.next_cursor
      }
      return null
    },
  })
}
