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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, unwrap } from '@/api/client'
import { isApiError } from '@/api/errors'
import type { Schema } from '@/api/types'
import { retryAfterSeconds } from './format'

export type SignupPollOut = Schema<'SignupPollOut'>
export type SignupReplyBody = Schema<'SignupReplyRequest'>

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

const pollKey = (handle: string | null) => ['signup', 'status-poll', handle] as const

export function useSignupPoll(handle: string | null) {
  return useQuery({
    queryKey: pollKey(handle),
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

/**
 * POST /signup/status/reply (routers/signup.py signup_status_reply): the person's one reply to the
 * reviewer's question, authorised by the same status handle, in the body only. The answer has the
 * poll's shape, so it replaces the poll's data at once. 404 and 409 mean the page is stale (the
 * handle is gone, or the request was decided or already answered): the poll is read again.
 */
export function useSignupReply(handle: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (reply: string) => unwrap(api.POST('/signup/status/reply', { body: { status_handle: handle!, reply } })),
    onSuccess: (out) => qc.setQueryData(pollKey(handle), out),
    onError: (e) => {
      if (isApiError(e) && (e.status === 404 || e.status === 409)) void qc.invalidateQueries({ queryKey: pollKey(handle) })
    },
    meta: { toast: false },
  })
}

/** The reply's failure, in one plain sentence. */
export function replyError(e: unknown): string {
  if (isApiError(e) && e.status === 409) return 'This request has changed, so the reply was not sent. The page now shows where it stands.'
  if (isApiError(e) && e.status === 404) return 'This page can no longer reach your request. Check your request again from the sign-in page.'
  if (isApiError(e) && e.status === 429) return 'Too many tries from this network. Wait a minute and send it again.'
  if (isApiError(e) && e.status === 422) return 'The reply can’t be sent as it is. Keep it under 1,000 characters.'
  return 'Couldn’t send your reply just now. Try again.'
}
