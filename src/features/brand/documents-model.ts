/**
 * Brand documents (pure). Mirrors .backend apps/api/app/services/brand_documents.py and
 * app/api/v1/routers/brand.py + schemas/brand.py:
 *   - `.txt` or `.md` by extension, UTF-8 text, no NUL, at most 10 MiB (10_485_760 bytes)
 *   - multipart part `file` plus form field `type` (`tone_rule` default, `glossary`, `compliance`)
 *   - caps: 2 documents processing at once, 50 live documents (429 RATE_LIMITED)
 *   - status: uploaded (queued) -> processing -> ready | failed
 */
import { describeError, type ApiError } from '@/api/errors'
import type { Schema } from '@/api/types'

export type BrandDocument = Schema<'BrandDocumentOut'>
export type DocumentStatus = BrandDocument['status']
export type ChunkType = Schema<'Body_brand_documents_upload'>['type']

export const MAX_DOCUMENT_BYTES = 10_485_760
export const MAX_LIVE_DOCUMENTS = 50
export const LIVE_DOCUMENT_JOBS = 2
export const FILENAME_MAX = 255
export const DOCUMENT_EXTENSIONS = ['.txt', '.md'] as const
/** react-dropzone `accept`; the backend decides by extension only. */
export const DOCUMENT_ACCEPT: Record<string, string[]> = { 'text/plain': ['.txt'], 'text/markdown': ['.md'] }

export const CHUNK_TYPES: readonly { value: ChunkType; label: string; description: string }[] = [
  { value: 'tone_rule', label: 'Tone and style', description: 'How the brand writes: voice, phrasing, do and don’t.' },
  { value: 'glossary', label: 'Glossary', description: 'Terms to use and terms to avoid.' },
  { value: 'compliance', label: 'Compliance', description: 'Claims and wording the brand must not use.' },
]

export function chunkTypeLabel(t: ChunkType) {
  return CHUNK_TYPES.find((c) => c.value === t)?.label ?? t
}

/** The basename the backend keeps (it strips directories), or null when unusable. */
export function hasAllowedExtension(name: string) {
  const lower = name.toLowerCase()
  return DOCUMENT_EXTENSIONS.some((ext) => lower.endsWith(ext) && lower.length > ext.length)
}

/** Client-side check before upload; the backend repeats every one of these. */
export function checkDocumentFile(f: { name: string; size: number }): string | null {
  if (!hasAllowedExtension(f.name)) return 'Choose a .txt or .md file.'
  if (f.name.length > FILENAME_MAX) return `Rename the file to ${FILENAME_MAX} characters or fewer.`
  if (f.size === 0) return 'The file is empty.'
  if (f.size > MAX_DOCUMENT_BYTES) return `The file is larger than 10 MiB (${formatBytes(f.size)}).`
  return null
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

/** Sentence for a failed upload, by error type (never by message). */
export function uploadErrorMessage(err: ApiError): string {
  switch (err.type) {
    case 'PAYLOAD_TOO_LARGE':
      return 'The file is larger than 10 MiB.'
    case 'VALIDATION_FAILED':
      return 'This file can’t be used. Upload UTF-8 text (.txt or .md) with readable content and no passwords, API keys or tokens.'
    case 'RATE_LIMITED':
      return `Upload limit reached: ${LIVE_DOCUMENT_JOBS} documents are still waiting to be processed, or the brand already has ${MAX_LIVE_DOCUMENTS} documents. Try again ${err.retryAfter ? `in ${retryText(err.retryAfter)}` : 'later'}.`
    case 'IDEMPOTENCY_KEY_REUSED':
      return 'This upload conflicted with an earlier one. Upload again.'
    case 'INVALID_STATUS_TRANSITION':
      return 'This document changed while uploading. Upload again.'
    case 'NETWORK':
      return 'Can’t reach the server. Your file is still selected; upload again when you’re back online.'
    default:
      return describeError(err)
  }
}

function retryText(s: number) {
  if (s < 90) return `${s} s`
  return `${Math.round(s / 60)} min`
}

export interface StatusMeta {
  label: string
  variant: 'muted' | 'brand' | 'success' | 'danger'
  live: boolean
  hint: string
}

export function documentStatusMeta(doc: Pick<BrandDocument, 'status' | 'chunk_count'>): StatusMeta {
  switch (doc.status) {
    case 'uploaded':
      return { label: 'Queued', variant: 'muted', live: true, hint: 'Queued: processing starts soon' }
    case 'processing':
      return { label: 'Processing', variant: 'brand', live: true, hint: 'Splitting into passages…' }
    case 'ready':
      return {
        label: 'Ready',
        variant: 'success',
        live: false,
        hint: `${doc.chunk_count.toLocaleString()} passage${doc.chunk_count === 1 ? '' : 's'} in use`,
      }
    case 'failed':
      return { label: 'Failed', variant: 'danger', live: false, hint: 'Upload the same file again to retry' }
  }
}

export const isPendingDocument = (d: Pick<BrandDocument, 'status'>) => d.status === 'uploaded' || d.status === 'processing'
