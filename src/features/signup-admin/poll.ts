/**
 * POST /signup/status/poll (routers/signup.py signup_status_poll): the waiting screens read the
 * decision with the stored status handle, every 15 s while the tab is visible.
 *
 * - Stops for good once the request is decided (approved or rejected).
 * - A hidden tab never polls (no background refetch); coming back to the tab reads at once.
 * - 429: waits the Retry-After before the next read (never sooner than the usual 15 s).
 * - 404 (unknown, replaced or expired handle): stops, and the caller drops the stored handle.
 * The handle goes in the JSON body only, never in the URL.
 */
import { useQuery } from '@tanstack/react-query'
import { api, unwrap } from '@/api/client'
import { isApiError } from '@/api/errors'
import type { Schema } from '@/api/types'
import { retryAfterSeconds } from './format'

export type SignupPollOut = Schema<'SignupPollOut'>

export const POLL_MS = 15_000

/** Milliseconds until the next read, or false to stop. Pure, from the query's last state. */
export function pollDelay(state: { data?: SignupPollOut; error?: unknown }): number | false {
  if (state.data && state.data.status !== 'pending') return false
  if (isHandleGone(state.error)) return false
  const wait = retryAfterSeconds(state.error)
  return wait ? Math.max(POLL_MS, wait * 1000) : POLL_MS
}

/** 404: the handle names nothing (any more). */
export const isHandleGone = (e: unknown) => isApiError(e) && e.status === 404

export function useSignupPoll(handle: string | null) {
  return useQuery({
    queryKey: ['signup', 'status-poll', handle],
    queryFn: () => unwrap(api.POST('/signup/status/poll', { body: { status_handle: handle! } })),
    enabled: !!handle,
    staleTime: 0,
    retry: false,
    refetchInterval: (query) => pollDelay(query.state),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: (query) => pollDelay(query.state) !== false,
    refetchOnReconnect: (query) => pollDelay(query.state) !== false,
  })
}
