/**
 * SI14 category suggestion, pure part. Contract:
 *   GET  /products/{id}  `category_suggest_enabled`, `suggestions.category` {status, candidates[≤3]}
 *   POST /products/{id}/category-suggestion  (product:import, Idempotency-Key, no body)
 *     202 queued + job, 200 suggested|confirmed|overridden (stored), 200 unavailable (switched off)
 *   PATCH /products/{id} {category}: the seller's choice. The model never sets the category.
 * A product created without a category while the switch is on is classified once, on its own.
 */
import type { Schema } from '@/api/types'

export type CategorySuggestion = Schema<'CategorySuggestionOut'>
export type CategoryCandidate = Schema<'CategoryCandidateOut'>

/** At or above this the backend opens no review task (PLAN A). */
export const CONFIDENT = 0.8

/** How long after a create the automatic suggestion is waited for before offering to ask. */
export const AUTO_WAIT_MS = 2 * 60_000

export type SuggestView =
  /** Switched off, a variant, or the product already has a category: nothing new shows. */
  | { kind: 'hidden' }
  /** Just created: Kuinn is reading it (the create queued a suggestion). */
  | { kind: 'waiting' }
  /** No suggestion yet: the seller may ask for one. */
  | { kind: 'ask' }
  | { kind: 'candidates'; candidates: CategoryCandidate[] }
  /** Kuinn has no confident answer (or none at all): the seller picks. `failed` may be retried. */
  | { kind: 'none'; failed: boolean }

type SuggestInput = {
  category?: string | null
  category_suggest_enabled?: boolean
  parent_product_id?: string | null
  created_at: string
  suggestions?: { category?: CategorySuggestion | null } | null
}

export function suggestView(p: SuggestInput, now: number): SuggestView {
  if (!p.category_suggest_enabled || p.category || p.parent_product_id) return { kind: 'hidden' }
  const s = p.suggestions?.category ?? null
  if (!s || s.status === 'confirmed' || s.status === 'overridden') {
    const age = now - Date.parse(p.created_at)
    return !s && age >= 0 && age < AUTO_WAIT_MS ? { kind: 'waiting' } : { kind: 'ask' }
  }
  const candidates = [...(s.candidates ?? [])].sort((a, b) => b.confidence - a.confidence)
  if (s.status === 'suggested' && candidates.length) return { kind: 'candidates', candidates }
  return { kind: 'none', failed: s.status === 'failed' }
}

/** 0.874 -> "87%". */
export const formatConfidence = (c: number) => `${Math.round(Math.min(1, Math.max(0, c)) * 100)}%`

/** A calm word for the confidence, so the number is never read alone. */
export function confidenceWord(c: number): 'Likely' | 'Possible' | 'Unsure' {
  if (c >= CONFIDENT) return 'Likely'
  if (c >= 0.5) return 'Possible'
  return 'Unsure'
}

/** Whether a choice confirms one of Kuinn's candidates or overrides them (the backend records which). */
export const isCandidate = (slug: string, candidates: readonly CategoryCandidate[]) => candidates.some((c) => c.category === slug)
