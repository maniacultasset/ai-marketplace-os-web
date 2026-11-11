import { useCallback, useRef } from 'react'

/** A fresh Idempotency-Key (UUID v4; matches the backend's `^[\x21-\x7E]{1,255}$`). */
export const newIdempotencyKey = () => crypto.randomUUID()

/** Header object for ops that require one: `api.POST(path, { headers: idempotencyHeader(key) })`. */
export const idempotencyHeader = (key: string) => ({ 'Idempotency-Key': key })

/**
 * Every op that REQUIRES an Idempotency-Key (handover §7; backend `surface.py` `idempotency=True`).
 * A missing key is 422. One key per user action; reuse it for retries of that action.
 */
export const IDEMPOTENT_OPS = [
  'POST /products/bulk',
  'POST /products/bulk-delete',
  'POST /imports/{import_id}/rows/retry',
  'POST /brand/documents',
  'POST /images/upload',
  'POST /images/{image_id}/photo-match/keep',
  'POST /products/{product_id}/image-candidates',
  'POST /image-candidates/{candidate_id}/accept',
  'POST /image-candidates/{candidate_id}/reject',
  'POST /products/{product_id}/size-chart-read',
  'POST /products/{product_id}/category-suggestion',
  'POST /products/{product_id}/size-run',
  'POST /catalog/category-suggestions',
  'POST /skus/suggestion',
  'POST /imports/column-maps',
  'POST /imports/column-maps/{map_id}/confirm',
  'POST /listings/generate',
  'POST /listings/{listing_id}/regenerate',
  'POST /listings/approve',
  'POST /listings/publish',
  'POST /listings/{listing_id}/publish/retry-fields',
  'POST /listings/{listing_id}/refresh-status',
  'POST /issues/{issue_id}/dismiss',
  'POST /jobs/{job_id}/cancel',
  'POST /tasks/{task_id}/answer',
  'POST /tasks/{task_id}/close',
  'POST /tenants',
] as const

export type IdempotentOp = (typeof IDEMPOTENT_OPS)[number]

/** Whether `METHOD /path/{param}` (template form) requires an Idempotency-Key. */
export const requiresIdempotencyKey = (op: string): op is IdempotentOp =>
  (IDEMPOTENT_OPS as readonly string[]).includes(op)

/**
 * A key stable for one user intent: reuse it for network retries of the same
 * submission; call `reset()` after success, after a 409 IDEMPOTENCY_KEY_REUSED, or when the
 * user changes the input (e.g. picks a different file).
 */
export function useIntentKey() {
  const ref = useRef<string | null>(null)
  const get = useCallback(() => {
    if (!ref.current) ref.current = newIdempotencyKey()
    return ref.current
  }, [])
  const reset = useCallback(() => {
    ref.current = null
  }, [])
  return { get, reset }
}
