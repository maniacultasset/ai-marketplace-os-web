/**
 * AI drafting pause (SI10) and the brand's trial.
 *
 *   GET /auth/me              ai_paused (platform-wide), trial_ends_at (the active brand, null when not on trial)
 *   POST /listings/generate   503 AI_CREDIT_EXHAUSTED | AI_PROVIDER_KEY_INVALID while paused
 *   GET  /admin/ai-credit     platform:admin  the credit, the pause and today's spend
 *   POST /admin/ai-credit/resume  platform:admin  clear the pause (repeatable)
 *
 * Both fields are optional at runtime: an older backend sends neither, and then nothing shows.
 * A refused generate marks the pause right away (before /auth/me is read again); the next
 * /auth/me that says `ai_paused: false` clears that mark.
 */
import { useSyncExternalStore } from 'react'
import { isApiError } from '@/api/errors'
import type { ErrorCode, Me } from '@/api/types'

export const AI_PAUSED_CODES = ['AI_CREDIT_EXHAUSTED', 'AI_PROVIDER_KEY_INVALID'] as const satisfies readonly ErrorCode[]

/** The one sentence everywhere the pause shows (banner, disabled generate buttons). */
export const AI_PAUSED_TEXT = 'AI drafting is paused. Your work is saved.'
/** Tooltip on a generate button while paused. */
export const AI_PAUSED_REASON = 'AI drafting is paused for now. Your products and drafts are saved, and our team is on it.'

export function isAiPausedError(e: unknown): boolean {
  return isApiError(e) && (AI_PAUSED_CODES as readonly string[]).includes(e.type)
}

/* A refused generate, remembered until /auth/me says the pause is over. */
let markedAt: number | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function markAiPaused(at = Date.now()) {
  markedAt = at
  emit()
}
export function clearAiPausedMark() {
  if (markedAt === null) return
  markedAt = null
  emit()
}
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}
const getMark = () => markedAt
export const useAiPausedMark = () => useSyncExternalStore(subscribe, getMark, getMark)

/**
 * Paused when /auth/me says so, or a generate was refused after the last /auth/me read.
 * `meReadAt` is the query's `dataUpdatedAt`.
 */
export function aiPaused(me: Pick<Me, 'ai_paused'> | Partial<Pick<Me, 'ai_paused'>> | undefined, meReadAt: number, mark: number | null): boolean {
  if (me?.ai_paused === true) return true
  return mark !== null && mark > meReadAt
}

/* ------------------------------------------------------------------------------------------- */
/* Trial                                                                                        */
/* ------------------------------------------------------------------------------------------- */

const DAY = 86_400_000

/** Whole days left, rounded up (a trial ending in 3 h has 1 day left); 0 once it has ended. Null when no trial or a bad date. */
export function trialDaysLeft(endsAt: string | null | undefined, now = Date.now()): number | null {
  if (!endsAt) return null
  const end = Date.parse(endsAt)
  if (Number.isNaN(end)) return null
  return Math.max(0, Math.ceil((end - now) / DAY))
}

export function trialLabel(days: number): string {
  if (days <= 0) return 'Trial ends today'
  return days === 1 ? 'Trial: 1 day left' : `Trial: ${days} days left`
}

/** Calm until the last 3 days, then attention. */
export const trialTone = (days: number): 'neutral' | 'attention' => (days <= 3 ? 'attention' : 'neutral')

/* ------------------------------------------------------------------------------------------- */
/* Admin AI credit card                                                                          */
/* ------------------------------------------------------------------------------------------- */

export type CreditState = 'ok' | 'low' | 'paused' | 'unknown'

export const CREDIT_STATE: Record<CreditState, { label: string; chip: 'live' | 'needs-you' | 'paused' | 'draft' }> = {
  ok: { label: 'Credit OK', chip: 'live' },
  low: { label: 'Credit low', chip: 'needs-you' },
  paused: { label: 'AI paused', chip: 'paused' },
  unknown: { label: 'Not checked yet', chip: 'draft' },
}

export const PAUSE_REASON: Record<'credit_exhausted' | 'key_invalid', string> = {
  credit_exhausted: 'The AI credit ran out. Top it up, then resume.',
  key_invalid: 'The AI provider key was refused. Fix the key, then resume.',
}

/** "9.600000" → "$9.60"; null or a bad value → "—". */
export function usd(v: string | null | undefined): string {
  if (v == null) return '—'
  const n = Number(v)
  if (!Number.isFinite(n)) return '—'
  return `$${n.toFixed(2)}`
}
