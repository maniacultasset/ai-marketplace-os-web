/** Images picked for a product that is not saved yet (see ./new-images.tsx). */
import { newIdempotencyKey } from '@/api/idempotency'
import { validateImageFile, type ImageSlot } from '@/features/analytics-images/images/report'

export type PendingStage =
  | { kind: 'invalid'; message: string }
  /** Main image going to the store now. */
  | { kind: 'staging' }
  /** In the store under the minted id; attached by the create. */
  | { kind: 'staged'; productId: string; storageKey: string }
  /** Uploads right after the product is saved. */
  | { kind: 'queued' }
  | { kind: 'uploading' }
  | { kind: 'done' }
  | { kind: 'failed'; error: unknown }

export interface PendingImage {
  localId: string
  file: File
  previewUrl: string
  slot: ImageSlot
  /** Idempotency-Key for the after-save upload; reused when it is retried. */
  multipartKey: string
  stage: PendingStage
}

export function newPendingImage(file: File, slot: ImageSlot): PendingImage {
  const problem = validateImageFile(file)
  return {
    localId: newIdempotencyKey(),
    file,
    previewUrl: URL.createObjectURL(file),
    slot,
    multipartKey: newIdempotencyKey(),
    stage: problem ? { kind: 'invalid', message: problem } : { kind: 'queued' },
  }
}

