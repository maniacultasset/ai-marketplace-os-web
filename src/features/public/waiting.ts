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
import { signupChip } from './model'

/** What a status card shows; a full SignupStatusOut and a poll answer both fit. */
export interface StatusView {
  status: SignupPollOut['status']
  brand_name: string
  created_at: string
  decided_at?: string | null
  reason?: string | null
  /** The one question a reviewer asked while the request is pending (poll only). */
  question?: string | null
  asked_at?: string | null
  /** The applicant's own reply to `question`, once sent. */
  reply?: string | null
  replied_at?: string | null
}

export const fromPoll = (p: SignupPollOut): StatusView => ({
  status: p.status,
  brand_name: p.brand_name,
  created_at: p.requested_at,
  decided_at: p.decided_at ?? null,
  reason: p.reason ?? null,
  question: p.question ?? null,
  asked_at: p.asked_at ?? null,
  reply: p.reply ?? null,
  replied_at: p.replied_at ?? null,
})

/**
 * Where a pending request's one question stands: none asked, asked and waiting for this person's
 * reply, or replied (back with the reviewer). The status stays `pending` throughout.
 */
export type QuestionState = 'none' | 'asked' | 'replied'
export function questionState(view: StatusView): QuestionState {
  if (view.status !== 'pending' || !view.question) return 'none'
  return view.reply ? 'replied' : 'asked'
}

/** The status chip: an open question needs this person, so it says so. */
export function viewChip(view: StatusView): ReturnType<typeof signupChip> {
  return questionState(view) === 'asked' ? { status: 'needs-you', label: 'Needs your reply' } : signupChip(view.status)
}

/** The card's title: an open question gets its own, so the person sees there is something to do. */
export function waitingTitle(view: StatusView): string {
  return questionState(view) === 'asked' ? 'One question for you' : WAITING_TITLE[view.status]
}

/** The sentence under the title, with the question's state taken into account. */
export function viewCopy(view: StatusView, via: SignInVia, remembered: boolean, live = true): string {
  const q = questionState(view)
  if (q === 'asked')
    return live
      ? 'Our team needs one more detail before approving. Reply below. You can send one reply.'
      : `Our team has one question for you. ${replyElsewhere(via)}`
  if (q === 'replied') return 'Thanks. Your reply is with our team. This page updates by itself when there is a decision.'
  return waitingCopy(view.status, via, remembered, live)
}

/** How to get back to the reply box when this page has no live handle. */
export function replyElsewhere(via: SignInVia): string {
  return via === 'google' ? 'To reply, use Continue with Google again.' : 'To reply, open Check your request on the sign-in page.'
}

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
      ? 'Your workspace is ready. This page can only show your status, so sign in once with the same Google account to open it.'
      : 'Your workspace is ready. This page can only show your status, so sign in once with the email and password you applied with to open it.'
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
