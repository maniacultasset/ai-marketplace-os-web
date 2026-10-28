/**
 * Pure presentation logic for sign-up requests: status labels, the queue's filter tabs and the
 * sentences shown for each error the sign-up endpoints answer
 * (apps/api/app/api/v1/routers/signup.py and routers/admin.py).
 */
import { describeError, isApiError, isMfaRequired } from '@/api/errors'
import type { Schema } from '@/api/types'

export type SignupRequest = Schema<'SignupRequestOut'>
export type SignupStatusOut = Schema<'SignupStatusOut'>
export type SignupState = SignupRequest['status']

export const SIGNUP_STATUS_META: Record<
  SignupState,
  { label: string; variant: 'warning' | 'success' | 'danger'; title: string; description: string }
> = {
  pending: {
    label: 'Pending',
    variant: 'warning',
    title: 'Waiting for approval',
    description: 'A platform admin reviews every request. Check back here; nothing else is needed from you yet.',
  },
  approved: {
    label: 'Approved',
    variant: 'success',
    title: 'Your brand is approved',
    description: 'Your trial workspace is ready. Sign in with the email and password you used to apply.',
  },
  rejected: {
    label: 'Rejected',
    variant: 'danger',
    title: 'Your request was not approved',
    description: 'You can fix what the reviewer pointed out and apply again with the same email.',
  },
}

/** Queue filter tabs: the review queue first, then the decided requests, then everything. */
export const QUEUE_TABS = ['pending', 'approved', 'rejected', 'all'] as const
export type QueueTab = (typeof QUEUE_TABS)[number]
export const QUEUE_TAB_LABEL: Record<QueueTab, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  all: 'All',
}

/** The `status` query param for a tab (`all` sends none: the backend default lists every status). */
export const tabToStatus = (tab: QueueTab): SignupState | null => (tab === 'all' ? null : tab)

/** Seconds to wait after a 429, from Retry-After (60 when the header is missing). */
export function retryAfterSeconds(e: unknown): number | null {
  return isApiError(e) && e.status === 429 ? Math.max(1, e.retryAfter ?? 60) : null
}

/** POST /signup failure (422 field errors are mapped onto the form before this). */
export function signupSubmitError(e: unknown): string {
  if (isApiError(e) && e.status === 429) return 'Too many sign-up attempts from this network.'
  if (isApiError(e) && e.status === 422) return 'Some details are not valid. Check the highlighted fields.'
  return describeError(e)
}

/** POST /signup/status failure. Every refusal (unknown email, wrong password, no request) is one 401. */
export function statusCheckError(e: unknown): string {
  if (isApiError(e) && e.status === 401)
    return 'No sign-up request matches this email and password. Check both, or request access first.'
  if (isApiError(e) && e.status === 429) return 'Too many attempts.'
  return describeError(e)
}

export type Decision = 'approve' | 'reject'

/** Approve / reject failure, shown inside the dialog with its reference id. */
export function decisionError(e: unknown, decision: Decision): string {
  if (!isApiError(e)) return describeError(e)
  if (e.status === 409 && e.type === 'INVALID_STATUS_TRANSITION')
    return decision === 'approve'
      ? 'This request was already rejected, so it can no longer be approved. The list has been refreshed.'
      : 'This request was already approved, so it can no longer be rejected. The list has been refreshed.'
  if (e.status === 404) return 'This request no longer exists. The list has been refreshed.'
  if (isMfaRequired(e)) return describeError(e)
  if (e.status === 403) return 'Only platform admins can decide sign-up requests.'
  return describeError(e)
}

/** Errors after which the row's state on screen is wrong and the queue must be re-read. */
export const decisionNeedsRefresh = (e: unknown) =>
  isApiError(e) && (e.status === 404 || (e.status === 409 && e.type === 'INVALID_STATUS_TRANSITION'))

/** Website without its scheme, for display ("https://kalakar.in/" → "kalakar.in"). */
export function displayWebsite(url: string): string {
  return url.replace(/^https?:\/\//i, '').replace(/\/$/, '')
}

/** "Meera Iyer" → "MI"; falls back to the email's first letter. */
export function initials(name: string, email = ''): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return (email[0] ?? '?').toUpperCase()
  const first = [...parts[0]!][0] ?? ''
  const last = parts.length > 1 ? ([...parts[parts.length - 1]!][0] ?? '') : ''
  return (first + last).toUpperCase()
}
