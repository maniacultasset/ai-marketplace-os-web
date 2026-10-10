/**
 * Poll GET /jobs/{job_id} with backoff:
 *   1 s for the first 10 s after mount, 2 s until 60 s, then 5 s; stops at a terminal status;
 *   paused in hidden tabs; on 429 waits Retry-After (default 60 s).
 * `onTerminal(job)` fires exactly once per job id (run your invalidations there).
 */
import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { api, unwrap } from '@/api/client'
import { isApiError } from '@/api/errors'
import type { JobEnvelope, JobState } from '@/api/types'
import { useKeys } from '@/lib/query-keys'

export const TERMINAL_JOB_STATES: readonly JobState[] = [
  'succeeded',
  'partial',
  'failed',
  'cancelled',
  'dead_letter',
]
export const isTerminalJob = (status: JobState | undefined) =>
  !!status && TERMINAL_JOB_STATES.includes(status)

export function jobPollInterval(elapsedMs: number) {
  if (elapsedMs < 10_000) return 1_000
  if (elapsedMs < 60_000) return 2_000
  return 5_000
}

export interface UseJobPollingOptions {
  onTerminal?: (job: JobEnvelope) => void
  enabled?: boolean
}

export function useJobPolling(jobId: string | null | undefined, opts: UseJobPollingOptions = {}) {
  const keys = useKeys()
  const startedAt = useRef(0)
  const firedFor = useRef<string | null>(null)
  const onTerminal = useRef(opts.onTerminal)
  useEffect(() => {
    onTerminal.current = opts.onTerminal
  })

  useEffect(() => {
    startedAt.current = Date.now()
  }, [jobId])

  const query = useQuery({
    queryKey: keys.jobs.detail(jobId ?? 'none'),
    queryFn: () => unwrap(api.GET('/jobs/{job_id}', { params: { path: { job_id: jobId! } } })),
    enabled: !!jobId && (opts.enabled ?? true),
    // A terminal job never changes again: serve it from cache instead of refetching per mount.
    staleTime: (q) => (isTerminalJob(q.state.data?.status) ? Infinity : 0),
    refetchIntervalInBackground: false,
    refetchInterval: (q) => {
      if (isTerminalJob(q.state.data?.status)) return false
      const err = q.state.error
      if (isApiError(err)) {
        if (err.status === 429) return (err.retryAfter ?? 60) * 1000
        if (err.status === 404 || err.status === 403) return false
      }
      return jobPollInterval(Date.now() - startedAt.current)
    },
  })

  const job = query.data
  const terminal = isTerminalJob(job?.status)

  useEffect(() => {
    if (job && terminal && firedFor.current !== job.job_id) {
      firedFor.current = job.job_id
      onTerminal.current?.(job)
    }
  }, [job, terminal])

  // Seconds until polling resumes after a 429 ("Rate limited, resuming in N s").
  const [resumeIn, setResumeIn] = useState<number | null>(null)
  const err = query.error
  const limited = isApiError(err) && err.status === 429 ? err : null
  useEffect(() => {
    if (!limited) return
    const until = Date.now() + (limited.retryAfter ?? 60) * 1000
    const tick = () => setResumeIn(Math.max(0, Math.ceil((until - Date.now()) / 1000)))
    const first = setTimeout(tick, 0)
    const t = setInterval(tick, 1000)
    return () => {
      clearTimeout(first)
      clearInterval(t)
      setResumeIn(null)
    }
  }, [limited])

  // Queued for more than 15 s since mount: show "Waiting for a worker…" (no worker = stays queued).
  const [waiting, setWaiting] = useState(false)
  const queued = job?.status === 'queued'
  useEffect(() => {
    if (!queued) return
    const t = setTimeout(() => setWaiting(true), Math.max(0, 15_000 - (Date.now() - startedAt.current)))
    return () => {
      clearTimeout(t)
      setWaiting(false)
    }
  }, [queued])

  return {
    ...query,
    job,
    isTerminal: terminal,
    isWaitingForWorker: queued && waiting,
    /** Seconds until polling resumes after a 429, else null. */
    rateLimitedFor: limited ? resumeIn : null,
  }
}
