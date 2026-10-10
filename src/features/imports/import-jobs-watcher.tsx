/**
 * App-wide poller for the import jobs this browser started (see use-import-job.ts): keeps each
 * one polled until it ends, whatever page is open, so its end invalidates the products queries
 * and the import report even after the user leaves the import page.
 */
import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { isApiError } from '@/api/errors'
import { useImportHistory } from './history'
import { getWatched, isWatchDone, subscribeWatched, unwatch, useImportJob } from './use-import-job'

/** Uploads older than this are not re-polled after a reload (they have long finished). */
const RECENT_MS = 2 * 60 * 60 * 1000

/** Polls every import job this browser started and has not seen end, on any page. */
export function ImportJobsWatcher() {
  const live = useSyncExternalStore(subscribeWatched, getWatched, getWatched)
  const { entries } = useImportHistory()
  const jobs = useMemo(() => {
    const all = new Map<string, string>(live)
    // After a reload the module state is gone: pick up recent uploads from local history.
    const since = Date.now() - RECENT_MS
    for (const e of entries) {
      if (!all.has(e.job_id) && Date.parse(e.created_at) >= since) all.set(e.job_id, e.import_id)
    }
    return [...all].filter(([jobId]) => !isWatchDone(jobId))
  }, [live, entries])
  return (
    <>
      {jobs.map(([jobId, importId]) => (
        <WatchJob key={jobId} jobId={jobId} importId={importId} />
      ))}
    </>
  )
}

function WatchJob({ jobId, importId }: { jobId: string; importId: string }) {
  const polling = useImportJob(jobId, () => importId)
  const err = polling.error
  const finished = polling.isTerminal || (isApiError(err) && (err.status === 404 || err.status === 403))
  useEffect(() => {
    // Let useImportJob's own terminal effect run first (it is declared before this one).
    if (finished) unwatch(jobId)
  }, [finished, jobId])
  return null
}
