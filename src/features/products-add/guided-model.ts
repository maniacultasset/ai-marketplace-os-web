/**
 * Guided form (hi-fi p09) model: sections, fields, completeness and the POST /products body.
 *
 * The form covers the client's ten V1 inputs: style number, SKU, fabric type, fabric
 * composition, colour, size chart, manufacturer (the brand default, or this product's own),
 * selling price, MRP and images, plus the barcode (or its exemption). Fields map onto `ProductCreate`
 * (backend schemas/products.py): sku, title, category, style_number, mrp, selling_price, size_chart,
 * manufacturer, product_identifier or identifier_exemption, flat
 * `attributes` and, for images uploaded before the product exists, `id` + `image_uploads`.
 * Attribute keys come from the backend attribute dictionary; `critical` mirrors `is_critical`.
 * Rules shared with the product editor live in `@/features/products/intake-model`.
 */
import {
  bodyErrorKey,
  compositionProblems,
  compositionRows,
  compositionValue,
  emptyParty,
  emptySizeChart,
  moneyProblem,
  normalizeMoney,
  partyProblems,
  priceAboveMrp,
  sizeChartCount,
  SIZE_CHART_REFUSED,
  sizeChartProblems,
  toPartyIn,
  toSizeChart,
  type FibreRow,
  type PartyDraft,
  type SizeChartDraft,
} from '@/features/products/intake-model'
import {
  ATTRIBUTE_KEY_MSG,
  ATTRIBUTE_KEY_PATTERN,
  ATTRIBUTE_TEXT_MAX,
  codePoints,
  productTitleProblem,
  skuProblem,
} from '@/features/products/schema'
import { isMappedCategory } from '@/features/products/category-options'
import {
  BARCODE_KEY,
  barcodeCreateFields,
  barcodeProblem,
  barcodeServerMessage,
  emptyBarcode,
  isBarcodeErrorKey,
  normalizeBarcode,
  reviveBarcode,
  type BarcodeDraft,
} from '@/features/products/barcode'
import type { Schema } from '@/api/types'
import { CONTROL_MSG, hasStrayControlChars } from '@/lib/validation'

export { skuProblem }

export type SectionId = 'identity' | 'category' | 'fabric' | 'size' | 'media' | 'price' | 'care' | 'variants'

export const SECTIONS: readonly { id: SectionId; label: string }[] = [
  { id: 'identity', label: 'Identity' },
  { id: 'category', label: 'Category' },
  { id: 'fabric', label: 'Fabric and colour' },
  { id: 'size', label: 'Size chart' },
  { id: 'media', label: 'Images' },
  { id: 'price', label: 'Price' },
  { id: 'care', label: 'Care and legal' },
  { id: 'variants', label: 'Variants' },
]

export interface AttrField {
  key: string
  label: string
  hint?: string
  critical: boolean
  section: 'fabric' | 'care'
  /** Suggestions shown as a pick-list with "Other"; the seller's own words are kept. */
  pick?: 'fabric' | 'colour'
}

/**
 * Text attributes on the form. `fiber_composition` is not here: it has its own builder
 * (`GuidedValues.composition`), but keeps its label in `ATTR_LABEL`.
 */
export const ATTR_FIELDS: readonly AttrField[] = [
  { key: 'fabric_type', label: 'Fabric type', hint: 'The main fabric, like Cotton or Rayon.', critical: true, section: 'fabric', pick: 'fabric' },
  { key: 'color', label: 'Colour', hint: 'The main colour, as customers see it.', critical: false, section: 'fabric', pick: 'colour' },
  { key: 'fit', label: 'Fit', hint: 'Relaxed, regular, slim…', critical: false, section: 'fabric' },
  { key: 'neckline', label: 'Neckline', hint: 'Round neck, V-neck…', critical: false, section: 'fabric' },
  { key: 'sleeve_length', label: 'Sleeve length', hint: 'Short, three-quarter, full…', critical: false, section: 'fabric' },
  { key: 'pattern', label: 'Pattern', hint: 'Solid, striped, printed…', critical: false, section: 'fabric' },
  { key: 'wash_care', label: 'Wash care', hint: 'Exactly as on the care label.', critical: true, section: 'care' },
  { key: 'iron_care', label: 'Iron care', hint: 'Exactly as on the care label.', critical: true, section: 'care' },
]

