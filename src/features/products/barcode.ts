/**
 * Product barcodes (SI5): the EAN, UPC or GTIN of a variant or a standalone product, or the
 * seller's "No barcode (exempt)" declaration. Pure rules shared by the guided form (create), the
 * product editor (PATCH) and the detail card.
 *
 * Mirrors the backend:
 * - core/identifiers.py `gtin_valid`: ASCII digits, 8 or 12 to 14 of them, and the GS1 check
 *   digit over the value left-padded to 14;
 * - `TYPE_LENGTHS`: `upc` 12, `ean` 8 or 13, `gtin` 8, 12, 13 or 14;
 * - services/product_identifier.py `plan`: a barcode and `identifier_exemption: true` in one body
 *   is 422, a barcode on a style is 422 `FACT_LEVEL_INVALID`, and a style's exemption is set on
 *   every variant without a barcode. The body builders here never send both.
 * The server stays the authority (a barcode already used in this brand is only known there).
 */
import type { Schema } from '@/api/types'

export type BarcodeType = Schema<'ProductIdentifierIn'>['type']
type ProductCreate = Schema<'ProductCreate'>
type ProductPatch = Schema<'ProductPatch'>
type Product = Pick<Schema<'ProductOut'>, 'product_identifier' | 'identifier_exemption'>

export const BARCODE_TYPES: readonly { value: BarcodeType; label: string }[] = [
  { value: 'ean', label: 'EAN' },
  { value: 'upc', label: 'UPC' },
  { value: 'gtin', label: 'GTIN' },
]

export const BARCODE_LABEL: Record<BarcodeType, string> = { ean: 'EAN', upc: 'UPC', gtin: 'GTIN' }

/** The lengths each type allows (backend `TYPE_LENGTHS`). */
export const TYPE_LENGTHS: Record<BarcodeType, readonly number[]> = {
  upc: [12],
  ean: [8, 13],
  gtin: [8, 12, 13, 14],
}

/** The type a bare barcode of this length implies (backend `type_from_length`). */
const BY_LENGTH: Readonly<Record<number, BarcodeType>> = { 8: 'ean', 12: 'upc', 13: 'ean', 14: 'gtin' }

const GTIN_PATTERN = /^([0-9]{8}|[0-9]{12,14})$/

/** The GS1 check digit over GTIN-8/12/13/14, left-padded to 14 (backend `gtin_valid`). */
export function gtinValid(value: string): boolean {
  if (!GTIN_PATTERN.test(value)) return false
  const digits = value.padStart(14, '0').split('').map(Number)
  const check = digits.pop()!
  const sum = digits.reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0)
  return (10 - (sum % 10)) % 10 === check
}

/** What a person typed or pasted, as the digits to send: spaces and hyphens from the pack dropped. */
export const normalizeBarcode = (raw: string) => raw.replace(/[\s-]/g, '')

/** Whether a valid value of this length fits the type (backend `check`, after the check digit). */
export const fitsType = (type: BarcodeType, value: string) => TYPE_LENGTHS[type].includes(value.length)

const lengthsText = (type: BarcodeType) => {
  const n = TYPE_LENGTHS[type]
  return n.length === 1 ? `${n[0]}` : `${n.slice(0, -1).join(', ')} or ${n[n.length - 1]}`
}

/** What is wrong with a barcode, or null (blank is not a problem: a barcode is optional to save). */
export function barcodeProblem(type: BarcodeType, raw: string): string | null {
  const v = normalizeBarcode(raw)
  if (!v) return null
  if (!/^[0-9]+$/.test(v)) return 'Use digits only.'
  if (!fitsType(type, v)) {
    const other = BY_LENGTH[v.length]
    const base = `${type === 'ean' ? 'An' : 'A'} ${BARCODE_LABEL[type]} has ${lengthsText(type)} digits. This has ${v.length}.`
    return other && other !== type ? `${base} Choose ${BARCODE_LABEL[other]} instead.` : base
  }
  if (!gtinValid(v)) return 'The last digit doesn’t match. Copy the number again from the barcode.'
  return null
}

