/**
 * The category suggestion before a product is saved (client feedback 11 Nov, item 5), pure part.
 * Contract:
 *   POST /catalog/category-suggestions  (product:import, Idempotency-Key)  {title, description?, brand?, attributes?}
 *     202 {suggestion_id, status: queued}; 200 {status: unavailable} while the switch is off
 *   GET  /catalog/category-suggestions/{suggestion_id}  {status: queued|suggested|unavailable|failed, candidates[≤3]}
 * It runs only when the seller presses "Suggest" (each ask is a model call), from the name and the
 * details typed so far. Kuinn never sets the category: the seller picks a chip.
 */
import type { Schema } from '@/api/types'

export type DraftSuggestion = Schema<'CategoryDraftSuggestionOut'>
export type DraftCandidate = Schema<'CategoryDraftCandidateOut'>
export type DraftIn = Schema<'CategoryDraftIn'>

/** How often a running suggestion is read, and when the form stops waiting for it. */
export const DRAFT_POLL_MS = 2000
export const DRAFT_WAIT_MS = 90_000

const KEY = /^[a-z][a-z0-9_]{0,63}$/
const TEXT_MAX = 200
const ATTR_MAX = 60

/** The draft the form sends (pure): the name, the brand and the filled attribute values. */
export function draftBody(title: string, brand: string, attrs: Readonly<Record<string, string>>): DraftIn {
  const attributes: Record<string, string> = {}
  for (const k of Object.keys(attrs).sort()) {
    const v = (attrs[k] ?? '').trim()
    if (!KEY.test(k) || !v || Object.keys(attributes).length >= ATTR_MAX) continue
    attributes[k] = v.slice(0, TEXT_MAX)
  }
  const b = brand.trim().slice(0, TEXT_MAX)
  return { title: title.trim().slice(0, 500), ...(b ? { brand: b } : {}), attributes }
}

export type DraftView =
  | { kind: 'idle' }
  | { kind: 'asking' }
  | { kind: 'chips'; candidates: DraftCandidate[] }
  | { kind: 'none' }
  | { kind: 'unavailable' }
  | { kind: 'failed'; message: string }

/** The view for the latest answer (pure). Highest confidence first, as the backend sends them. */
export function draftView(answer: DraftSuggestion | null | undefined, asking: boolean): DraftView {
  if (asking || answer?.status === 'queued') return { kind: 'asking' }
  if (!answer) return { kind: 'idle' }
  if (answer.status === 'unavailable') return { kind: 'unavailable' }
  if (answer.status === 'failed') return { kind: 'failed', message: 'Kuinn couldn’t suggest a category this time. Choose one, or try again.' }
  const candidates = [...(answer.candidates ?? [])].sort((a, b) => b.confidence - a.confidence)
  return candidates.length ? { kind: 'chips', candidates } : { kind: 'none' }
}
