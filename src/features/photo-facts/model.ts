/**
 * Photo facts (SI3): the details the backend read from the product photos, as the product page
 * shows them. Pure: no React, no network, unit tested.
 *
 * Contract: `ProductOut.photo_facts: [{key, value, confidence, image_id, confirmed, confirmed_at}]`
 * lists every `ai` attribute with `image:` evidence (`attributes` holds the same value). The seller's
 * own value always wins: once the seller sets a key it is a seller fact and leaves `photo_facts`.
 * Confirm is `PATCH /products/{id} {confirm_attributes: [key]}`; reject is `{attributes: {key: null}}`.
 */
import type { Schema } from '@/api/types'
import { SLOT_LABEL } from '@/features/analytics-images/images/report'

export type PhotoFact = Schema<'PhotoFactOut'>
type Product = Pick<Schema<'ProductOut'>, 'attributes' | 'photo_facts' | 'image_details'>
type AttrValue = NonNullable<Schema<'ProductOut'>['attributes']>[string]

/**
 * The keys the backend may read from photos (`services/photo_facts.py` V1_KEYS), in the order the
 * product page lists them.
 */
export const PHOTO_KEYS = [
  'neckline',
  'sleeve_length',
  'fit',
  'garment_length',
  'pattern',
  'color',
  'embroidery',
  'occasion',
  'number_of_pieces',
] as const

const LABEL: Record<string, string> = {
  neckline: 'Neckline',
  sleeve_length: 'Sleeve length',
  fit: 'Fit',
  garment_length: 'Length',
  pattern: 'Pattern',
  color: 'Colour',
  embroidery: 'Embroidery',
  occasion: 'Occasion',
  number_of_pieces: 'Pieces',
}

/** `sleeve_length` → "Sleeve length"; unknown keys read as words. */
export function factLabel(key: string): string {
  const known = LABEL[key]
  if (known) return known
  const words = key.replace(/_/g, ' ').trim()
  return words ? words.charAt(0).toLocaleUpperCase('en') + words.slice(1) : key
}

/** "v-neck" → "V-neck", true → "Yes". Values stay as the backend wrote them otherwise. */
export function factValueText(v: AttrValue | null | undefined): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  if (typeof v === 'number') return String(v)
  const t = v.trim()
  return t ? t.charAt(0).toLocaleUpperCase('en') + t.slice(1) : ''
}

/**
 * Confidence in plain words, never a bare percentage, read before the value: "Looks like V-neck".
 * The backend writes a photo value at 0.70 or more and calls a disagreement only at 0.90 or more,
 * so those are the steps.
 */
export function confidenceWords(c: number): string {
  if (c >= 0.9) return 'Clearly'
  if (c >= 0.7) return 'Looks like'
  return 'Maybe'
}

/** Which photo a value came from: "Main photo", "Secondary photo 2". Null when it is not on the product. */
export function photoSourceLabel(imageId: string, details: Product['image_details']): string | null {
  const list = details ?? []
  const hit = list.find((d) => d.image_id === imageId)
  if (!hit) return null
  const sameSlot = list.filter((d) => d.slot === hit.slot).sort((a, b) => a.position - b.position)
  const slot = SLOT_LABEL[hit.slot] ?? 'Product'
  const n = sameSlot.length > 1 ? ` ${sameSlot.indexOf(hit) + 1}` : ''
  return `${slot} photo${n}`
}

export type FactRowStatus = 'photo' | 'confirmed' | 'you'

export interface FactRow {
  key: string
  label: string
  value: string
  status: FactRowStatus
  /** Photo rows only. */
  confidence?: number
  /** Photo rows only: "Main photo". */
  photo?: string | null
}

/** Keys the product card already shows in their own row: their seller value is not repeated. */
const OWN_ROW = new Set(['color'])

/**
 * The "From photos" rows: every photo fact (unconfirmed first in the key order, then confirmed),
 * plus the seller's own value for any other photo key, shown as "You" so it is clear the photo did
 * not replace it. Empty when the product has no photo facts at all.
 */
export function groupPhotoFacts(product: Product): FactRow[] {
  const facts = product.photo_facts ?? []
  if (facts.length === 0) return []
  const attrs = product.attributes ?? {}
  const byKey = new Map(facts.map((f) => [f.key, f]))
  const order = (k: string) => {
    const i = (PHOTO_KEYS as readonly string[]).indexOf(k)
    return i < 0 ? PHOTO_KEYS.length : i
  }
  const rows: FactRow[] = facts.map((f) => ({
    key: f.key,
    label: factLabel(f.key),
    value: factValueText(f.value),
    status: f.confirmed ? 'confirmed' : 'photo',
    confidence: f.confidence,
    photo: photoSourceLabel(f.image_id, product.image_details),
  }))
  for (const k of PHOTO_KEYS) {
    if (byKey.has(k) || OWN_ROW.has(k)) continue
    const text = factValueText(attrs[k])
    if (text) rows.push({ key: k, label: factLabel(k), value: text, status: 'you' })
  }
  const rank: Record<FactRowStatus, number> = { photo: 0, confirmed: 1, you: 2 }
  return rows.sort((a, b) => rank[a.status] - rank[b.status] || order(a.key) - order(b.key) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
}

export type PendingOp = 'confirm' | 'reject'

/**
 * The rows as they will be once the pending actions land (optimistic): a confirm shows as
 * Confirmed, a reject hides the row. When an action fails it leaves `pending`, so the row goes
 * back to what the server last said.
 */
export function withPending(rows: readonly FactRow[], pending: Readonly<Record<string, PendingOp>>): FactRow[] {
  return rows.flatMap((r) => {
    const op = r.status === 'photo' || r.status === 'confirmed' ? pending[r.key] : undefined
    if (op === 'reject') return []
    if (op === 'confirm') return [{ ...r, status: 'confirmed' as const }]
    return [r]
  })
}

/** Photo-fact keys the product page shows in the "From photos" group, so "More details" skips them. */
export function photoGroupKeys(rows: readonly FactRow[]): Set<string> {
  return new Set(rows.map((r) => r.key))
}

/** "2 to check": unconfirmed photo values, for the group's sub line. */
export function toCheckCount(rows: readonly FactRow[]): number {
  return rows.filter((r) => r.status === 'photo').length
}
