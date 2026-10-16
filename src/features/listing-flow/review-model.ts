/**
 * Pure rules of the review screen (p13), mirroring the backend:
 *   - Send back: POST /listings/approve with `decision: reject`, which needs `reason_code`
 *     (batches.py REASON_CODES) and `feedback` (non-blank, ≤ 2000); `regenerate: true` asks the
 *     agent to rewrite it with the note (review.py `reject_regenerate`), otherwise it is blocked.
 *   - Edit: PATCH /listings/{id}/content, ListingContent (mkos_schemas/listing.py): title ≤ 500,
 *     1..10 bullets ≤ 1000 each, description ≤ 5000, none blank. Keywords and attributes are not
 *     sent, so the backend keeps them (listing_edit.py).
 *   - Approve all: the product's other listings that a multi-item approve accepts (`validated`).
 */
import { approveEligibility, type ApproveItem, type Listing, type RejectReason } from '@/features/listings/model'

export const FEEDBACK_MAX = 2000
export const TITLE_MAX = 500
export const BULLET_MAX = 1000
export const BULLETS_MAX = 10
export const DESCRIPTION_MAX = 5000

export interface SendBackInput {
  reason: RejectReason | ''
  note: string
  rewrite: boolean
}

export function validateSendBack(v: SendBackInput): { reason?: string; note?: string } {
  const e: { reason?: string; note?: string } = {}
  if (!v.reason) e.reason = 'Choose a reason.'
  if (!v.note.trim()) e.note = 'Write what should change.'
  else if (v.note.length > FEEDBACK_MAX) e.note = `At most ${FEEDBACK_MAX.toLocaleString()} characters.`
  return e
}

export function sendBackItem(listing: Pick<Listing, 'id' | 'current_version_id'>, v: SendBackInput): ApproveItem {
  return {
    listing_id: listing.id,
    listing_version_id: listing.current_version_id!,
    decision: 'reject',
    reason_code: v.reason || null,
    feedback: v.note.trim(),
    regenerate: v.rewrite,
  }
}

export interface EditDraft {
  title: string
  bullets: string
  description: string
}

export const splitBullets = (text: string) =>
  text
    .split('\n')
    .map((b) => b.trim())
    .filter(Boolean)

export function validateEdit(d: EditDraft): Partial<Record<keyof EditDraft, string>> {
  const e: Partial<Record<keyof EditDraft, string>> = {}
  if (!d.title.trim()) e.title = 'Write a title.'
  else if (d.title.length > TITLE_MAX) e.title = `At most ${TITLE_MAX} characters.`
  const bullets = splitBullets(d.bullets)
  if (!bullets.length) e.bullets = 'Write at least one bullet, one per line.'
  else if (bullets.length > BULLETS_MAX) e.bullets = `At most ${BULLETS_MAX} bullets.`
  else if (bullets.some((b) => b.length > BULLET_MAX)) e.bullets = `Each bullet can have at most ${BULLET_MAX} characters.`
  if (!d.description.trim()) e.description = 'Write a description.'
  else if (d.description.length > DESCRIPTION_MAX) e.description = `At most ${DESCRIPTION_MAX.toLocaleString()} characters.`
  return e
}

export const editToContent = (d: EditDraft) => ({ title: d.title.trim(), bullets: splitBullets(d.bullets), description: d.description.trim() })

type Row = Pick<Listing, 'id' | 'status' | 'status_reason' | 'current_version_id' | 'approved_version_id' | 'marketplace'>

/** "Approve all N": every listing of the product a batch approve would accept. Shown only for 2+. */
export function approveAllTargets<T extends Row>(siblings: readonly T[]): T[] {
  return siblings.length > 1 ? approveEligibility(siblings).eligible : []
}
