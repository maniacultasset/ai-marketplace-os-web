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
  main: 'Main',
  secondary: 'Secondary',
  lifestyle: 'Lifestyle',
  size_chart: 'Size chart',
  packaging_label: 'Packaging label',
}

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
