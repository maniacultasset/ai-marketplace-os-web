/**
 * Fact questions in the Inbox (SI3): which tasks the seller can answer here, the input each
 * AnswerSpec takes, and the same checks the backend runs before it accepts an answer
 * (`services/tasks.py` `_answer_value`). Pure: no React, no network, unit tested.
 *
 * Contract: `TaskOut.expected_answer` is the AnswerSpec `{kind, allowed_values?, unit?, min?, max?,
 * max_length?}` (DATABASE.md §5.7). `POST /tasks/{task_id}/answer` takes `{value}` or `{skip: true}`:
 * `value` is one string (≤ 2000), boolean or number. A list is not accepted yet, so `multi_enum`
 * cannot be answered over HTTP.
 */
import { isApiError } from '@/api/errors'
import type { Schema } from '@/api/types'
import { COMPOSITION_REASON_MSG, moneyProblem, normalizeMoney, parseComposition } from '@/features/products/intake-model'

type Task = Schema<'TaskOut'>
export type AnswerValue = string | number | boolean

/** The fact kinds `tasks_answer` takes (backend FACT_KINDS). */
export const FACT_KINDS = ['missing_fact', 'conflicting_facts'] as const satisfies readonly Task['kind'][]
const FACT_TARGET = /^facts\.attributes\.([a-z0-9_]{1,64})$/
/** `TaskAnswerIn.value` string limit. */
export const MAX_ANSWER_CHARS = 2000
/** A piece count is always a whole number 1..50 (backend `ANSWER_MAX_PIECES`), whatever the spec. */
export const MAX_PIECES = 50

/** The attribute key a fact question is about, or null when `tasks_answer` would refuse the task. */
export function factKey(task: Pick<Task, 'kind' | 'product_id' | 'target_path'>): string | null {
  if (!(FACT_KINDS as readonly string[]).includes(task.kind) || !task.product_id) return null
  return FACT_TARGET.exec(task.target_path ?? '')?.[1] ?? null
}

export const isFactQuestion = (task: Pick<Task, 'kind' | 'product_id' | 'target_path'>) => factKey(task) !== null

/** A fact question the photo check opened: it carries the photo, or a suggestion read from one. */
export function isPhotoQuestion(task: Pick<Task, 'kind' | 'product_id' | 'target_path' | 'image_id' | 'suggestions'>): boolean {
  if (!isFactQuestion(task)) return false
  if (task.image_id) return true
  return task.suggestions.some((s) => !!s && typeof s === 'object' && 'evidence_ref' in s && typeof s.evidence_ref === 'string' && s.evidence_ref.startsWith('image:'))
}

/** An issue as far as blocking goes: an open error linked to a question holds its listing back. */
export type LinkedIssue = { human_task_id?: string | null; severity: string; status: string }

/**
 * The photo a task is about: its `image_id`, else the first `image:<id>` evidence of a photo
 * suggestion. Null when it names none.
 */
export function taskImageId(task: Pick<Task, 'image_id' | 'suggestions'>): string | null {
  if (task.image_id) return task.image_id
  for (const s of task.suggestions) {
    if (s && typeof s === 'object' && 'evidence_ref' in s && typeof s.evidence_ref === 'string' && s.evidence_ref.startsWith('image:'))
      return s.evidence_ref.slice('image:'.length) || null
  }
  return null
}

/**
 * Whether a task holds a listing back. A photo question never blocks by itself (SI3 decision 9),
 * but when the backend links an open blocking error to it (issue sync reuses it as the fact
 * question), answering it is what clears that block. If the API ever sends `blocking`, that wins.
 */
export function isBlockingTask(
  task: Pick<Task, 'kind' | 'product_id' | 'target_path' | 'image_id' | 'suggestions'> & { id?: string },
  issues: readonly LinkedIssue[] = [],
): boolean {
  const flag = (task as { blocking?: unknown }).blocking
  if (typeof flag === 'boolean') return flag
  if (!isPhotoQuestion(task)) return true
  return !!task.id && issues.some((i) => i.human_task_id === task.id && i.severity === 'error' && i.status === 'open')
}

/* ------------------------------------------------------------------------------ Suggestions */

export type SuggestionFrom = 'photo' | 'you' | 'other'

export interface Suggestion {
  value: AnswerValue
  label: string
  from: SuggestionFrom
}

