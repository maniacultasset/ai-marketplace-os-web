/**
 * Optimistic concurrency (handover §8): `GET /tenants/me` and `GET /listings/{id}` answer with an
 * `ETag` header (a quoted version id, e.g. `"9d1c…"`); the matching PATCH must send it back
 * unchanged as `If-Match`. A stale one is 409 `STALE_VERSION`: re-read, show the new data, let the
 * user redo the change. Never retry blindly.
 *
 *   // read: keep the ETag next to the body in the query cache
 *   useQuery({ queryKey: keys.brand.profile(), queryFn: () => unwrapVersioned(api.GET('/tenants/me')) })
 *
 *   // write
 *   const next = await unwrapVersioned(
 *     api.PATCH('/tenants/me', { body, headers: ifMatchHeader(q.data.etag) }),
 *   )
 *   qc.setQueryData(keys.brand.profile(), next)            // the new ETag rides along
 *
 *   // 409
 *   if (isStaleVersion(err)) { await qc.invalidateQueries({ queryKey: keys.brand.profile() }); … }
 */
import { isApiError, toApiError, asApiError, type ApiError } from './errors'

/** A response body plus the `ETag` it was served with (null when the server sent none). */
export interface Versioned<T> {
  data: T
  etag: string | null
}

/** `If-Match` wants the exact quoted form. Accept a bare id too and quote it. */
export function normalizeEtag(raw: string | null | undefined): string | null {
  if (!raw) return null
  let v = raw.trim()
  if (v.startsWith('W/')) v = v.slice(2)
  if (!v) return null
  return v.startsWith('"') && v.endsWith('"') && v.length >= 2 ? v : `"${v.replace(/"/g, '')}"`
}

/** The `ETag` header of a response, quoted, or null. */
export function readEtag(response: Response): string | null {
  return normalizeEtag(response.headers.get('ETag'))
}

/** Fallback when a body names the version (ListingDetail.current_version_id). */
export function etagFromVersionId(versionId: string | null | undefined): string | null {
  return normalizeEtag(versionId ?? null)
}

/**
 * Header object for a guarded PATCH: `{ 'If-Match': '"<id>"' }`. Throws when no ETag is known,
 * because the backend answers a missing If-Match with 422 (a client bug, not a user error).
 */
export function ifMatchHeader(etag: string | null | undefined): { 'If-Match': string } {
  const v = normalizeEtag(etag)
  if (!v) throw new Error('ifMatchHeader: no ETag. Read the resource (GET) before editing it.')
  return { 'If-Match': v }
}

interface FetchResult<T> {
  data?: T
  error?: unknown
  response: Response
}

/** Like `unwrap()`, but also returns the response's `ETag`. Throws ApiError on failure. */
export async function unwrapVersioned<T>(call: Promise<FetchResult<T>>): Promise<Versioned<T>> {
  let result: FetchResult<T>
  try {
    result = await call
  } catch (e) {
    throw asApiError(e)
  }
  const { data, error, response } = result
  if (!response.ok || error !== undefined) throw toApiError(response, error)
  return { data: data as T, etag: readEtag(response) }
}

/** 409 STALE_VERSION: someone saved first (or the approved version is no longer current). */
export function isStaleVersion(e: unknown): e is ApiError {
  return isApiError(e) && e.type === 'STALE_VERSION'
}

/** Copy for the stale-version recovery banner/toast. */
export const STALE_VERSION_COPY = {
  title: 'Someone saved a newer version',
  description: 'We loaded the latest version. Review it and make your change again.',
} as const
