/**
 * The category suggestion before a product is saved (client feedback 11 Nov, item 5), pure part.
 * Contract:
 *   POST /catalog/category-suggestions  (product:import, Idempotency-Key)  {title, description?, brand?, attributes?}
 *     202 {suggestion_id, status: queued}; 200 {status: unavailable} while the switch is off
 *   GET  /catalog/category-suggestions/{suggestion_id}  {status: queued|suggested|unavailable|failed, candidates[≤3]}
 * It runs only when the seller presses "Suggest" (each ask is a model call), from the name and the
 * details typed so far. Kuinn never sets the category: the seller picks a chip.
 * The answer may say `not_listed` (none of the offered categories fits) and `looks_like` (the
 * group the seller's own words point to, when the top pick is in another one). A chip offered only
 * as the closest then reads as unsure, so a forced pick never looks confident.
 */
import type { Schema } from '@/api/types'
import { answerDoubt, isForcedPick } from '@/features/assist/category-model'
import type { CategoryGroup } from '@/features/products/categories'

export { looksLikeText, NOT_LISTED_TEXT } from '@/features/assist/category-model'

export type DraftSuggestion = Schema<'CategoryDraftSuggestionOut'>
export type DraftCandidate = Schema<'CategoryDraftCandidateOut'>
export type DraftIn = Schema<'CategoryDraftIn'>

/** How often a running suggestion is read, and when the form stops waiting for it. */
export const DRAFT_POLL_MS = 2000
export const DRAFT_WAIT_MS = 90_000

const KEY = /^[a-z][a-z0-9_]{0,63}$/
const TEXT_MAX = 200
const ATTR_MAX = 60
const DESCRIPTION_MAX = 5000

/** The draft the form sends (pure): the name, the brand, the filled attribute values and the description. */
export function draftBody(title: string, brand: string, attrs: Readonly<Record<string, string>>, description = ''): DraftIn {
  const attributes: Record<string, string> = {}
  for (const k of Object.keys(attrs).sort()) {
    const v = (attrs[k] ?? '').trim()
    if (!KEY.test(k) || !v || Object.keys(attributes).length >= ATTR_MAX) continue
    attributes[k] = v.slice(0, TEXT_MAX)
  }
  const b = brand.trim().slice(0, TEXT_MAX)
  const d = description.trim().slice(0, DESCRIPTION_MAX)
  return { title: title.trim().slice(0, 500), ...(b ? { brand: b } : {}), ...(d ? { description: d } : {}), attributes }
}

/** The seller's own extra details as one description line ("Type: Jeans; Rise: Mid"), pure. */
export function extraDescription(extra: readonly { key: string; value: string }[]): string {
  return extra
    .map((x) => [x.key.trim(), x.value.trim()] as const)
    .filter(([k, v]) => k && v)
    .map(([k, v]) => `${k}: ${v}`)
    .join('; ')
}

export type DraftView =
  | { kind: 'idle' }
  | { kind: 'asking' }
  | { kind: 'chips'; candidates: DraftCandidate[]; notListed: boolean; looksLike: CategoryGroup | null }
  | { kind: 'none'; notListed: boolean; looksLike: CategoryGroup | null }
  | { kind: 'unavailable' }
  | { kind: 'failed'; message: string }

/** The view for the latest answer (pure). Highest confidence first, as the backend sends them. */
export function draftView(answer: DraftSuggestion | null | undefined, asking: boolean): DraftView {
  if (asking || answer?.status === 'queued') return { kind: 'asking' }
  if (!answer) return { kind: 'idle' }
  if (answer.status === 'unavailable') return { kind: 'unavailable' }
  if (answer.status === 'failed') return { kind: 'failed', message: 'Kuinn couldn’t suggest a category this time. Choose one, or try again.' }
  const sorted = [...(answer.candidates ?? [])].sort((a, b) => b.confidence - a.confidence)
  const d = answerDoubt(answer.not_listed, answer.looks_like, sorted[0]?.category)
  const { notListed, looksLike } = d
  const candidates = sorted.map((c) => (isForcedPick(c.category, d) && !c.unsure ? { ...c, unsure: true } : c))
  return candidates.length ? { kind: 'chips', candidates, notListed, looksLike } : { kind: 'none', notListed, looksLike }
}
