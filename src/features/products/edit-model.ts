/**
 * Product detail editor model: a saved product as an editable draft, its checks, and the
 * PATCH /products/{id} body (a JSON merge patch: only changed fields; `null` clears).
 *
 * Backend rules (schemas/products.py `ProductPatch`, services/product_edit.py): `sku` is
 * immutable; `title` cannot be cleared; on a variant, style-owned fields (style number, size
 * chart, colour) are 422 FACT_LEVEL_INVALID, so the editor hides them; `manufacturer: null` goes
 * back to the inherited one; an attribute set to `null` is removed. `category` changes only while
 * the product has no listing (422 at `category` after that); the editor offers it on a style or
 * standalone product only, since a variant is listed through its style. A barcode sits on a
 * variant or a standalone product; a style holds only the exemption, which reaches its variants
 * (./barcode.ts).
 */
import type { Schema } from '@/api/types'
import { CONTROL_MSG, hasStrayControlChars } from '@/lib/validation'
import {
  bodyErrorKey,
  compositionProblems,
  compositionRows,
  compositionValue,
  fromPartyOut,
  fromSizeChart,
  moneyPaise,
  moneyProblem,
  normalizeMoney,
  partyProblems,
  priceAboveMrp,
  samePartyDraft,
  SIZE_CHART_REFUSED,
  sizeChartProblems,
  toPartyIn,
  toSizeChart,
  type FibreRow,
  type PartyDraft,
  type SizeChartDraft,
} from './intake-model'
import {
  BARCODE_KEY,
  barcodeFromProduct,
  barcodePatchFields,
  barcodeProblem,
  barcodeServerMessage,
  isBarcodeErrorKey,
  sameBarcode,
  type BarcodeDraft,
  type BarcodeLevel,
} from './barcode'
import { ATTRIBUTE_TEXT_MAX, codePoints, productTitleProblem } from './schema'
import { audienceServerMessage, brandNameProblem, hasAudience, hasBrandName, type Gender } from './audience'

type Product = Schema<'ProductOut'>
export type ProductPatchBody = Schema<'ProductPatch'>

/** Text attributes the editor shows, in order. */
export const EDIT_ATTRS = ['fabric_type', 'color', 'fit', 'neckline', 'sleeve_length', 'pattern', 'wash_care', 'iron_care'] as const
export type EditAttr = (typeof EDIT_ATTRS)[number]
/** Set on the style, never on a variant (attribute_dictionary.json owner_levels). */
const STYLE_ONLY_ATTRS: readonly EditAttr[] = ['color']

export interface EditDraft {
  title: string
  category: string
  styleNumber: string
  attrs: Record<EditAttr, string>
  composition: FibreRow[]
  sizeChart: SizeChartDraft
  mrp: string
  sellingPrice: string
  ownManufacturer: boolean
  manufacturer: PartyDraft
  barcode: BarcodeDraft
  /** SI8: the backend sends audience and brand (an older one omits both: the editor hides them). */
  hasAudience: boolean
  gender: Gender | ''
  /** Lists under its own brand name (else the brand profile's). */
  ownBrand: boolean
  brandName: string
}

/**
 * Where the effective manufacturer comes from. The backend marks `inherited` only for the brand
 * default, so a variant that inherits its style's party looks like its own: compare it with the
 * style's effective party (`parent`, read with GET /products/{id}; undefined while unknown).
 */
export type ManufacturerSource = 'none' | 'brand' | 'style' | 'own' | 'unknown'

export function manufacturerSource(p: Product, parent: Product | null | undefined): ManufacturerSource {
  const m = p.manufacturer
  if (!m) return 'none'
  if (m.inherited) return 'brand'
  if (!p.parent_product_id) return 'own'
  if (!parent || parent.id === p.id) return 'unknown'
  return parent.manufacturer?.id === m.id ? 'style' : 'own'
}

/** `source` decides whether the loaded manufacturer counts as this product's own. */
export function toEditDraft(p: Product, source: ManufacturerSource = manufacturerSource(p, null)): EditDraft {
  const attrs = Object.fromEntries(EDIT_ATTRS.map((k) => {
    const v = p.attributes?.[k]
    return [k, typeof v === 'string' ? v : v == null ? '' : String(v)]
  })) as Record<EditAttr, string>
  const comp = p.attributes?.fiber_composition
  return {
    title: p.title,
    category: p.category,
    styleNumber: p.style_number ?? '',
    attrs,
    composition: compositionRows(typeof comp === 'string' ? comp : null, p.fiber_composition),
    sizeChart: fromSizeChart(p.size_chart),
    mrp: p.mrp ?? '',
    sellingPrice: p.selling_price ?? '',
    ownManufacturer: source === 'own',
    manufacturer: fromPartyOut(p.manufacturer),
    barcode: barcodeFromProduct(p),
    hasAudience: hasAudience(p) && hasBrandName(p),
    gender: p.gender ?? '',
    ownBrand: !!p.brand_name?.trim() && p.brand_name_inherited !== true,
    brandName: p.brand_name_inherited === true ? '' : (p.brand_name ?? ''),
  }
}