/** Labels for every key the form or the detail page names. */
export const ATTR_LABEL: Readonly<Record<string, string>> = {
  ...Object.fromEntries(ATTR_FIELDS.map((f) => [f.key, f.label])),
  fiber_composition: 'Fabric composition',
  size_chart_url: 'Size chart link',
  size_measurements: 'Size chart',
}

export interface ExtraAttr {
  key: string
  value: string
}

export interface GuidedValues {
  sku: string
  title: string
  category: string
  styleNumber: string
  attrs: Record<string, string>
  composition: FibreRow[]
  extra: ExtraAttr[]
  sizeChart: SizeChartDraft
  mrp: string
  sellingPrice: string
  /** This product has its own manufacturer (else the brand default applies). */
  ownManufacturer: boolean
  manufacturer: PartyDraft
  /** EAN, UPC or GTIN, or "No barcode (exempt)" (features/products/barcode.ts). */
  barcode: BarcodeDraft
}

export const emptyGuided = (): GuidedValues => ({
  sku: '',
  title: '',
  category: '',
  styleNumber: '',
  attrs: {},
  composition: [],
  extra: [],
  sizeChart: emptySizeChart(),
  mrp: '',
  sellingPrice: '',
  ownManufacturer: false,
  manufacturer: emptyParty(),
  barcode: emptyBarcode(),
})

/**
 * A draft read back from this browser, made whole: drafts saved before these fields existed
 * get the defaults, and an old free-text composition moves into the builder.
 */
export function reviveGuided(raw: Partial<GuidedValues> & { attrs?: Record<string, string> }): GuidedValues {
  const base = emptyGuided()
  const attrs = { ...(raw.attrs ?? {}) }
  let composition = Array.isArray(raw.composition) ? raw.composition : []
  if (!composition.length && typeof attrs.fiber_composition === 'string' && attrs.fiber_composition.trim()) {
    composition = compositionRows(attrs.fiber_composition)
    if (!composition.length) composition = [{ fibre: attrs.fiber_composition.trim(), percent: '' }]
  }
  delete attrs.fiber_composition
  return {
    ...base,
    ...raw,
    attrs,
    composition,
    extra: raw.extra ?? [],
    sizeChart: raw.sizeChart?.rows ? { ...base.sizeChart, ...raw.sizeChart } : base.sizeChart,
    manufacturer: { ...base.manufacturer, ...(raw.manufacturer ?? {}) },
    ownManufacturer: raw.ownManufacturer === true,
    barcode: reviveBarcode(raw.barcode),
  }
}

/** Nothing typed yet (an empty draft is not kept). */
export function isEmptyGuided(v: GuidedValues): boolean {
  return (
    !v.sku &&
    !v.title &&
    !v.category &&
    !v.styleNumber &&
    !v.mrp &&
    !v.sellingPrice &&
    !Object.values(v.attrs).some(Boolean) &&
    !v.composition.some((r) => r.fibre || r.percent) &&
    v.extra.length === 0 &&
    sizeChartCount(v.sizeChart) === 0 &&
    !v.ownManufacturer &&
    !normalizeBarcode(v.barcode.value) &&
    !v.barcode.exempt
  )
}

export type GuidedErrors = Partial<Record<string, string>>

/** What the form knows beyond its values: the brand default manufacturer and the images. */
export interface GuidedContext {
  /** The brand has a default manufacturer (null while it loads). */
  brandManufacturer: boolean | null
  /** A main image is picked for this product. */
  hasMain: boolean
  /** Images picked, any slot. */
  imageCount: number
}

export const noContext: GuidedContext = { brandManufacturer: null, hasMain: false, imageCount: 0 }

/** A free-text value (title, attribute): trimmed, at most `max` code points, no control characters. */
function textProblem(raw: string, label: string, max: number): string | null {
  const v = raw.trim()
  if (hasStrayControlChars(v)) return CONTROL_MSG
  if (codePoints(v) > max) return `Shorten ${label} to ${max.toLocaleString('en-IN')} characters or fewer.`
  return null
}

const SELLING_ABOVE_MRP = 'Keep the selling price at or below the MRP.'

/**
 * Client checks mirroring ProductCreate. Keys: sku, title, category, style_number, mrp,
 * selling_price, attr.<key>, composition.rows.<i>.fibre|percent, attr.fiber_composition (the
 * composition as a whole), size_chart[.rows.<i>.<field>], manufacturer.<field>, extra.<i>.key|value.
 */
