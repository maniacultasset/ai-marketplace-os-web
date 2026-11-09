/**
 * Pure image logic: storage keys, client-side file checks, and the compliance report as rows.
 * Backend reference: apps/api/app/services/image_keys.py, apps/api/app/api/v1/schemas/images.py,
 * packages/schemas/src/mkos_schemas/images.py.
 */
import type { Schema } from '@/api/types'

export type ImageSlot = Schema<'ImageSlot'>
export type ImageReport = Schema<'ImageReport'>
export type ImageReportOut = Schema<'ImageReportOut'>
export type ImageCheckName = Schema<'ImageCheck'>['check']
export type ImageContentType = Schema<'UploadUrlRequest'>['content_type']
export type Marketplace = Schema<'Marketplace'>

/** `MAX_IMAGE_BYTES` (10 MiB) in schemas/images.py. */
export const MAX_IMAGE_BYTES = 10_485_760
export const IMAGE_CONTENT_TYPES: readonly ImageContentType[] = ['image/jpeg', 'image/png', 'image/webp']

export const SLOTS: readonly ImageSlot[] = ['main', 'secondary', 'lifestyle', 'size_chart', 'packaging_label']

export const SLOT_LABEL: Record<ImageSlot, string> = {
  main: 'Front',
  secondary: 'Secondary',
  lifestyle: 'Lifestyle',
  size_chart: 'Size chart',
  packaging_label: 'Packaging label',
}

/** SI12: a secondary photo's role. Front is the `main` slot; Size chart is `size_chart`. */
export type ImageRole = NonNullable<Schema<'ImageUploadIn'>['role']>

export const ROLE_LABEL: Record<ImageRole, string> = { back: 'Back', close_up: 'Close-up' }

/** "Back" for a secondary with the back role, else the slot's name. */
export function imageLabel(slot: ImageSlot, role?: ImageRole | null): string {
  return slot === 'secondary' && role ? ROLE_LABEL[role] : SLOT_LABEL[slot]
}

/**
 * SI12 structured photos (client wireframe, 8 Nov): Front (required) and three recommended tiles,
 * Back, Close-up and Size chart. Each is its own drop zone and sends its slot and role.
 */
export type PhotoSlotId = 'front' | 'back' | 'close_up' | 'size_chart'

export interface PhotoSlotDef {
  id: PhotoSlotId
  label: string
  slot: ImageSlot
  role: ImageRole | null
  required: boolean
  /** What the agent reads from it, in the seller's words. */
  hint: string
}

export const PHOTO_SLOTS: readonly PhotoSlotDef[] = [
  { id: 'front', label: 'Front', slot: 'main', role: null, required: true, hint: 'The main photo. Colour, pattern and neckline are read from it.' },
  { id: 'back', label: 'Back', slot: 'secondary', role: 'back', required: false, hint: 'Back details, like a print or a yoke.' },
  { id: 'close_up', label: 'Close-up', slot: 'secondary', role: 'close_up', required: false, hint: 'Texture, print and embroidery up close.' },
  { id: 'size_chart', label: 'Size chart', slot: 'size_chart', role: null, required: false, hint: 'Sizes and measurements can be read from it.' },
]

/** The tiles a product shows: a variant has no size chart (it is the style's). */
export function photoSlotsFor(isVariant: boolean): readonly PhotoSlotDef[] {
  return isVariant ? PHOTO_SLOTS.filter((s) => s.id !== 'size_chart') : PHOTO_SLOTS
}

/** Which tile an image fills, or null for a plain secondary, lifestyle or packaging photo. */
export function photoSlotOf(slot: ImageSlot, role?: ImageRole | null): PhotoSlotId | null {
  if (slot === 'main') return 'front'
  if (slot === 'size_chart') return 'size_chart'
  if (slot === 'secondary' && role) return role
  return null
}

/** Slots offered under "More photos": the extra kinds beyond the four tiles. */
export const MORE_SLOTS: readonly ImageSlot[] = ['secondary', 'lifestyle', 'packaging_label']

/**
 * Slots a product may take. A size chart belongs on a style or a standalone product, never on a
 * variant (`services/images._check_product`: 422 at `slot`).
 */
export function slotsFor(isVariant: boolean): readonly ImageSlot[] {
  return isVariant ? SLOTS.filter((s) => s !== 'size_chart') : SLOTS
}

