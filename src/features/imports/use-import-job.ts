/**
 * One import job's poller plus the invalidations its end implies (bulk_import
 * terminal -> report + rows, and every products query, since an import updates existing SKUs).
 *
 * The invalidation runs only when this browser session saw the job queued/running and then saw
 * it end. A job that was already terminal the first time we fetched it needs nothing: its report
 * and rows are fetched fresh anyway, so re-invalidating them would only refetch the same data.
 * Both sets are module-level so remounting a page (or a history row) never re-runs it.
 *
 * `ImportJobsWatcher` (./import-jobs-watcher.tsx, mounted once in the authenticated layout) keeps polling every import job
 * this browser started until it ends, whatever page is open, so the products list and other
 * screens update when an import finishes even after the user leaves the import page.
 */
import { useQueryClient } from '@tanstack/react-query'
import type { JobEnvelope } from '@/api/types'
import { isTerminalJob, useJobPolling } from '@/hooks/use-job-polling'
import { useKeys } from '@/lib/query-keys'

const seenLive = new Set<string>()
const settled = new Set<string>()

/** Jobs this browser started in this session (job id -> import id), watched until they end. */
const watched = new Map<string, string>()
/** Jobs the watcher saw end (or vanish); never watched again in this session. */
const done = new Set<string>()
const watchListeners = new Set<() => void>()
let watchedSnapshot: ReadonlyArray<readonly [string, string]> = []
/** Subscribe/snapshot for the watcher (useSyncExternalStore). */
export function subscribeWatched(l: () => void) {
  watchListeners.add(l)
  return () => void watchListeners.delete(l)
}
export const getWatched = () => watchedSnapshot
export const isWatchDone = (jobId: string) => done.has(jobId)
const notify = () => {
  watchedSnapshot = [...watched.entries()]
  watchListeners.forEach((l) => l())
}

/** A job this browser just created (upload, rows retry) is live by definition, even if it ends
 * before the first poll returns. It is watched app-wide until it ends. */
export function markJobLive(jobId: string, importId?: string) {
  seenLive.add(jobId)
  if (importId && !done.has(jobId) && !watched.has(jobId)) {
    watched.set(jobId, importId)
    notify()
  }
}

export function unwatch(jobId: string) {
  done.add(jobId)
  if (watched.delete(jobId)) notify()
}

export function useImportJob(
  jobId: string | null | undefined,
  importIdOf: (job: JobEnvelope) => string | null | undefined,
) {
  const keys = useKeys()
  const qc = useQueryClient()
  const polling = useJobPolling(jobId, {
    onTerminal: (job) => {
      if (!seenLive.has(job.job_id) || settled.has(job.job_id)) return
      settled.add(job.job_id)
      const importId = importIdOf(job)
      if (importId) {
        void qc.invalidateQueries({ queryKey: keys.imports.detail(importId) })
        void qc.invalidateQueries({ queryKey: keys.importRows.all(importId) })
      }
      void qc.invalidateQueries({ queryKey: keys.products.all() })
    },
  })
  const job = polling.job
  // Registered during render so it is in place before the hook's onTerminal effect can run.
  if (job && !isTerminalJob(job.status)) seenLive.add(job.job_id)
  return polling
}