export function validateGuided(v: GuidedValues): GuidedErrors {
  const e: GuidedErrors = {}
  const sku = skuProblem(v.sku)
  if (sku) e.sku = sku
  const title = productTitleProblem(v.title, 'the product name')
  if (title) e.title = title
  // A dropdown of mapped categories: any other value (an old draft) would save but never list.
  if (!v.category.trim()) e.category = 'Choose a category.'
  else if (!isMappedCategory(v.category)) e.category = 'Choose a category from the list. The agent can’t list this one.'
  const style = v.styleNumber.trim()
  if (style) {
    if (hasStrayControlChars(style)) e.style_number = CONTROL_MSG
    else if (codePoints(style) > 64) e.style_number = 'Shorten the style number to 64 characters or fewer.'
  }
  for (const f of ATTR_FIELDS) {
    const p = textProblem(v.attrs[f.key] ?? '', f.label.toLowerCase(), ATTRIBUTE_TEXT_MAX)
    if (p) e[`attr.${f.key}`] = p
  }
  for (const [k, msg] of Object.entries(compositionProblems(v.composition)))
    e[k === 'total' ? 'attr.fiber_composition' : `composition.${k}`] = msg
  Object.assign(e, sizeChartProblems(v.sizeChart))
  const mrp = moneyProblem(v.mrp, 'the MRP')
  if (mrp) e.mrp = mrp
  const price = moneyProblem(v.sellingPrice, 'the selling price')
  if (price) e.selling_price = price
  else if (!mrp && priceAboveMrp(v.sellingPrice, v.mrp)) e.selling_price = SELLING_ABOVE_MRP
  if (v.ownManufacturer) for (const [k, msg] of Object.entries(partyProblems(v.manufacturer))) e[`manufacturer.${k}`] = msg
  const barcode = v.barcode.exempt ? null : barcodeProblem(v.barcode.type, v.barcode.value)
  if (barcode) e[BARCODE_KEY] = barcode
  const seen = new Set([...ATTR_FIELDS.map((f) => f.key), 'fiber_composition', 'fabric_composition', 'size_measurements'])
  v.extra.forEach((x, i) => {
    const key = x.key.trim()
    const val = x.value.trim()
    if (!key && !val) return
    if (!key) e[`extra.${i}.key`] = 'Choose an attribute, or clear the value.'
    else if (!ATTRIBUTE_KEY_PATTERN.test(key)) e[`extra.${i}.key`] = ATTRIBUTE_KEY_MSG
    else if (seen.has(key)) e[`extra.${i}.key`] = 'This attribute is already on the form. Fill it there instead.'
    else seen.add(key)
    if (key && !val) e[`extra.${i}.value`] = 'Enter a value or remove the row.'
    else {
      const p = textProblem(val, 'the value', ATTRIBUTE_TEXT_MAX)
      if (p) e[`extra.${i}.value`] = p
    }
  })
  return e
}

/** The section an error key belongs to (to open it when a save fails). */
export function sectionOfError(key: string): SectionId {
  if (key === 'sku' || key === 'title' || key === 'style_number' || key === BARCODE_KEY) return 'identity'
  if (key === 'category') return 'category'
  if (key === 'mrp' || key === 'selling_price') return 'price'
  if (key.startsWith('size_chart')) return 'size'
  if (key === 'images') return 'media'
  if (key.startsWith('manufacturer')) return 'care'
  if (key.startsWith('composition.') || key === 'attr.fiber_composition' || key.startsWith('extra.')) return 'fabric'
  if (key.startsWith('attr.')) return ATTR_FIELDS.find((f) => `attr.${f.key}` === key)?.section ?? 'fabric'
  return 'fabric'
}

const WITHIN: readonly string[] = [
  'title',
  'style_number',
  'sku',
  BARCODE_KEY,
  'category',
  'attr.fabric_type',
  'composition',
  'attr.fiber_composition',
  'attr.color',
  'attr.fit',
  'attr.neckline',
  'attr.sleeve_length',
  'attr.pattern',
  'extra',
  'size_chart',
  'images',
  'mrp',
  'selling_price',
  'attr.wash_care',
  'attr.iron_care',
  'manufacturer',
]