/** First image goes to `main`; later ones default to `secondary`. */
export function defaultSlot(existingCount: number): ImageSlot {
  return existingCount === 0 ? 'main' : 'secondary'
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const IMAGE_KEY_RE = new RegExp(`^(${UUID})/(${UUID})/images/(${UUID})$`)

/** The image id inside a key `<tenant_id>/<product_id>/images/<image_id>` (`image_keys.IMAGE_KEY_RE`). */
export function imageIdFromKey(key: string): string | null {
  return IMAGE_KEY_RE.exec(key)?.[3] ?? null
}

export function isImageContentType(t: string): t is ImageContentType {
  return IMAGE_CONTENT_TYPES.some((c) => c === t)
}

/** A plain sentence for a file the API would refuse, or null when it may be sent. */
export function validateImageFile(f: { size: number; type: string }): string | null {
  if (!isImageContentType(f.type)) return 'This file type is not supported. Use a JPEG, PNG or WebP image.'
  if (f.size === 0) return 'The file is empty. Choose the image again.'
  if (f.size > MAX_IMAGE_BYTES) return 'The image is over 10 MB. Use a smaller one.'
  return null
}

export const UNREADABLE_IMAGE = 'This file is not a readable image. Choose a JPEG, PNG or WebP photo.'

/**
 * Whether the browser can decode the file: a text file named .jpg passes the type check (the type
 * comes from the extension) but is not a photo. Null when it is readable, or when this browser
 * cannot tell (no createImageBitmap, as in tests): the server check still runs.
 */
export async function checkImageReadable(file: Blob): Promise<string | null> {
  if (typeof createImageBitmap !== 'function') return null
  try {
    const bitmap = await createImageBitmap(file)
    bitmap.close()
    return null
  } catch {
    return UNREADABLE_IMAGE
  }
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export const CHECK_LABEL: Record<ImageCheckName, string> = {
  format: 'File format',
  corruption: 'File integrity',
  resolution: 'Resolution',
  aspect_ratio: 'Aspect ratio',
  file_size: 'File size',
  exif_orientation: 'Orientation',
  background: 'Background',
  fill_ratio: 'Product fill',
  text_overlay: 'Text overlay',
  watermark: 'Watermark',
  logo: 'Logo',
  product_visibility: 'Product visibility',
}

export type CheckOutcome = 'pass' | 'warn' | 'fail'

export interface CheckRow {
  check: ImageCheckName
  label: string
  outcome: CheckOutcome
  method: 'deterministic' | 'vision'
  /** Suggestions from the report's issues on this check. */
  suggestions: string[]
}

/**
 * The report's checks as rows. A failed check is `fail` when the marketplace report does not pass,
 * and `warn` when the report passes anyway (the check did not block this marketplace). Issues with
 * no matching check still appear, as failed rows, so no suggestion is dropped.
 */
export function checkRows(report: ImageReport): CheckRow[] {
  const issues = report.issues ?? []
  const byCheck = new Map<ImageCheckName, string[]>()
  for (const i of issues) byCheck.set(i.check, [...(byCheck.get(i.check) ?? []), i.suggestion])
  const failed: CheckOutcome = report.pass ? 'warn' : 'fail'
  const rows: CheckRow[] = (report.checks ?? []).map((c) => ({
    check: c.check,
    label: CHECK_LABEL[c.check],
    outcome: c.passed ? 'pass' : failed,
    method: c.method,
    suggestions: byCheck.get(c.check) ?? [],
  }))
  const seen = new Set(rows.map((r) => r.check))
  for (const [check, suggestions] of byCheck) {
    if (!seen.has(check)) rows.push({ check, label: CHECK_LABEL[check], outcome: failed, method: 'deterministic', suggestions })
  }
  const order: Record<CheckOutcome, number> = { fail: 0, warn: 1, pass: 2 }
  return rows.sort((a, b) => order[a.outcome] - order[b.outcome])
}

export function tally(rows: CheckRow[]): Record<CheckOutcome, number> {
  const t: Record<CheckOutcome, number> = { pass: 0, warn: 0, fail: 0 }
  for (const r of rows) t[r.outcome]++
  return t
}

/** A report that passed with a warning on some check (for example the background). */
export function hasWarnings(out: ImageReportOut | undefined): boolean {
  if (!out) return false
  return marketplaceReports(out).some((r) => tally(checkRows(r)).warn > 0)
}

/** A report whose background check did not pass (warning or failure). */
export function backgroundFlagged(out: ImageReportOut | undefined): boolean {
  if (!out) return false
  return marketplaceReports(out).some((r) => checkRows(r).some((c) => c.check === 'background' && c.outcome !== 'pass'))
}

/** The per-marketplace reports present, in enum order. */
export function marketplaceReports(out: ImageReportOut): ImageReport[] {
  const r = out.reports
  return [r?.amazon, r?.flipkart].filter((x): x is ImageReport => !!x)
}

/** Upload progress of one dropped file, before and after the 202. */
export type UploadStage =
  | { kind: 'invalid'; message: string }
  | { kind: 'uploading' }
  | { kind: 'failed'; error: unknown }
  | { kind: 'accepted'; imageId: string; jobId: string }

export function stageLabel(stage: UploadStage): string {
  switch (stage.kind) {
    case 'invalid':
      return stage.message
    case 'uploading':
      return 'Uploading…'
    case 'failed':
      return 'Upload failed'
    case 'accepted':
      return 'Queued: processing starts soon'
  }
}
