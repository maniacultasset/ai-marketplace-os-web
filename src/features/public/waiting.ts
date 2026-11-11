/**
 * The waiting screens' state and copy (no components): the stored status handle polled with
 * POST /signup/status/poll (features/signup-admin/poll.ts) and the sentence for each state.
 * The buttons are in waiting-status.tsx.
 */
import { useEffect } from 'react'
import { describeError, isApiError } from '@/api/errors'
import { isHandleGone, useSignupPoll, type SignupPollOut } from '@/features/signup-admin/poll'
import { clearStatusHandle, type SignInVia } from '@/features/signup-admin/status-handle'
import { COMPANY } from './company'

/** What a status card shows; a full SignupStatusOut and a poll answer both fit. */
export interface StatusView {
  status: SignupPollOut['status']
  brand_name: string
  created_at: string
  decided_at?: string | null
  reason?: string | null
}

export const fromPoll = (p: SignupPollOut): StatusView => ({
  status: p.status,
  brand_name: p.brand_name,
  created_at: p.requested_at,
  decided_at: p.decided_at ?? null,
  reason: p.reason ?? null,
})

export const WAITING_TITLE: Record<StatusView['status'], string> = {
  pending: 'Waiting for approval',
  approved: 'You’re approved',
  rejected: 'Your request was not approved',
}

/**
 * The sentence under the title. `remembered`: the handle is kept on this device. `live`: a poll
 * is really running (a handle that still names the request); without one, pending says how to
 * check again instead of promising updates.
 */
export function waitingCopy(status: StatusView['status'], via: SignInVia, remembered: boolean, live = true): string {
  if (status === 'approved')
    return via === 'google'
      ? 'Continue to your workspace with the same Google account.'
      : 'Continue to your workspace with the email and password you applied with.'
  if (status === 'rejected') return `If you have a question about the reason, write to us at ${COMPANY.email}.`
  if (!live)
    return via === 'google'
      ? 'A person on our team reviews every request. To check on it later, use Continue with Google again.'
      : 'A person on our team reviews every request. To check on it later, use Check your request on the sign-in page.'
  return remembered
    ? 'A person on our team reviews every request. This page updates by itself, so you can close it and check again later on this device from Check your request on the sign-in page.'
    : 'A person on our team reviews every request. This page updates by itself while it stays open.'
}

/** A failed poll read (not a 404) before any answer; the poll retries by itself. */
export function pollErrorMessage(e: unknown): string {
  if (isApiError(e) && e.status === 429) return 'Too many checks from this network. Trying again shortly.'
  return `Couldn’t check your request just now. ${describeError(e)} Trying again by itself.`
}

export const pollErrorRef = (e: unknown) => (isApiError(e) ? e.correlationId : null)

/**
 * The polled status: the poll's answer once it has one, else `initial` (the sign-up answer).
 * A 404 drops the stored handle and reports `gone`, so the screen can fall back quietly.
 */
export function useWaitingStatus(handle: string | null, initial: StatusView | null) {
  const poll = useSignupPoll(handle)
  const gone = !!handle && isHandleGone(poll.error)
  useEffect(() => {
    if (gone) clearStatusHandle()
  }, [gone])
  // Any other failure (429, 5xx, network) while there is no answer yet; the poll keeps retrying.
  const failed = !!handle && !gone && !poll.data && poll.isError
  return {
    view: poll.data ? fromPoll(poll.data) : initial,
    gone,
    loading: !!handle && poll.isPending,
    error: failed ? poll.error : null,
    retrying: poll.isFetching,
    refetch: () => void poll.refetch(),
  }
}