/**
 * `TaskOut.suggestions` (`[{value, label, source, evidence_ref?}]`, typed `list[Any]`): the ones
 * with a scalar value. `ai` with photo evidence is "photo"; `seller` is the seller's current value.
 */
export function taskSuggestions(task: Pick<Task, 'suggestions'>): Suggestion[] {
  const out: Suggestion[] = []
  for (const s of task.suggestions) {
    if (!s || typeof s !== 'object' || !('value' in s)) continue
    const value = (s as { value: unknown }).value
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') continue
    const rawLabel = (s as { label?: unknown }).label
    const label = typeof rawLabel === 'string' && rawLabel.trim() ? rawLabel.trim() : String(value)
    const source = (s as { source?: unknown }).source
    const ref = (s as { evidence_ref?: unknown }).evidence_ref
    const from: SuggestionFrom =
      source === 'seller' ? 'you' : source === 'ai' && typeof ref === 'string' && ref.startsWith('image:') ? 'photo' : 'other'
    out.push({ value, label, from })
  }
  return out
}

/* ------------------------------------------------------------------------------- AnswerSpec */

export type AnswerSpec =
  | { kind: 'enum'; allowed: string[] }
  | { kind: 'multi_enum'; allowed: string[] }
  | { kind: 'text'; maxLength: number | null }
  | { kind: 'number'; min: number | null; max: number | null; integer: boolean; unit: string | null }
  | { kind: 'boolean' }
  | { kind: 'money_inr' }
  | { kind: 'percent_composition' }
  | { kind: 'acknowledge' }
  /** `file`, `reconnect`, a missing or an unknown kind: nothing to send from the Inbox. */
  | { kind: 'unsupported'; raw: string | null }

const real = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** `expected_answer` → a typed spec. A piece count is a whole number 1..50 whatever it says. */
export function parseAnswerSpec(expected: unknown, key: string | null): AnswerSpec {
  if (key === 'number_of_pieces') return { kind: 'number', min: 1, max: MAX_PIECES, integer: true, unit: null }
  const e = expected && typeof expected === 'object' ? (expected as Record<string, unknown>) : {}
  const kind = typeof e.kind === 'string' ? e.kind : null
  const allowed = Array.isArray(e.allowed_values) ? e.allowed_values.filter((x): x is string => typeof x === 'string') : []
  switch (kind) {
    case 'enum':
    case 'multi_enum':
      return { kind, allowed }
    case 'text':
      return { kind: 'text', maxLength: real(e.max_length) ? e.max_length : null }
    case 'number':
      return { kind: 'number', min: real(e.min) ? e.min : null, max: real(e.max) ? e.max : null, integer: false, unit: typeof e.unit === 'string' ? e.unit : null }
    case 'boolean':
    case 'money_inr':
    case 'percent_composition':
    case 'acknowledge':
      return { kind }
    default:
      return { kind: 'unsupported', raw: kind }
  }
}

/**
 * How the Inbox can answer a spec: an input, one acknowledge button (sent as `skip`, the only body
 * the backend takes for it), or read only, with the reason.
 */
export function answerMode(spec: AnswerSpec): { mode: 'input' } | { mode: 'acknowledge' } | { mode: 'read-only'; reason: string } {
  if (spec.kind === 'acknowledge') return { mode: 'acknowledge' }
  if (spec.kind === 'multi_enum') return { mode: 'read-only', reason: 'Questions with more than one answer can’t be answered here yet. Set it on the product page.' }
  if (spec.kind === 'enum' && spec.allowed.length === 0) return { mode: 'read-only', reason: 'This question has no options to pick from yet.' }
  if (spec.kind === 'unsupported') return { mode: 'read-only', reason: 'This question can’t be answered here yet.' }
  return { mode: 'input' }
}

