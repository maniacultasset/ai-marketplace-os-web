const dateTime = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'medium',
})
const timeOnly = new Intl.DateTimeFormat(undefined, { timeStyle: 'medium' })
const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

export function formatDateTime(iso: string | null | undefined) {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : dateTime.format(d)
}

/** Clock time only ("1:18:46 PM"); pair it with formatDateTime in a title. */
export function formatTime(iso: string | null | undefined) {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : timeOnly.format(d)
}

/** "3 minutes ago", "yesterday", … (falls back to the absolute date after a week). */
export function formatRelative(iso: string, now = Date.now()) {
  const d = new Date(iso).getTime()
  if (Number.isNaN(d)) return '—'
  const s = Math.round((d - now) / 1000)
  const abs = Math.abs(s)
  if (abs < 45) return 'just now'
  if (abs < 3600) return rtf.format(Math.round(s / 60), 'minute')
  if (abs < 86_400) return rtf.format(Math.round(s / 3600), 'hour')
  if (abs < 7 * 86_400) return rtf.format(Math.round(s / 86_400), 'day')
  return formatDateTime(iso)
}

/** "1m 05s" between two ISO timestamps (or until now). */
export function formatDuration(fromIso: string | null | undefined, toIso?: string | null) {
  if (!fromIso) return null
  const from = new Date(fromIso).getTime()
  const to = toIso ? new Date(toIso).getTime() : Date.now()
  if (Number.isNaN(from) || Number.isNaN(to)) return null
  const total = Math.max(0, Math.round((to - from) / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  if (m === 0) return `${s}s`
  return `${m}m ${String(s).padStart(2, '0')}s`
}

export const JOB_KIND_LABEL: Record<string, string> = {
  bulk_import: 'CSV import',
  listing_generate: 'Listing generation',
  listing_publish: 'Listing publish',
  listing_status_sync: 'Listing status sync',
  image_compliance: 'Image compliance',
  brand_embed: 'Brand document indexing',
}

/** `/api/v1/imports/<id>` -> `<id>` (job.result_url for bulk_import). */
export function importIdFromResultUrl(url: string | null | undefined) {
  const m = url?.match(/\/imports\/([0-9a-f-]{36})\/?$/i)
  return m ? m[1] : null
}
