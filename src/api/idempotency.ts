import { useCallback, useRef } from 'react'

/** A fresh Idempotency-Key (UUID v4; matches the backend's `^[\x21-\x7E]{1,255}$`). */
export const newIdempotencyKey = () => crypto.randomUUID()

/** Header object for ops that require one: `api.POST(path, { headers: idempotencyHeader(key) })`. */
export const idempotencyHeader = (key: string) => ({ 'Idempotency-Key': key })

/**
 * Ops that REQUIRE an Idempotency-Key.
 * Live today: products_bulk, imports_rows_retry, jobs_cancel.
 */
export const IDEMPOTENT_OPS = [
  'POST /products/bulk',
  'POST /imports/{import_id}/rows/retry',
  'POST /jobs/{job_id}/cancel',
  'POST /brand/documents',
  'POST /listings/generate',
  'POST /listings/approve',
  'POST /listings/publish',
  'POST /listings/{listing_id}/regenerate',
  'POST /listings/{listing_id}/publish/retry-fields',
  'POST /images/upload',
] as const

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