/** Error keys in the order the form shows them (the first one is focused on save). */
export function errorOrder(keys: readonly string[]): string[] {
  const rank = (k: string) => {
    const s = SECTIONS.findIndex((x) => x.id === sectionOfError(k))
    let w = WITHIN.indexOf(k)
    if (w < 0) w = WITHIN.findIndex((p) => k.startsWith(`${p}.`))
    // Rows keep their order: composition.rows.3.percent after composition.rows.1.fibre.
    const row = /\.(\d+)\./.exec(k)
    return s * 100000 + (w < 0 ? 999 : w) * 100 + (row ? Number(row[1]) : 0)
  }
  return [...keys].sort((a, b) => rank(a) - rank(b))
}

export type ProductCreateBody = Schema<'ProductCreate'>
export type ImageUploadIn = Schema<'ImageUploadIn'>

/**
 * The exact POST /products body: blank fields are left out, never sent empty. `uploads` are the
 * images already in the store under the minted product `id` (sent together or not at all).
 */
export function toProductCreate(v: GuidedValues, uploads?: { id: string; images: ImageUploadIn[] }): ProductCreateBody {
  const attributes: Record<string, string> = {}
  for (const f of ATTR_FIELDS) {
    const val = (v.attrs[f.key] ?? '').trim()
    if (val) attributes[f.key] = val
  }
  const composition = compositionValue(v.composition)
  if (composition) attributes.fiber_composition = composition
  for (const x of v.extra) {
    const key = x.key.trim()
    const val = x.value.trim()
    if (key && val) attributes[key] = val
  }
  const body: ProductCreateBody = { sku: v.sku.trim(), title: v.title.trim(), category: v.category.trim(), attributes }
  const style = v.styleNumber.trim()
  if (style) body.style_number = style
  if (v.mrp.trim()) body.mrp = normalizeMoney(v.mrp)
  if (v.sellingPrice.trim()) body.selling_price = normalizeMoney(v.sellingPrice)
  const chart = toSizeChart(v.sizeChart)
  if (chart) body.size_chart = chart
  if (v.ownManufacturer) body.manufacturer = toPartyIn(v.manufacturer)
  Object.assign(body, barcodeCreateFields(v.barcode))
  if (uploads && uploads.images.length) {
    body.id = uploads.id
    body.image_uploads = uploads.images
  }
  return body
}

export type SectionState = { kind: 'done' } | { kind: 'missing'; count: number } | { kind: 'error'; count: number } | { kind: 'todo' }

/** A composition is complete when some row is filled and every filled row has a fibre and a percent. */
const compositionComplete = (rows: readonly FibreRow[]) => {
  const filled = rows.filter((r) => r.fibre.trim() || r.percent.trim())
  return filled.length > 0 && filled.every((r) => r.fibre.trim() && r.percent.trim())
}

/** Critical facts still empty, by label and section (p09 "N missing" card and section counts). */
export function missingCriticalBy(v: GuidedValues, ctx: GuidedContext = noContext): { label: string; section: SectionId }[] {
  const out: { label: string; section: SectionId }[] = []
  const empty = (k: string) => !(v.attrs[k] ?? '').trim()
  if (empty('fabric_type')) out.push({ label: 'Fabric type', section: 'fabric' })
  if (!compositionComplete(v.composition)) out.push({ label: 'Fabric composition', section: 'fabric' })
  if (!v.mrp.trim()) out.push({ label: 'MRP', section: 'price' })
  if (empty('wash_care')) out.push({ label: 'Wash care', section: 'care' })
  if (empty('iron_care')) out.push({ label: 'Iron care', section: 'care' })
  if (!v.ownManufacturer && ctx.brandManufacturer === false) out.push({ label: 'Manufacturer', section: 'care' })
  return out
}

export function missingCritical(v: GuidedValues, ctx: GuidedContext = noContext): string[] {
  return missingCriticalBy(v, ctx).map((m) => m.label)
}

/**
 * Completeness per section (p09 section list), one rule for all:
 * - an error mark (with a count) when the section has errors the person can see (`shown`: the
 *   errors the form displays, after a touch or a save attempt);
 * - else a number when critical facts are missing;
 * - else a done dot when the section has content and no errors (seen or not);
 * - else a dash (empty, or not finished).
 */
