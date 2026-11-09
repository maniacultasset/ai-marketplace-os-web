/**
 * Image candidates (SI7): an AI white background, a zero-token framing fix, or a size-chart image
 * drawn from the product's own size data. A candidate is never a product image until the seller
 * uses it. Pure helpers here; hooks in `candidates-api.ts`, UI in `candidate-review.tsx`.
 */
import { isApiError } from '@/api/errors'
import type { Schema } from '@/api/types'
import type { ProductImageDetail } from './colour-groups'

export type Candidate = Schema<'ImageCandidateOut'>
export type CandidateKind = Candidate['kind']
export type CandidateStatus = Candidate['status']
export type FailureReason = NonNullable<Candidate['failure_reason']>
export type CandidateAccepted = Schema<'ImageCandidateAccepted'>

/** What the button says. */
export const ACTION_LABEL: Record<CandidateKind, string> = {
  white_background: 'Make white background',
  fix: 'Fix framing',
  size_chart: 'Make size chart image',
}

/** The calm progress line while a candidate is being made (loading text ends with "…"). */
export const WORKING_LABEL: Record<CandidateKind, string> = {
  white_background: 'Making a white background…',
  fix: 'Fixing the framing…',
  size_chart: 'Drawing your size chart…',
}

/** The label over the candidate in the review panel. */
export const RESULT_LABEL: Record<CandidateKind, string> = {
  white_background: 'AI white background',
  fix: 'Framed',
  size_chart: 'Made from your size chart',
}

/** Plain failure copy (PLAN D20.3, D20.8; CODE-PLAN F5). */
export const FAILURE_COPY: Record<FailureReason, string> = {
  fidelity: 'Could not keep the product exactly. Try a different photo.',
  not_white: 'Could not make a clean white background. Try a different photo.',
  too_small: 'Photo too small. Upload at least 800 px.',
  source_unusable: 'This photo cannot be fixed automatically. Upload another.',
  no_size_chart: 'Add a size chart first.',
  model_failed: 'Something went wrong. Try again later.',
  credit_used_up: 'AI credit used up.',
  budget: 'Daily AI image limit reached. Try tomorrow.',
  source_changed: 'The photo changed since this was made. Try again.',
}

/** Failures worth a retry right away (the backend never caches them). */
export const RETRYABLE: ReadonlySet<FailureReason> = new Set(['model_failed', 'source_changed'])

export const AI_LIMIT_COPY = FAILURE_COPY.budget
export const AI_OFF_COPY = 'AI image editing is switched off right now.'
export const AI_HINT = 'Uses AI. Counts toward your daily limit.'
export const FREE_HINT = 'Free. Does not use AI.'
export const CACHE_HIT_COPY = 'Made before, so no new cost.'

/** Badge for an image that came from a candidate; null for the seller's own photo. */
export function originBadge(d: Pick<ProductImageDetail, 'origin' | 'slot'> | undefined): string | null {
  if (!d || !d.origin || d.origin === 'seller') return null
  if (d.origin === 'generated') return RESULT_LABEL.white_background
  return d.slot === 'size_chart' ? RESULT_LABEL.size_chart : RESULT_LABEL.fix
}

/** Image ids that an accepted candidate was made from: the original, kept as an extra image. */
export function keptOriginals(details: readonly ProductImageDetail[] | undefined): Set<string> {
  const live = new Set((details ?? []).map((d) => d.image_id))
  const out = new Set<string>()
  for (const d of details ?? []) if (d.parent_image_id && live.has(d.parent_image_id)) out.add(d.parent_image_id)
  return out
}

/** A product read from a backend with image candidates carries `fixes`/`origin` on its images (Inbox links). */
export function supportsCandidates(details: readonly ProductImageDetail[] | undefined): boolean {
  return (details ?? []).some((d) => 'fixes' in d || 'origin' in d)
}

const OPEN: ReadonlySet<CandidateStatus> = new Set(['queued', 'ready', 'failed'])

/**
 * The newest candidate per kind for one source (or for the size chart when `sourceId` is null)
 * that still needs the seller: queued, ready or failed. Accepted and discarded ones are done.
 * The list is newest first (the API's order); `hidden` are failures the seller closed.
 */
export function openCandidates(
  list: readonly Candidate[] | undefined,
  sourceId: string | null,
  hidden: ReadonlySet<string> = new Set(),
): Candidate[] {
  const seen = new Set<CandidateKind>()
  const out: Candidate[] = []
  for (const c of list ?? []) {
    const forSource = sourceId === null ? c.kind === 'size_chart' : c.kind !== 'size_chart' && c.source_image_id === sourceId
    if (!forSource || seen.has(c.kind)) continue
    seen.add(c.kind)
    if (OPEN.has(c.status) && !hidden.has(c.id)) out.push(c)
  }
  return out
}

export const anyQueued = (list: readonly Candidate[] | undefined) => (list ?? []).some((c) => c.status === 'queued')

const utcDay = (iso: string) => iso.slice(0, 10)

/**
 * The daily AI limit is hit when today's (UTC) newest AI candidate was refused for `budget`.
 * The limit itself is a server setting, so the screen never prints a number.
 */
export function aiLimitHit(list: readonly Candidate[] | undefined, now: Date = new Date()): boolean {
  const newest = (list ?? []).find((c) => c.kind === 'white_background')
  if (!newest || utcDay(newest.created_at) !== now.toISOString().slice(0, 10)) return false
  return newest.status === 'failed' && newest.failure_reason === 'budget'
}

/** A create answered from the cache: ready at once, no job, no new cost. */
export const isCacheHit = (a: CandidateAccepted) => a.status === 'ready' && !a.job_id

/** A refusal at create that means the AI switch is off (422 at `kind` for a white background). */
export function isAiOff(error: unknown, kind: CandidateKind): boolean {
  return kind === 'white_background' && isApiError(error) && error.status === 422 && fieldIs(error, 'kind')
}

function fieldIs(error: { details: readonly { loc: readonly (string | number)[] }[] }, field: string) {
  return error.details.some((d) => d.loc[d.loc.length - 1] === field)
}

export type CandidateOp = 'create' | 'accept' | 'discard'

/** Plain words for a refused create, accept or discard; null to fall back to the shared copy. */
export function candidateErrorCopy(error: unknown, kind: CandidateKind, op: CandidateOp = 'create'): string | null {
  if (!isApiError(error)) return null
  if (op !== 'create') {
    if (error.status === 404) return 'This suggestion is gone.'
    if (error.status === 409)
      return op === 'accept' ? 'Already used or the photo changed. Showing the latest.' : 'Already used or discarded. Showing the latest.'
    return null
  }
  if (isAiOff(error, kind)) return AI_OFF_COPY
  if (error.status === 422 && kind === 'size_chart') return 'This size chart cannot be drawn as an image. Check its sizes.'
  if (error.status === 422 && fieldIs(error, 'source_image_id')) return 'This photo is still being checked. Try again in a minute.'
  if (error.status === 404) return 'This photo is no longer the main image.'
  return null
}

/** The list call says the backend has no image candidates (before SI7): 404 or 405. */
export function candidatesUnsupported(error: unknown): boolean {
  return isApiError(error) && (error.status === 404 || error.status === 405)
}

export const ALREADY_IN_USE_COPY = 'Already in use.'
