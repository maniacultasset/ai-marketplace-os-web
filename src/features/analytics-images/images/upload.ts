/**
 * The image upload, as routers/images.py serves it:
 *
 * 1. POST /images/upload-url {product_id, slot, content_type, bytes} -> a create-only signed PUT
 *    URL plus the headers to send with it (`Content-Type`, `If-None-Match: *`).
 * 2. PUT the bytes to that URL (no bearer token: it is the object store, not the API).
 * 3. POST /images/upload (multipart, Idempotency-Key) with `storage_key` -> 202 ImageAccepted.
 *
 * When the signed step is unavailable (501/5xx, or the browser cannot PUT to the store, e.g. the
 * bucket has no CORS rule for this origin) the file goes up as the multipart `file` part of
 * POST /images/upload instead, and this tab stops trying the signed step.
 */
import { api, unwrap } from '@/api/client'
import { isApiError, isNetworkError } from '@/api/errors'
import { idempotencyHeader, newIdempotencyKey } from '@/api/idempotency'
import type { Schema } from '@/api/types'
import { isImageContentType, type ImageSlot } from './report'

export type ImageAccepted = Schema<'ImageAccepted'>

let signedUnavailable = false

/** Test seam: whether this tab still tries the signed step. */
export const signedStepEnabled = () => !signedUnavailable

export interface UploadInput {
  file: File
  productId: string
  slot: ImageSlot
  /** Idempotency-Key for the multipart path; reused when the same upload is retried. */
  multipartKey: string
}

/** Whether a failed upload-url call should fall back to multipart (the signed step is not served). */
export function signedStepUnavailable(err: unknown): boolean {
  if (!isApiError(err)) return false
  return err.status === 501 || err.status >= 500 || isNetworkError(err)
}

class StorePutFailed extends Error {}

async function putToStore(url: string, headers: Record<string, string>, file: File): Promise<void> {
  let res: Response
  try {
    res = await fetch(url, { method: 'PUT', headers, body: file, credentials: 'omit' })
  } catch {
    throw new StorePutFailed('The browser could not reach the image store.')
  }
  // 412: `If-None-Match: *` found the object already there (a retried PUT); the key is usable.
  if (!res.ok && res.status !== 412) throw new StorePutFailed(`The image store answered ${res.status}.`)
}

function registerKey(productId: string, slot: ImageSlot, storageKey: string, idemKey: string) {
  return unwrap(
    api.POST('/images/upload', {
      params: { header: idempotencyHeader(idemKey) },
      body: { product_id: productId, slot, storage_key: storageKey },
      bodySerializer: (b) => {
        const fd = new FormData()
        fd.append('product_id', b.product_id)
        fd.append('slot', b.slot)
        if (b.storage_key) fd.append('storage_key', b.storage_key)
        return fd
      },
    }),
  )
}

function uploadMultipart({ file, productId, slot, multipartKey }: UploadInput) {
  return unwrap(
    api.POST('/images/upload', {
      params: { header: idempotencyHeader(multipartKey) },
      body: { product_id: productId, slot },
      bodySerializer: (b) => {
        const fd = new FormData()
        fd.append('product_id', b.product_id)
        fd.append('slot', b.slot)
        fd.append('file', file, file.name)
        return fd
      },
    }),
  )
}

export async function uploadImage(input: UploadInput): Promise<ImageAccepted> {
  const { file, productId, slot } = input
  if (!signedUnavailable && isImageContentType(file.type)) {
    let minted: Schema<'UploadUrlOut'> | null = null
    try {
      minted = await unwrap(
        api.POST('/images/upload-url', {
          body: { product_id: productId, slot, content_type: file.type, bytes: file.size },
        }),
      )
    } catch (err) {
      // 404 product, 422 slot, 403 role: the multipart path would fail the same way.
      if (!signedStepUnavailable(err)) throw err
      signedUnavailable = true
    }
    if (minted) {
      try {
        await putToStore(minted.upload_url, minted.headers ?? {}, file)
      } catch (err) {
        if (!(err instanceof StorePutFailed)) throw err
        signedUnavailable = true
        minted = null
      }
    }
    // A fresh signed key is a fresh body, so it gets its own Idempotency-Key.
    if (minted) return registerKey(productId, slot, minted.storage_key, newIdempotencyKey())
  }
  return uploadMultipart(input)
}
