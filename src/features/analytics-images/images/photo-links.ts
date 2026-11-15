/**
 * G2: the product's photos from its spreadsheet links (GET /products/{id} `photo_links`, detail
 * only). A style lists its colours' links too (`colourway_id` set); a variant's own list is empty.
 * Dismissed links are never sent. Pure helpers for the Media tab's panel (./photo-links.tsx).
 */
import type { Schema } from '@/api/types'
import { isPhotoProblem, isPhotoWaiting } from '@/features/imports/row-errors'

export type PhotoLink = Schema<'PhotoLinkResult'>

/** How often the product is read again while its photo links download. */
export const PHOTO_LINKS_POLL_MS = 3_000

/**
 * The links one colour section shows: that colour's own, or (`colourwayId` null) the links with no
 * colour and those whose colour is not one of `colourwayIds` (they go with the main section).
 */
export function linksFor(links: readonly PhotoLink[], colourwayId: string | null, colourwayIds: ReadonlySet<string>): PhotoLink[] {
  return links.filter((l) => {
    const cw = l.colourway_id ?? null
    if (colourwayId === null) return cw === null || !colourwayIds.has(cw)
    return cw === colourwayId
  })
}

export interface PhotoLinksSummary {
  /** Queued or downloading. */
  waiting: number
  /** Failed or skipped, in the file's order. */
  problems: PhotoLink[]
  /** Any problem a retry would download again. */
  retryable: boolean
}

export function summarizeLinks(links: readonly PhotoLink[]): PhotoLinksSummary {
  const problems = links.filter(isPhotoProblem).sort((a, b) => a.position - b.position)
  return { waiting: links.filter(isPhotoWaiting).length, problems, retryable: problems.some((l) => l.retryable) }
}

/** "Downloading 3 photos from your file…" */
export const downloadingText = (n: number) => `Downloading ${n.toLocaleString('en-IN')} ${n === 1 ? 'photo' : 'photos'} from your file…`

/** The saved photos that came from the file, by image id (for the "From your file" tag). */
export function fromFileImageIds(links: readonly PhotoLink[]): Set<string> {
  return new Set(links.flatMap((l) => (l.status === 'saved' && l.image_id ? [l.image_id] : [])))
}

/** The product read again every few seconds while any of its links still downloads. */
export function photoLinksDelay(p: { photo_links_pending?: boolean } | null | undefined): number | false {
  return p?.photo_links_pending ? PHOTO_LINKS_POLL_MS : false
}
