/**
 * Product detail editor model: a saved product as an editable draft, its checks, and the
 * PATCH /products/{id} body (a JSON merge patch: only changed fields; `null` clears).
 *
 * Backend rules (schemas/products.py `ProductPatch`, services/product_edit.py): `sku` is
 * immutable; `title` cannot be cleared; on a variant, style-owned fields (style number, size
 * chart, colour) are 422 FACT_LEVEL_INVALID, so the editor hides them; `manufacturer: null` goes
 * back to the inherited one; an attribute set to `null` is removed.
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
  sizeChartProblems,
  toPartyIn,
  toSizeChart,
  type FibreRow,
  type PartyDraft,
  type SizeChartDraft,
} from './intake-model'
import { ATTRIBUTE_TEXT_MAX, codePoints, productTitleProblem } from './schema'

type Product = Schema<'ProductOut'>
export type ProductPatchBody = Schema<'ProductPatch'>

/** Text attributes the editor shows, in order. */
export const EDIT_ATTRS = ['fabric_type', 'color', 'fit', 'neckline', 'sleeve_length', 'pattern', 'wash_care', 'iron_care'] as const
export type EditAttr = (typeof EDIT_ATTRS)[number]
/** Set on the style, never on a variant (attribute_dictionary.json owner_levels). */
const STYLE_ONLY_ATTRS: readonly EditAttr[] = ['color']

export interface EditDraft {
  title: string
  styleNumber: string
  attrs: Record<EditAttr, string>
  composition: FibreRow[]
  sizeChart: SizeChartDraft
  mrp: string
  sellingPrice: string
  ownManufacturer: boolean
  manufacturer: PartyDraft
}

export function toEditDraft(p: Product): EditDraft {
  const attrs = Object.fromEntries(EDIT_ATTRS.map((k) => {
    const v = p.attributes?.[k]
    return [k, typeof v === 'string' ? v : v == null ? '' : String(v)]
  })) as Record<EditAttr, string>
  const comp = p.attributes?.fiber_composition
  return {
    title: p.title,
    styleNumber: p.style_number ?? '',
    attrs,
    composition: compositionRows(typeof comp === 'string' ? comp : null, p.fiber_composition),
    sizeChart: fromSizeChart(p.size_chart),
    mrp: p.mrp ?? '',
    sellingPrice: p.selling_price ?? '',
    ownManufacturer: !!p.manufacturer && !p.manufacturer.inherited,
    manufacturer: fromPartyOut(p.manufacturer),
  }
}

/** Which inputs a row may edit: a variant has no style number, size chart or colour. */
export function editableAttrs(isVariant: boolean): readonly EditAttr[] {
  return isVariant ? EDIT_ATTRS.filter((k) => !STYLE_ONLY_ATTRS.includes(k)) : EDIT_ATTRS
}

export type EditErrors = Partial<Record<string, string>>

/** Same keys as the guided form: title, style_number, mrp, selling_price, attr.<k>, composition.*, size_chart*, manufacturer.*. */
export function validateEdit(d: EditDraft, isVariant: boolean): EditErrors {
  const e: EditErrors = {}
  const title = productTitleProblem(d.title, 'the product name')
  if (title) e.title = title
  if (!isVariant) {
    const style = d.styleNumber.trim()
    if (style && hasStrayControlChars(style)) e.style_number = CONTROL_MSG
    else if (codePoints(style) > 64) e.style_number = 'Shorten the style number to 64 characters or fewer.'
    Object.assign(e, sizeChartProblems(d.sizeChart))
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
export function buildPatch(base: EditDraft, d: EditDraft, isVariant: boolean): ProductPatchBody {
  const body: ProductPatchBody = {}
  if (d.title.trim() !== base.title.trim()) body.title = d.title.trim()
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
    if (key === 'selling_price' && priceAboveMrp(d.sellingPrice, d.mrp)) msg = 'Keep the selling price at or below the MRP.'
    if (!/^(title|style_number|mrp|selling_price|size_chart|attr\.|manufacturer\.)/.test(key)) {
      unmapped = true
      continue
    }
    fields[key] ??= msg
  }
  return { fields, unmapped }
}