/** Which inputs a row may edit: a variant has no style number, size chart or colour. */
export function editableAttrs(isVariant: boolean): readonly EditAttr[] {
  return isVariant ? EDIT_ATTRS.filter((k) => !STYLE_ONLY_ATTRS.includes(k)) : EDIT_ATTRS
}

export type EditErrors = Partial<Record<string, string>>

/** The 422 at `category`: the product has a listing, so its category is fixed. */
export const CATEGORY_LOCKED_MSG = 'The category can’t change once the product has a listing.'

/** Same keys as the guided form: title, style_number, mrp, selling_price, attr.<k>, composition.*, size_chart*, manufacturer.*. */
export function validateEdit(d: EditDraft, isVariant: boolean): EditErrors {
  const e: EditErrors = {}
  const title = productTitleProblem(d.title, 'the product name')
  if (title) e.title = title
  if (!isVariant && !d.category.trim()) e.category = 'Choose a category.'
  if (!isVariant) {
    const style = d.styleNumber.trim()
    if (style && hasStrayControlChars(style)) e.style_number = CONTROL_MSG
    else if (codePoints(style) > 64) e.style_number = 'Shorten the style number to 64 characters or fewer.'
    Object.assign(e, sizeChartProblems(d.sizeChart))
    if (d.hasAudience && d.ownBrand) {
      const b = brandNameProblem(d.brandName)
      if (b) e.brand_name = b
    }
  }
  for (const k of editableAttrs(isVariant)) {
    const v = d.attrs[k].trim()
    if (hasStrayControlChars(v)) e[`attr.${k}`] = CONTROL_MSG
    else if (codePoints(v) > ATTRIBUTE_TEXT_MAX) e[`attr.${k}`] = `Shorten it to ${ATTRIBUTE_TEXT_MAX.toLocaleString('en-IN')} characters or fewer.`
  }
  for (const [k, msg] of Object.entries(compositionProblems(d.composition))) e[k === 'total' ? 'attr.fiber_composition' : `composition.${k}`] = msg
  const mrp = moneyProblem(d.mrp, 'the MRP')
  if (mrp) e.mrp = mrp
  const price = moneyProblem(d.sellingPrice, 'the selling price')
  if (price) e.selling_price = price
  else if (!mrp && priceAboveMrp(d.sellingPrice, d.mrp)) e.selling_price = 'Keep the selling price at or below the MRP.'
  if (d.ownManufacturer) for (const [k, msg] of Object.entries(partyProblems(d.manufacturer))) e[`manufacturer.${k}`] = msg
  const barcode = d.barcode.exempt ? null : barcodeProblem(d.barcode.type, d.barcode.value)
  if (barcode) e[BARCODE_KEY] = barcode
  return e
}

const sameMoney = (a: string, b: string) => {
  const x = a.trim() ? moneyPaise(normalizeMoney(a)) : null
  const y = b.trim() ? moneyPaise(normalizeMoney(b)) : null
  return x === y
}

/**
 * The PATCH body: only what changed from `base` (the product as loaded). An emptied field is
 * `null` (cleared). Returns `{}` when nothing changed. Call after `validateEdit` is empty.
 */
export function buildPatch(base: EditDraft, d: EditDraft, isVariant: boolean, barcodeLevel: BarcodeLevel = 'item'): ProductPatchBody {
  const body: ProductPatchBody = {}
  if (d.title.trim() !== base.title.trim()) body.title = d.title.trim()
  if (!isVariant && d.category.trim() && d.category.trim() !== base.category.trim()) body.category = d.category.trim()
  if (!isVariant && d.styleNumber.trim() !== base.styleNumber.trim()) body.style_number = d.styleNumber.trim() || null
  if (!sameMoney(d.mrp, base.mrp)) body.mrp = d.mrp.trim() ? normalizeMoney(d.mrp) : null
  if (!sameMoney(d.sellingPrice, base.sellingPrice)) body.selling_price = d.sellingPrice.trim() ? normalizeMoney(d.sellingPrice) : null
  const attributes: Record<string, string | null> = {}
  for (const k of editableAttrs(isVariant)) {
    const now = d.attrs[k].trim()
    if (now !== base.attrs[k].trim()) attributes[k] = now || null
  }
  const comp = compositionValue(d.composition)
  if (comp !== compositionValue(base.composition)) attributes.fiber_composition = comp || null
  if (Object.keys(attributes).length) body.attributes = attributes
  if (!isVariant) {
    const chart = toSizeChart(d.sizeChart)
    if (JSON.stringify(chart) !== JSON.stringify(toSizeChart(base.sizeChart))) body.size_chart = chart
  }
  if (d.ownManufacturer && (!base.ownManufacturer || !samePartyDraft(d.manufacturer, base.manufacturer))) body.manufacturer = toPartyIn(d.manufacturer)
  else if (!d.ownManufacturer && base.ownManufacturer) body.manufacturer = null
  Object.assign(body, barcodePatchFields(base.barcode, d.barcode, barcodeLevel))
  // Audience and brand are style-level (SI8): never sent from a variant or to an older backend.
  if (!isVariant && d.hasAudience) {
    if (d.gender !== base.gender) body.gender = d.gender || null
    if (d.ownBrand && (!base.ownBrand || d.brandName.trim() !== base.brandName.trim())) body.brand_name = d.brandName.trim()
    else if (!d.ownBrand && base.ownBrand) body.brand_name = null
  }
  return body
}

