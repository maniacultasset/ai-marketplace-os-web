/**
 * The image upload, as routers/images.py serves it:
 *
 * 1. POST /images/upload-url {product_id, slot, content_type, bytes} -> a create-only signed PUT
 *    URL plus the headers to send with it (`Content-Type`, `If-None-Match: *`).
 * 2. PUT the bytes to that URL (no bearer token: it is the object store, not the API).
 * 3. POST /images/upload (multipart, Idempotency-Key) with `storage_key` -> 202 ImageAccepted.
 *    `colourway_id` (one of a style's `colourways`) files the image under that colour; only this
 *    step takes it, the upload-url step does not.
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
  /** A colourway of this product (a style): the image is that colour's. Absent: every colour's. */
  colourwayId?: string | null
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

/** The multipart form of POST /images/upload (exported for tests). */
export function uploadForm(b: Schema<'Body_images_upload'>, file?: File): FormData {
  const fd = new FormData()
  fd.append('product_id', b.product_id)
  fd.append('slot', b.slot)
  if (b.colourway_id) fd.append('colourway_id', b.colourway_id)
  if (b.storage_key) fd.append('storage_key', b.storage_key)
  if (file) fd.append('file', file, file.name)
  return fd
}

function registerKey(productId: string, slot: ImageSlot, colourwayId: string | null, storageKey: string, idemKey: string) {
  return unwrap(
    api.POST('/images/upload', {
      params: { header: idempotencyHeader(idemKey) },
      body: { product_id: productId, slot, colourway_id: colourwayId, storage_key: storageKey },
      bodySerializer: (b) => uploadForm(b),
    }),
  )
}

function uploadMultipart({ file, productId, slot, colourwayId, multipartKey }: UploadInput) {
  return unwrap(
    api.POST('/images/upload', {
      params: { header: idempotencyHeader(multipartKey) },
      body: { product_id: productId, slot, colourway_id: colourwayId ?? null },
      bodySerializer: (b) => uploadForm(b, file),
    }),
  )
}

export async function uploadImage(input: UploadInput): Promise<ImageAccepted> {
  const { file, productId, slot } = input
  const colourwayId = input.colourwayId ?? null
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
    if (minted) return registerKey(productId, slot, colourwayId, minted.storage_key, newIdempotencyKey())
  }
  return uploadMultipart(input)
}

/** The signed step is not served here: upload this file the usual way once the product exists. */
export class StageUnavailable extends Error {}

/**
 * An image for a product that does not exist yet (SI1): POST /images/upload-url without
 * `product_id` mints a product id; the bytes go straight to the store. The product is then
 * created with that `id` and `image_uploads: [{storage_key, slot}]`, which registers the image
 * in the same transaction. The backend mints one id per call and knows no product until create,
 * so only one image can be staged this way: the rest upload after create (`uploadImage`).
 */
export async function stageImageForNewProduct(file: File, slot: ImageSlot): Promise<{ productId: string; storageKey: string }> {
  if (signedUnavailable || !isImageContentType(file.type)) throw new StageUnavailable('The signed upload is not available.')
  let minted: Schema<'UploadUrlOut'>
  try {
    minted = await unwrap(api.POST('/images/upload-url', { body: { slot, content_type: file.type, bytes: file.size } }))
  } catch (err) {
    if (signedStepUnavailable(err)) {
      signedUnavailable = true
      throw new StageUnavailable('The signed upload is not available.')
    }
    throw err
  }
  try {
    await putToStore(minted.upload_url, minted.headers ?? {}, file)
  } catch (err) {
    if (!(err instanceof StorePutFailed)) throw err
    signedUnavailable = true
    throw new StageUnavailable(err.message)
  }
  return { productId: minted.product_id, storageKey: minted.storage_key }
}
