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
import { codePoints, CONTROL_MSG, hasStrayControlChars } from '@/lib/validation'

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
  const note = v.note.trim()
  if (!note) e.note = 'Write what should change.'
  else if (hasStrayControlChars(note)) e.note = CONTROL_MSG
  else if (codePoints(note) > FEEDBACK_MAX) e.note = `Shorten the note to ${FEEDBACK_MAX.toLocaleString()} characters or fewer.`
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
  const title = d.title.trim()
  if (!title) e.title = 'Write a title.'
  else if (hasStrayControlChars(title)) e.title = CONTROL_MSG
  else if (codePoints(title) > TITLE_MAX) e.title = `Shorten the title to ${TITLE_MAX} characters or fewer.`
  const bullets = splitBullets(d.bullets)
  if (!bullets.length) e.bullets = 'Write at least one bullet, one per line.'
  else if (bullets.length > BULLETS_MAX) e.bullets = `Use ${BULLETS_MAX} bullets or fewer.`
  else if (bullets.some((b) => hasStrayControlChars(b))) e.bullets = CONTROL_MSG
  else {
    const long = bullets.findIndex((b) => codePoints(b) > BULLET_MAX)
    if (long >= 0) e.bullets = `Shorten bullet ${long + 1} to ${BULLET_MAX.toLocaleString()} characters or fewer.`
  }
  const description = d.description.trim()
  if (!description) e.description = 'Write a description.'
  else if (hasStrayControlChars(description)) e.description = CONTROL_MSG
  else if (codePoints(description) > DESCRIPTION_MAX)
    e.description = `Shorten the description to ${DESCRIPTION_MAX.toLocaleString()} characters or fewer.`
  return e
}

export const editToContent = (d: EditDraft) => ({ title: d.title.trim(), bullets: splitBullets(d.bullets), description: d.description.trim() })

type Row = Pick<Listing, 'id' | 'status' | 'status_reason' | 'current_version_id' | 'approved_version_id' | 'marketplace'>

/** "Approve all N": every listing of the product a batch approve would accept. Shown only for 2+. */
export function approveAllTargets<T extends Row>(siblings: readonly T[]): T[] {
  return siblings.length > 1 ? approveEligibility(siblings).eligible : []
}