/** Map a 422 from PATCH onto editor keys. */
export function mapPatchErrors(
  err: { type: string; details: readonly { loc: readonly (string | number)[]; msg: string }[] },
  d: EditDraft,
): { fields: EditErrors; unmapped: boolean } {
  const fields: EditErrors = {}
  let unmapped = err.details.length === 0
  const sent = d.sizeChart.rows.flatMap((r, i) => (Object.values(r).some((x) => x.trim() !== '') ? [i] : []))
  for (const det of err.details) {
    let key = bodyErrorKey(det.loc)
    if (!key) {
      unmapped = true
      continue
    }
    if (key.startsWith('size_chart.rows.')) {
      const [, , i, f] = key.split('.')
      const at = sent[Number(i)]
      key = at === undefined ? 'size_chart' : `size_chart.rows.${at}.${f}`
    }
    let msg = det.msg
    if (err.type === 'FACT_LEVEL_INVALID') msg = 'This is set on the style, not on a single variant.'
    if (err.type === 'UNKNOWN_FACT_KEY') msg = 'Unknown attribute.'
    if (key === 'size_chart') msg = SIZE_CHART_REFUSED
    if (key === 'selling_price' && priceAboveMrp(d.sellingPrice, d.mrp)) msg = 'Keep the selling price at or below the MRP.'
    if (key === 'category') msg = CATEGORY_LOCKED_MSG
    if (key === 'brand_name' || key === 'gender') msg = audienceServerMessage(key, err.type, msg)
    if (isBarcodeErrorKey(key)) {
      key = BARCODE_KEY
      msg = barcodeServerMessage(err.type, d.barcode)
    }
    if (!/^(title|category|style_number|brand_name$|gender$|mrp|selling_price|size_chart|barcode$|attr\.|manufacturer\.)/.test(key)) {
      unmapped = true
      continue
    }
    fields[key] ??= msg
  }
  return { fields, unmapped }
}

/**
 * 409 STALE_VERSION: put the fields the person changed (from `original`, the version their edit
 * started from, to `mine`) on top of `fresh`, the version someone else saved. Untouched fields
 * take the fresh values, so the retry never reverts the other person's change.
 */
export function rebaseDraft(original: EditDraft, mine: EditDraft, fresh: EditDraft): EditDraft {
  const out: EditDraft = { ...fresh, attrs: { ...fresh.attrs } }
  if (mine.title.trim() !== original.title.trim()) out.title = mine.title
  if (mine.category.trim() !== original.category.trim()) out.category = mine.category
  if (mine.styleNumber.trim() !== original.styleNumber.trim()) out.styleNumber = mine.styleNumber
  if (!sameMoney(mine.mrp, original.mrp)) out.mrp = mine.mrp
  if (!sameMoney(mine.sellingPrice, original.sellingPrice)) out.sellingPrice = mine.sellingPrice
  for (const k of EDIT_ATTRS) if (mine.attrs[k].trim() !== original.attrs[k].trim()) out.attrs[k] = mine.attrs[k]
  if (compositionValue(mine.composition) !== compositionValue(original.composition)) out.composition = mine.composition
  if (JSON.stringify(toSizeChart(mine.sizeChart)) !== JSON.stringify(toSizeChart(original.sizeChart))) out.sizeChart = mine.sizeChart
  const mfrChanged =
    mine.ownManufacturer !== original.ownManufacturer || (mine.ownManufacturer && !samePartyDraft(mine.manufacturer, original.manufacturer))
  if (mfrChanged) {
    out.ownManufacturer = mine.ownManufacturer
    out.manufacturer = mine.manufacturer
  }
  if (!sameBarcode(mine.barcode, original.barcode)) out.barcode = mine.barcode
  if (mine.gender !== original.gender) out.gender = mine.gender
  if (mine.ownBrand !== original.ownBrand || mine.brandName.trim() !== original.brandName.trim()) {
    out.ownBrand = mine.ownBrand
    out.brandName = mine.brandName
  }
  return out
}

/** Whether a save changed anything the editor shows (a no-op is not reported as saved). */
export function changedOnServer(before: Product, after: Product, isVariant: boolean): boolean {
  return Object.keys(buildPatch(toEditDraft(before, 'own'), toEditDraft(after, 'own'), isVariant)).length > 0 || before.manufacturer?.id !== after.manufacturer?.id
}
