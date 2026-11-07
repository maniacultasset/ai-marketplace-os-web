/**
 * "Needs photos" after a bulk import. A CSV never brings photos (its photo link columns are not
 * fetched), so each imported style or standalone product needs a main photo from its Media tab.
 *
 * List reads carry only image keys, not their slots: a product with no keys needs photos for sure;
 * one with keys needs its single read (`image_details`) to tell whether one of them is a main.
 */
import type { Schema } from '@/api/types'

type ImageDetail = Schema<'ProductImageOut'>

/** At most this many single reads, so a large import does not fire hundreds of requests. */
export const NEEDS_PHOTOS_DETAIL_CAP = 50

export interface PhotoCandidate {
  id: string
  images?: readonly string[]
}

export interface NeedsPhotos<P> {
  /** Products with no main photo, in the order given. */
  missing: P[]
  /** Products with images whose single read has not answered (or was not made: over the cap). */
  unknown: number
}

/** The products among `candidates` whose single read is worth making (they have image keys). */
export function detailIdsToRead(candidates: readonly PhotoCandidate[]): string[] {
  return candidates.filter((p) => (p.images ?? []).length > 0).slice(0, NEEDS_PHOTOS_DETAIL_CAP).map((p) => p.id)
}

export function needsPhotos<P extends PhotoCandidate>(
  candidates: readonly P[],
  details: ReadonlyMap<string, { image_details?: readonly ImageDetail[] } | undefined>,
): NeedsPhotos<P> {
  const missing: P[] = []
  let unknown = 0
  for (const p of candidates) {
    if (!(p.images ?? []).length) {
      missing.push(p)
      continue
    }
    const d = details.get(p.id)
    if (!d) unknown++
    else if (!(d.image_details ?? []).some((i) => i.slot === 'main')) missing.push(p)
  }
  return { missing, unknown }
}