/** The backend's `fold`: NFKC, case-insensitive, dashes and `_` as spaces, spaces collapsed. */
export function fold(text: string): string {
  return text
    .normalize('NFKC')
    .toLocaleLowerCase('en')
    .replace(/[\p{Pd}−_]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .join(' ')
}

export type Checked = { ok: true; value: AnswerValue } | { ok: false; error: string }

const fail = (error: string): Checked => ({ ok: false, error })
const NUMBER = /^[+-]?(\d+(\.\d+)?|\.\d+)$/

/**
 * Check one draft answer the way the backend will, and return the value to send. `draft` is what
 * the input holds: the picked option or the typed text, or a boolean for Yes/No.
 */
export function checkAnswer(spec: AnswerSpec, draft: string | boolean | null): Checked {
  switch (spec.kind) {
    case 'enum': {
      if (typeof draft !== 'string' || !draft.trim()) return fail('Pick one.')
      const hits = spec.allowed.filter((a) => fold(a) === fold(draft))
      return hits.length === 1 ? { ok: true, value: hits[0]! } : fail('Pick one of the options.')
    }
    case 'text': {
      const t = typeof draft === 'string' ? draft.trim() : ''
      if (!t) return fail('Type an answer.')
      const limit = Math.min(spec.maxLength ?? MAX_ANSWER_CHARS, MAX_ANSWER_CHARS)
      if (t.length > limit) return fail(`Keep it to ${limit} characters or fewer.`)
      return { ok: true, value: t }
    }
    case 'number': {
      const t = typeof draft === 'string' ? draft.trim().replace(/,/g, '') : ''
      if (!t) return fail('Enter a number.')
      if (!NUMBER.test(t)) return fail(spec.integer ? 'Enter a whole number, like 3.' : 'Enter a number, like 3 or 2.5.')
      const n = Number(t)
      if (!Number.isFinite(n)) return fail('Enter a smaller number.')
      if (spec.integer && !Number.isInteger(n)) return fail('Enter a whole number, like 3.')
      if (spec.min !== null && n < spec.min) return fail(`Enter ${spec.min} or more.`)
      if (spec.max !== null && n > spec.max) return fail(`Enter ${spec.max} or less.`)
      return { ok: true, value: n }
    }
    case 'boolean':
      return typeof draft === 'boolean' ? { ok: true, value: draft } : fail('Pick Yes or No.')
    case 'money_inr': {
      const raw = typeof draft === 'string' ? draft : ''
      if (!raw.trim()) return fail('Enter an amount.')
      const problem = moneyProblem(raw, 'the amount')
      return problem ? fail(problem) : { ok: true, value: normalizeMoney(raw) }
    }
    case 'percent_composition': {
      const t = typeof draft === 'string' ? draft.trim() : ''
      if (!t) return fail('Type the fabric mix, like 95% Cotton, 5% Elastane.')
      if (t.length > MAX_ANSWER_CHARS) return fail(`Keep it to ${MAX_ANSWER_CHARS} characters or fewer.`)
      const parsed = parseComposition(t)
      return parsed.ok ? { ok: true, value: t } : fail(COMPOSITION_REASON_MSG[parsed.reason])
    }
    case 'multi_enum':
    case 'acknowledge':
    case 'unsupported':
      return fail('This question can’t be answered here yet.')
  }
}

/** The answer as the seller reads it back: "V-neck", "Yes", "₹1,299", "3". */
export function answerText(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') return value.charAt(0).toLocaleUpperCase('en') + value.slice(1)
  return ''
}

/* ------------------------------------------------------------------------------ Failures */

export type AnswerFailure =
  /** 422 at `value`: show it under the input. */
  | { kind: 'field'; message: string }
  /** 409 INVALID_STATUS_TRANSITION: someone else answered, or the question was closed. */
  | { kind: 'closed'; message: string }
  | { kind: 'error'; message: string }

export function answerFailure(err: unknown): AnswerFailure {
  if (isApiError(err)) {
    if (err.status === 422 && err.details.some((d) => d.loc[d.loc.length - 1] === 'value'))
      return { kind: 'field', message: 'This answer doesn’t fit the question. Check it and try again.' }
    if (err.type === 'INVALID_STATUS_TRANSITION')
      return { kind: 'closed', message: 'This question was already answered or closed. The list now shows its latest state.' }
    if (err.status === 404) return { kind: 'closed', message: 'This question no longer exists. The list has been refreshed.' }
    if (err.status === 0) return { kind: 'error', message: 'Can’t reach the server. Your answer is still here; try again.' }
    if (err.status === 403) return { kind: 'error', message: 'You can’t answer questions with your role.' }
  }
  return { kind: 'error', message: 'Couldn’t save your answer. Try again.' }
}
