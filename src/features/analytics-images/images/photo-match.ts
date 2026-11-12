/**
 * Client feedback item 9: does each photo show this product in its colour (`photo_match` on each
 * `image_details` row; null when the check is off or the photo is not a checked product photo).
 *
 *   POST /images/{image_id}/photo-match/keep  (product:import, Idempotency-Key, no body)
 *
 * `checking` while the check runs; `match`; `mismatch` or `unsure` carry the seller's `question`
 * ("Is this photo the Green Cotton Kurta?"): the seller keeps the photo (recorded) or removes it.
 * At approval an unkept mismatch blocks and an unkept unsure warns, so the words say so plainly.
 * `failed` is a photo the check could not read: it blocks nothing.
 */
import type { Schema } from '@/api/types'

export type PhotoMatch = Schema<'PhotoMatchOut'>

export type MatchTone = 'busy' | 'ok' | 'muted' | 'warn'

export interface MatchNote {
  tone: MatchTone
  /** One short line for the row. */
  text: string
  /** The question to answer, with its detail, when the seller has to decide. */
  ask: { question: string; detail: string | null; blocks: boolean } | null
}

const what = (m: PhotoMatch) => (m.colour ? m.colour : 'this product')

/** What a photo's row says about its match, in calm words. Null: nothing to say. */
export function matchNote(m: PhotoMatch | null | undefined): MatchNote | null {
  if (!m) return null
  switch (m.status) {
    case 'checking':
      return { tone: 'busy', text: `Checking it shows ${what(m)}…`, ask: null }
    case 'match':
      return { tone: 'ok', text: m.colour ? `Shows ${m.colour}` : 'Shows this product', ask: null }
    case 'failed':
      return { tone: 'muted', text: 'Not checked for colour', ask: null }
    case 'mismatch':
    case 'unsure': {
      if (m.kept) return { tone: 'muted', text: 'You kept this photo', ask: null }
      const blocks = m.status === 'mismatch'
      const seen = m.seen_colour ? `It looks ${m.seen_colour}.` : null
      const detail = [m.reason, seen].filter(Boolean).join(' ') || null
      return {
        tone: 'warn',
        text: blocks ? 'This photo may be for another colour or product' : 'We could not tell if this photo is right',
        ask: { question: m.question ?? `Is this photo ${what(m)}?`, detail, blocks },
      }
    }
    default:
      return null
  }
}

/** The tile line for a checked photo whose match asks or runs; null keeps the tile's own words. */
export function matchTile(m: PhotoMatch | null | undefined): { status: string; tone: 'busy' | 'warn' } | null {
  if (!m) return null
  if (m.status === 'checking') return { status: 'Checking colour…', tone: 'busy' }
  if ((m.status === 'mismatch' || m.status === 'unsure') && !m.kept) return { status: 'Check this photo below', tone: 'warn' }
  return null
}

/** Photos of one group whose question is still open. */
export function openQuestions(matches: readonly (PhotoMatch | null | undefined)[]): number {
  return matches.filter((m) => !!m && (m.status === 'mismatch' || m.status === 'unsure') && !m.kept).length
}