/** The barcode as the forms hold it. `type` is kept while `value` is empty, so the choice sticks. */
export interface BarcodeDraft {
  type: BarcodeType
  value: string
  /** "No barcode (exempt)": the brand declares a GTIN exemption for this product. */
  exempt: boolean
}

export const emptyBarcode = (): BarcodeDraft => ({ type: 'ean', value: '', exempt: false })

export function barcodeFromProduct(p: Product): BarcodeDraft {
  const id = p.product_identifier
  if (id) return { type: id.type, value: id.value, exempt: false }
  return { ...emptyBarcode(), exempt: p.identifier_exemption === true }
}

/** A draft read back from this browser, made whole (drafts saved before barcodes existed). */
export function reviveBarcode(raw: unknown): BarcodeDraft {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<BarcodeDraft>
  const type = BARCODE_TYPES.some((t) => t.value === r.type) ? r.type! : 'ean'
  return { type, value: typeof r.value === 'string' ? r.value : '', exempt: r.exempt === true }
}

/** Where a draft's barcode lives: a style holds only the exemption (it reaches its variants). */
export type BarcodeLevel = 'item' | 'style'

/** `product_identifier` / `identifier_exemption` for POST /products: blank leaves both out. */
export function barcodeCreateFields(d: BarcodeDraft, level: BarcodeLevel = 'item'): Pick<ProductCreate, 'product_identifier' | 'identifier_exemption'> {
  if (d.exempt) return { identifier_exemption: true }
  const value = normalizeBarcode(d.value)
  if (level === 'item' && value) return { product_identifier: { type: d.type, value } }
  return {}
}

/**
 * The PATCH fields that move `base` (as loaded) to `d`; `{}` when nothing changed. Never both
 * fields at once: a barcode replaces an exemption on its own, and an exemption clears a barcode.
 */
export function barcodePatchFields(base: BarcodeDraft, d: BarcodeDraft, level: BarcodeLevel = 'item'): Pick<ProductPatch, 'product_identifier' | 'identifier_exemption'> {
  if (level === 'style') return d.exempt !== base.exempt ? { identifier_exemption: d.exempt } : {}
  if (d.exempt) return base.exempt ? {} : { identifier_exemption: true }
  const value = normalizeBarcode(d.value)
  const was = base.exempt ? '' : normalizeBarcode(base.value)
  if (value) return base.exempt || value !== was || d.type !== base.type ? { product_identifier: { type: d.type, value } } : {}
  if (base.exempt) return { identifier_exemption: false }
  return was ? { product_identifier: null } : {}
}

/** The same barcode state (for "changed" checks). */
export const sameBarcode = (a: BarcodeDraft, b: BarcodeDraft) =>
  a.exempt === b.exempt && (a.exempt || (normalizeBarcode(a.value) === normalizeBarcode(b.value) && (!normalizeBarcode(a.value) || a.type === b.type)))

/** The form key every barcode error lands on. */
export const BARCODE_KEY = 'barcode'

/** A 422 body path (`bodyErrorKey` form) that belongs to the barcode field. */
export const isBarcodeErrorKey = (key: string) => key === 'identifier_exemption' || key === 'product_identifier' || key.startsWith('product_identifier.')

/** The sentence for a barcode refused by the server. */
export function barcodeServerMessage(errType: string, d: BarcodeDraft): string {
  if (errType === 'FACT_LEVEL_INVALID') return 'A style has no barcode of its own. Add one on each variant.'
  const local = d.exempt ? null : barcodeProblem(d.type, d.value)
  if (local) return local
  if (!d.exempt && normalizeBarcode(d.value)) return 'Another product in this brand already has this barcode. Check the number.'
  return 'Check the barcode.'
}

/** "EAN 4006381333931" for the detail card. */
export const formatBarcode = (id: { type: BarcodeType; value: string }) => `${BARCODE_LABEL[id.type]} ${id.value}`
