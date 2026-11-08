/** Images picked for a product that is not saved yet (see ./new-images.tsx). */
import { newIdempotencyKey } from '@/api/idempotency'
import { validateImageFile, type ImageRole, type ImageSlot } from '@/features/analytics-images/images/report'

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
  /** SI12: Back or Close-up (secondary slot only). */
  role: ImageRole | null
  /** Idempotency-Key for the after-save upload; reused when it is retried. */
  multipartKey: string
  stage: PendingStage
}

export function newPendingImage(file: File, slot: ImageSlot, role: ImageRole | null = null): PendingImage {
  const problem = validateImageFile(file)
  return {
    localId: newIdempotencyKey(),
    file,
    previewUrl: URL.createObjectURL(file),
    slot,
    role: slot === 'secondary' ? role : null,
    multipartKey: newIdempotencyKey(),
    stage: problem ? { kind: 'invalid', message: problem } : { kind: 'queued' },
  }
}


/**
 * The pending images after adding `added` to one tile: Front, Back, Close-up and Size chart each
 * hold one photo, so a valid new one replaces the tile's old one. "More photos" keep adding.
 * Returns the kept list and the ones dropped (their preview URLs are revoked by the caller).
 */
export function placePending(list: readonly PendingImage[], added: readonly PendingImage[]): { next: PendingImage[]; dropped: PendingImage[] } {
  const single = (i: Pick<PendingImage, 'slot' | 'role'>) => i.slot === 'main' || i.slot === 'size_chart' || (i.slot === 'secondary' && !!i.role)
  const valid = added.filter((a) => a.stage.kind !== 'invalid')
  const replaces = (old: PendingImage) => valid.some((a) => single(a) && a.slot === old.slot && a.role === old.role)
  const dropped = list.filter(replaces)
  const next = [...list.filter((i) => !dropped.includes(i)), ...added].slice(0, 20)
  return { next, dropped }
}
