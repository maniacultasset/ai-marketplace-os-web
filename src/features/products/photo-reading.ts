/**
 * V1.1 photo read on upload: when a front, back or close-up photo of a product finishes its checks,
 * the backend reads the photo details on its own (`photo_reading` on the product read while the
 * read is queued or running). The product page polls while that is true, and while such a photo is
 * still being checked (its read is queued right after the checks), then shows the result through
 * `photo_read` and `photo_facts` as before. Nothing here writes anything.
 */
import type { ProductDetail } from './api'

/** How often the product is read again while its photos are being read. */
export const PHOTO_READING_POLL_MS = 2_000
/** How often while a front, back or close-up photo is still being checked. */
export const PHOTO_CHECK_POLL_MS = 4_000

type Readable = Pick<ProductDetail, 'photo_reading' | 'image_details' | 'parent_product_id'>

/** A front photo, or a secondary photo marked Back or Close-up: the photos whose upload starts a read. */
export function startsPhotoRead(d: { slot: string; role?: string | null }): boolean {
  return d.slot === 'main' || (d.slot === 'secondary' && (d.role === 'back' || d.role === 'close_up'))
}

/** The photos are being read now. */
export function isReadingPhotos(p: Pick<ProductDetail, 'photo_reading'> | null | undefined): boolean {
  return !!p?.photo_reading
}

/**
 * The next product read for the photo read, or false when nothing is in flight: fast while the
 * photos are read, slower while a photo that starts a read is still being checked. A variant's
 * photos are read on its style, so a variant never polls for it.
 */
export function photoReadDelay(p: Readable | null | undefined): number | false {
  if (!p) return false
  if (p.photo_reading) return PHOTO_READING_POLL_MS
  if (p.parent_product_id) return false
  const checking = (p.image_details ?? []).some((d) => d.compliance_status === 'pending' && startsPhotoRead(d))
  return checking ? PHOTO_CHECK_POLL_MS : false
}

/** The smaller of two refetch delays (`false` means none). */
export function soonest(a: number | false, b: number | false): number | false {
  if (a === false) return b
  if (b === false) return a
  return Math.min(a, b)
}

/** How often the product is read again while a photo's colour check runs (client feedback item 9). */
export const PHOTO_MATCH_POLL_MS = 3_000

/** The next product read while a photo's colour check runs (`photo_match.status` `checking`). */
export function photoMatchDelay(p: Pick<ProductDetail, 'image_details'> | null | undefined): number | false {
  return (p?.image_details ?? []).some((d) => d.photo_match?.status === 'checking') ? PHOTO_MATCH_POLL_MS : false
}