export function sectionStates(v: GuidedValues, ctx: GuidedContext = noContext, shown: GuidedErrors = {}): Record<SectionId, SectionState> {
  const errs = validateGuided(v)
  const missing = missingCriticalBy(v, ctx)
  const content: Record<SectionId, boolean> = {
    identity: !!(v.sku.trim() || v.title.trim() || v.styleNumber.trim() || normalizeBarcode(v.barcode.value) || v.barcode.exempt),
    category: !!v.category.trim(),
    fabric:
      ATTR_FIELDS.some((f) => f.section === 'fabric' && (v.attrs[f.key] ?? '').trim()) ||
      v.composition.some((r) => r.fibre.trim() || r.percent.trim()) ||
      v.extra.some((x) => x.key.trim() || x.value.trim()),
    size: sizeChartCount(v.sizeChart) > 0,
    media: ctx.imageCount > 0,
    price: !!(v.mrp.trim() || v.sellingPrice.trim()),
    care: ATTR_FIELDS.some((f) => f.section === 'care' && (v.attrs[f.key] ?? '').trim()) || v.ownManufacturer,
    variants: false,
  }
  // Identity is complete only with both required fields.
  const complete: Partial<Record<SectionId, boolean>> = { identity: !!(v.sku.trim() && v.title.trim()) }
  const out = {} as Record<SectionId, SectionState>
  for (const { id } of SECTIONS) {
    const seen = Object.keys(shown).filter((k) => shown[k] && sectionOfError(k) === id).length
    const n = missing.filter((m) => m.section === id).length
    const hidden = Object.keys(errs).some((k) => sectionOfError(k) === id)
    out[id] = seen
      ? { kind: 'error', count: seen }
      : n
        ? { kind: 'missing', count: n }
        : content[id] && (complete[id] ?? true) && !hidden
          ? { kind: 'done' }
          : { kind: 'todo' }
  }
  return out
}

/** Indexes of the draft rows that were sent (blank rows are dropped), so a 422 row index maps back. */
function sentIndexes<T>(rows: readonly T[], filled: (r: T) => boolean): number[] {
  return rows.flatMap((r, i) => (filled(r) ? [i] : []))
}

/**
 * Map a 422 / 409 from POST /products onto form keys. Returns the keyed messages and whether
 * anything was left unmapped (shown in the form banner with the reference id).
 */
export function mapCreateErrors(
  err: { status: number; type: string; details: readonly { loc: readonly (string | number)[]; msg: string }[] },
  v: GuidedValues,
): { fields: GuidedErrors; unmapped: boolean } {
  const fields: GuidedErrors = {}
  let unmapped = false
  if (err.type === 'SKU_CONFLICT') {
    fields.sku = 'This SKU already exists in this brand.'
    return { fields, unmapped }
  }
  const sizeRows = sentIndexes(v.sizeChart.rows, (r) => Object.values(r).some((x) => x.trim() !== ''))
  for (const d of err.details) {
    let key = bodyErrorKey(d.loc)
    if (!key) {
      unmapped = true
      continue
    }
    let msg = d.msg
    if (key.startsWith('size_chart.rows.')) {
      const [, , i, field] = key.split('.')
      const draftIndex = sizeRows[Number(i)]
      key = draftIndex === undefined ? 'size_chart' : `size_chart.rows.${draftIndex}.${field}`
    }
    if (key === 'size_chart') msg = SIZE_CHART_REFUSED
    if (key === 'selling_price' && priceAboveMrp(v.sellingPrice, v.mrp)) msg = SELLING_ABOVE_MRP
    if (key.startsWith('attr.')) {
      const attr = key.slice(5)
      if (err.type === 'UNKNOWN_FACT_KEY') msg = 'Unknown attribute.'
      if (!(ATTR_FIELDS.some((f) => f.key === attr) || attr === 'fiber_composition')) {
        const i = v.extra.findIndex((x) => x.key.trim() === attr)
        if (i < 0) {
          unmapped = true
          continue
        }
        key = `extra.${i}.key`
      }
    }
    if (key.startsWith('manufacturer') && !v.ownManufacturer) {
      unmapped = true
      continue
    }
    if (key === 'images') msg = 'An image could not be attached. Remove it and add it again.'
    if (isBarcodeErrorKey(key)) {
      key = BARCODE_KEY
      msg = barcodeServerMessage(err.type, v.barcode)
    }
    const known = ['sku', 'title', 'category', 'style_number', 'mrp', 'selling_price', 'size_chart', 'images', BARCODE_KEY]
    if (!(known.includes(key) || /^(attr|extra|size_chart|manufacturer)\./.test(key))) {
      unmapped = true
      continue
    }
    fields[key] ??= msg
  }
  if (err.details.length === 0) unmapped = true
  return { fields, unmapped }
}
