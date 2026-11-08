/**
 * "Approve and resend" (SI11 F3, P:D3): one click by a teammate who may approve and did not make
 * the version, on a version that goes out again (a fix Kuinn prepared, or any change to a listing
 * the marketplace already saw). Two calls: approve, then publish. There is no automatic publish on
 * approval in the backend, and the button never repeats a call on its own.
 *
 * Maker-checker: the server's own answer (ListingDetail.can_approve / approve_hint) decides. The
 * maker or editor of the version, including a seller whose fact answer made it (T51), sees
 * "Sent to a teammate for approval" and no button.
 */
import type { Action } from '@/lib/permissions'
import { describeError } from '@/api/errors'
import { approveItems, publishItems, summarizeBatch, type ActionState, type BatchAccepted, type BatchResult, type Listing, type ListingDetail } from '@/features/listings/model'
import { wasSent, type Resolution } from './resolution-model'

export type ResendView =
  /** The approve button reads "Approve and resend" and publishes after the approval. */
  | { kind: 'approve_and_resend'; state: ActionState }
  /** The viewer made this version: a teammate approves and resends it. */
  | { kind: 'teammate' }
  /** Not a resend, or the viewer can't send: the normal footer. */
  | { kind: 'none' }

export const TEAMMATE_TEXT = 'Sent to a teammate for approval'

export interface ResendInput {
  resolution: Pick<Resolution, 'state' | 'attempts'> | null | undefined
  listing: Pick<ListingDetail, 'marketplace' | 'status' | 'can_approve' | 'approve_hint'>
  /** listingActions(...).approve: role, status, checks and maker-checker already folded in. */
  approve: ActionState
  can: (a: Action) => boolean
  publishBuilt: boolean
}

/** A version that goes out again once approved: a prepared fix, or a change after a send. */
export function isResend(r: ResendInput['resolution']): boolean {
  if (!r) return false
  return r.state === 'fix_ready' || wasSent(r)
}

export function resendView({ resolution, listing, approve, can, publishBuilt }: ResendInput): ResendView {
  // Flipkart publishing is off: only Amazon listings are resent from here.
  if (listing.marketplace !== 'amazon' || !isResend(resolution)) return { kind: 'none' }
  // Only a version waiting for review is approved here; an approved one is published from the banner.
  if (listing.status !== 'validated' && listing.status !== 'needs_review') return { kind: 'none' }
  if (listing.can_approve === false && listing.approve_hint === 'own_work') return { kind: 'teammate' }
  if (!approve.show || !can('listing:publish') || !publishBuilt) return { kind: 'none' }
  return { kind: 'approve_and_resend', state: approve }
}

export type ResendOutcome =
  | { step: 'sent'; jobId: string | null }
  /** Nothing was approved, so nothing was sent. */
  | { step: 'approve_failed'; message: string; requestId: string | null; result?: BatchResult }
  /** The approval stands; the send was refused. The Publish button on the page tries again. */
  | { step: 'publish_failed'; message: string; requestId: string | null }

export interface ResendCalls {
  approve: (items: ReturnType<typeof approveItems>) => Promise<BatchResult>
  publish: (items: ReturnType<typeof publishItems>) => Promise<BatchAccepted>
  /** Re-read the listing after the approval, so publish sends the approved version. */
  reread?: () => Promise<unknown>
}

type Row = Pick<Listing, 'id' | 'status' | 'status_reason' | 'current_version_id' | 'approved_version_id'>

const refId = (e: unknown): string | null =>
  e && typeof e === 'object' && 'correlationId' in e ? ((e as { correlationId?: string | null }).correlationId ?? null) : null

/** Approve, then publish, once each. A refused approval never publishes. */
export async function approveThenPublish(listing: Row, calls: ResendCalls): Promise<ResendOutcome> {
  let approved: BatchResult
  try {
    approved = await calls.approve(approveItems([listing]))
  } catch (e) {
    return { step: 'approve_failed', message: describeError(e), requestId: refId(e) }
  }
  const a = summarizeBatch(approved)
  if (!a.ok.some((i) => i.listing_id === listing.id)) {
    const f = a.failed[0]
    return { step: 'approve_failed', message: f?.message ?? 'The approval was not recorded.', requestId: f?.requestId ?? null, result: approved }
  }
  await calls.reread?.().catch(() => undefined)
  let sent: BatchAccepted
  try {
    // The approved version is the current one: publish exactly that.
    sent = await calls.publish(publishItems([listing]))
  } catch (e) {
    return { step: 'publish_failed', message: describeError(e), requestId: refId(e) }
  }
  const p = summarizeBatch(sent)
  const ok = p.ok.find((i) => i.listing_id === listing.id)
  if (ok) return { step: 'sent', jobId: ok.job_id ?? null }
  const f = p.failed[0]
  return { step: 'publish_failed', message: f?.message ?? 'The send was not accepted.', requestId: f?.requestId ?? null }
}
