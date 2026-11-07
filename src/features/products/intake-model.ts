/**
 * The seller's V1 inputs beyond SKU, name and category: style number, money (MRP and selling
 * price), fabric composition, size chart and the manufacturer party. Pure functions shared by the
 * guided form (create), the product detail editor (PATCH) and brand settings.
 *
 * Every rule mirrors the backend (SI1):
 * - money: schemas/products.py `Money` + services/intake_values.py `parse_money`,
 *   `check_price_le_mrp` (selling price at most the MRP);
 * - composition: services/composition.py (grammar, 1..100 with one decimal, sum exactly 100,
 *   unique fibres, at most 10, fibre at most 60 characters);
 * - size chart: schemas/products.py `SizeChart` / `SizeChartRow`;
 * - party: schemas/brand_profile.py `PartyIn` and core/india.py `STATE_CODES`.
 * The server stays the authority: a 422 still maps back onto the field (see `bodyErrorKey`).
 */
import type { Schema } from '@/api/types'
import { CONTROL_MSG, hasStrayControlChars } from '@/lib/validation'
import { codePoints } from './schema'

export type SizeChart = Schema<'SizeChart'>
export type SizeChartRow = Schema<'SizeChartRow'>
export type PartyIn = Schema<'PartyIn'>
export type PartyOut = Schema<'PartyOut'>

/* ------------------------------------------------------------------------------------- Money */

export const MONEY_PATTERN = /^(0|[1-9][0-9]{0,9})(\.[0-9]{1,2})?$/

/**
 * What a person typed, as the backend's decimal string: "₹1,299", "1 299.5" and "01299" become
 * "1299", "1299.5" and "1299". Anything else is returned trimmed, for `moneyProblem` to explain.
 */
export function normalizeMoney(raw: string): string {
  const v = raw.trim().replace(/^(₹|rs\.?|inr)\s*/i, '').replace(/[,\s]/g, '')
  const m = /^0*([0-9]+)(\.[0-9]*)?$/.exec(v)
  if (!m) return v
  const int = m[1] === '' ? '0' : m[1]!
  const frac = m[2] === '.' ? '' : (m[2] ?? '')
  return `${int.replace(/^0+(?=[0-9])/, '')}${frac}`
}

/** Paise as an integer, or null when `v` is not a valid money string. Exact up to 10 digits. */
export function moneyPaise(v: string): number | null {
  if (!MONEY_PATTERN.test(v)) return null
  const [int, frac = ''] = v.split('.')
  return Number(int) * 100 + Number(frac.padEnd(2, '0'))
}

/** What is wrong with a typed amount, or null. Blank is not a problem here (the caller decides). */
export function moneyProblem(raw: string, label: string): string | null {
  if (!raw.trim()) return null
  const v = normalizeMoney(raw)
  if (hasStrayControlChars(v)) return CONTROL_MSG
  if (/^[0-9]+\.[0-9]{3,}$/.test(v)) return `Use at most 2 decimals in ${label}, like 1299.50.`
  const paise = moneyPaise(v)
  if (paise === null) return `Enter ${label} in rupees, like 1299 or 1299.50.`
  if (paise <= 0) return `Enter ${label} above ₹0.`
  return null
}

/** The selling price may not be above the MRP (both valid, else null). */
export function priceAboveMrp(sellingRaw: string, mrpRaw: string): boolean {
  const s = moneyPaise(normalizeMoney(sellingRaw))
  const m = moneyPaise(normalizeMoney(mrpRaw))
  return s !== null && m !== null && s > m
}

const INR_WHOLE = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
const INR_PAISE = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** "₹1,299" / "₹1,299.50" for a stored decimal string (null stays null). */
export function formatMoney(v: string | null | undefined): string | null {
  if (v == null || v === '') return null
  const paise = moneyPaise(v)
  if (paise === null) return v
  return paise % 100 === 0 ? INR_WHOLE.format(paise / 100) : INR_PAISE.format(paise / 100)
}

/** Percent off MRP, rounded down (no "100% off"), or null. */
export function discountPercent(sellingRaw: string, mrpRaw: string): number | null {
  const s = moneyPaise(normalizeMoney(sellingRaw))
  const m = moneyPaise(normalizeMoney(mrpRaw))
  if (s === null || m === null || m === 0 || s >= m) return null
  return Math.floor(((m - s) / m) * 100)
}

/* ------------------------------------------------------------------------------- Composition */

export const MAX_FIBRES = 10
export const MAX_FIBRE_CHARS = 60

export type CompositionReason = 'format' | 'percent' | 'sum' | 'duplicate' | 'blank' | 'count'

export interface Fibre {
  fibre: string
  /** Tenths of a percent, so sums are exact (60.5% = 605). */
  tenths: number
}

const SPLIT = /\s*(?:[,/;+]|\s+and\s+)\s*/i
const PCT = '([0-9]{1,3}(?:\\.[0-9])?)\\s*%'
const FRONT = new RegExp(`^${PCT}\\s*([\\s\\S]*)$`)
const BACK = new RegExp(`^([\\s\\S]*?)\\s*${PCT}$`)

/** Parse a composition the way the backend does: fibres in order, or the reason it is refused. */
export function parseComposition(text: string): { ok: true; fibres: Fibre[] } | { ok: false; reason: CompositionReason } {
  if (text.includes('\0')) return { ok: false, reason: 'format' }
  const t = text.normalize('NFC')
  if (!t.trim()) return { ok: false, reason: 'blank' }
  const parts = t.trim().split(SPLIT)
  if (parts.length > MAX_FIBRES) return { ok: false, reason: 'count' }
  const fibres: Fibre[] = []
  const seen = new Set<string>()
  for (const raw of parts) {
    if (!raw.trim()) return { ok: false, reason: 'blank' }
    let name: string
    let pct: string
    const f = FRONT.exec(raw)
    const b = f ? null : BACK.exec(raw)
    if (f) [pct, name] = [f[1]!, f[2]!]
    else if (b) [name, pct] = [b[1]!, b[2]!]
    else return { ok: false, reason: 'format' }
    if (name.includes('%')) return { ok: false, reason: 'format' }
    const fibre = name.replace(/\s+/g, ' ').trim()
    if (!fibre) return { ok: false, reason: 'blank' }
    if (codePoints(fibre) > MAX_FIBRE_CHARS) return { ok: false, reason: 'format' }
    const tenths = Math.round(Number(pct) * 10)
    if (!(tenths > 0 && tenths <= 1000)) return { ok: false, reason: 'percent' }
    const key = fibre.toLocaleLowerCase('en')
    if (seen.has(key)) return { ok: false, reason: 'duplicate' }
    seen.add(key)
    fibres.push({ fibre, tenths })
  }
  if (fibres.reduce((n, x) => n + x.tenths, 0) !== 1000) return { ok: false, reason: 'sum' }
  return { ok: true, fibres }
}

/** One row of the composition builder, as typed. */
export interface FibreRow {
  fibre: string
  percent: string
}

export const COMPOSITION_REASON_MSG: Record<CompositionReason, string> = {
  format: 'Write each fibre as a name and a percent, like 60% Cotton, 40% Polyester.',
  percent: 'Each percent is above 0 and at most 100, with at most one decimal.',
  sum: 'The percents must add up to 100%.',
  duplicate: 'A fibre is listed twice. Combine them into one row.',
  blank: 'Every row needs a fibre name and a percent.',
  count: `Use at most ${MAX_FIBRES} fibres.`,
}

const pctText = (tenths: number) => (tenths % 10 === 0 ? String(tenths / 10) : (tenths / 10).toFixed(1))

/** Builder rows -> the text the backend stores ("60% Cotton, 40% Polyester"). Blank rows are dropped. */
export function serializeComposition(rows: readonly FibreRow[]): string {
  return rows
    .filter((r) => r.fibre.trim() || r.percent.trim())
    .map((r) => `${r.percent.trim()}% ${r.fibre.replace(/\s+/g, ' ').trim()}`)
    .join(', ')
}

/** Stored text (or the normalized list as a fallback) -> builder rows. Unparseable text keeps one free row. */
export function compositionRows(text: string | null | undefined, normalized?: readonly { fibre: string; percent: number }[] | null): FibreRow[] {
  if (text && text.trim()) {
    const p = parseComposition(text)
    if (p.ok) return p.fibres.map((f) => ({ fibre: f.fibre, percent: pctText(f.tenths) }))
  }
  if (normalized?.length)
    return normalized.map((f) => ({ fibre: f.fibre.charAt(0).toLocaleUpperCase('en') + f.fibre.slice(1), percent: String(f.percent) }))
  return []
}

/** Sum of the rows' valid percents, in tenths (for the live "100%" meter). */
export function compositionTotal(rows: readonly FibreRow[]): number {
  return rows.reduce((n, r) => {
    const v = r.percent.trim()
    return /^[0-9]{1,3}(\.[0-9])?$/.test(v) ? n + Math.round(Number(v) * 10) : n
  }, 0)
}

export const formatTenths = pctText

/**
 * Field errors for the builder: `rows.<i>.fibre`, `rows.<i>.percent` and `total`. No rows at all
 * is not an error (composition is optional to save; it is a critical fact the summary names).
 */
export function compositionProblems(rows: readonly FibreRow[]): Record<string, string> {
  const e: Record<string, string> = {}
  const filled = rows.map((r, i) => ({ r, i })).filter(({ r }) => r.fibre.trim() || r.percent.trim())
  if (!filled.length) return e
  if (filled.length > MAX_FIBRES) e.total = COMPOSITION_REASON_MSG.count
  const seen = new Map<string, number>()
  for (const { r, i } of filled) {
    const name = r.fibre.replace(/\s+/g, ' ').trim()
    if (!name) e[`rows.${i}.fibre`] = 'Enter the fibre, like Cotton.'
    else if (hasStrayControlChars(name)) e[`rows.${i}.fibre`] = CONTROL_MSG
    else if (/[,/;+%]|\sand\s/i.test(name)) e[`rows.${i}.fibre`] = 'Use one fibre per row.'
    else if (/^[0-9.\s]+$/.test(name)) e[`rows.${i}.fibre`] = 'Enter the fibre name, not a number.'
    else if (codePoints(name) > MAX_FIBRE_CHARS) e[`rows.${i}.fibre`] = `Shorten the fibre to ${MAX_FIBRE_CHARS} characters or fewer.`
    else {
      const key = name.toLocaleLowerCase('en')
      if (seen.has(key)) e[`rows.${i}.fibre`] = 'Already listed. Combine the two rows.'
      else seen.set(key, i)
    }
    const p = r.percent.trim().replace(/%$/, '').trim()
    if (!p) e[`rows.${i}.percent`] = 'Enter a percent.'
    else if (!/^[0-9]{1,3}(\.[0-9])?$/.test(p)) e[`rows.${i}.percent`] = 'Use a number with at most one decimal.'
    else if (!(Number(p) > 0 && Number(p) <= 100)) e[`rows.${i}.percent`] = 'Use 1 to 100.'
  }
  if (!Object.keys(e).length) {
    const total = compositionTotal(filled.map(({ r }) => ({ ...r, percent: r.percent.trim().replace(/%$/, '').trim() })))
    if (total !== 1000) e.total = `The percents add up to ${pctText(total)}%. Make them add up to 100%.`
    else {
      const p = parseComposition(serializeComposition(filled.map(({ r }) => ({ ...r, percent: r.percent.trim().replace(/%$/, '').trim() }))))
      if (!p.ok) e.total = COMPOSITION_REASON_MSG[p.reason]
    }
  }
  return e
}

/** Builder rows -> the attribute text to send, or '' when no row is filled. Call after `compositionProblems` is empty. */
export function compositionValue(rows: readonly FibreRow[]): string {
  return serializeComposition(rows.map((r) => ({ ...r, percent: r.percent.trim().replace(/%$/, '').trim() })))
}

/* -------------------------------------------------------------------------------- Size chart */

export const MEASURES = ['chest', 'waist', 'hip', 'length', 'shoulder', 'sleeve', 'inseam'] as const
export type Measure = (typeof MEASURES)[number]
export const MEASURE_LABEL: Record<Measure, string> = {
  chest: 'Chest',
  waist: 'Waist',
  hip: 'Hip',
  length: 'Length',
  shoulder: 'Shoulder',
  sleeve: 'Sleeve',
  inseam: 'Inseam',
}
/** Shown by default; the others are one tap away. */
export const DEFAULT_MEASURES: readonly Measure[] = ['chest', 'waist', 'hip', 'length']
export const COMMON_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'] as const
export const MAX_SIZE_ROWS = 40
export const SIZE_MAX = 20

export type SizeRowDraft = { size: string } & Record<Measure, string>

export interface SizeChartDraft {
  unit: 'cm' | 'in'
  basis: 'garment' | 'body'
  rows: SizeRowDraft[]
}

export const emptySizeRow = (size = ''): SizeRowDraft => ({ size, chest: '', waist: '', hip: '', length: '', shoulder: '', sleeve: '', inseam: '' })
export const emptySizeChart = (): SizeChartDraft => ({ unit: 'in', basis: 'garment', rows: [] })

const rowFilled = (r: SizeRowDraft) => r.size.trim() !== '' || MEASURES.some((m) => r[m].trim() !== '')

/** The measures a chart uses: the defaults plus any with a value. */
export function measuresInUse(d: SizeChartDraft, extra: readonly Measure[] = []): Measure[] {
  return MEASURES.filter((m) => DEFAULT_MEASURES.includes(m) || extra.includes(m) || d.rows.some((r) => r[m].trim() !== ''))
}

/** Field errors: `size_chart.rows.<i>.<size|measure>` and `size_chart` for the whole chart. */
export function sizeChartProblems(d: SizeChartDraft): Record<string, string> {
  const e: Record<string, string> = {}
  const rows = d.rows.map((r, i) => ({ r, i })).filter(({ r }) => rowFilled(r))
  if (rows.length > MAX_SIZE_ROWS) e.size_chart = `Use at most ${MAX_SIZE_ROWS} sizes.`
  const seen = new Set<string>()
  for (const { r, i } of rows) {
    const size = r.size.trim()
    if (!size) e[`size_chart.rows.${i}.size`] = 'Enter the size.'
    else if (hasStrayControlChars(size)) e[`size_chart.rows.${i}.size`] = CONTROL_MSG
    else if (codePoints(size) > SIZE_MAX) e[`size_chart.rows.${i}.size`] = `Use ${SIZE_MAX} characters or fewer.`
    else if (seen.has(size.toLocaleLowerCase('en'))) e[`size_chart.rows.${i}.size`] = 'This size is already in the chart.'
    else seen.add(size.toLocaleLowerCase('en'))
    for (const m of MEASURES) {
      const v = r[m].trim()
      if (!v) continue
      if (/^[0-9]+\.[0-9]{2,}$/.test(v)) e[`size_chart.rows.${i}.${m}`] = 'Use at most one decimal, like 34.5.'
      else if (!/^[0-9]+(\.[0-9])?$/.test(v)) e[`size_chart.rows.${i}.${m}`] = 'Enter a number.'
      else if (!(Number(v) > 0 && Number(v) <= 500)) e[`size_chart.rows.${i}.${m}`] = 'Use above 0, up to 500.'
    }
    // Backend normalize_size_chart: "each row has at least one measurement".
    if (size && !e[`size_chart.rows.${i}.size`] && !MEASURES.some((m) => r[m].trim() !== ''))
      e[`size_chart.rows.${i}.size`] = `Add at least one measurement for ${size}, or remove the row.`
  }
  return e
}

/** The backend refuses a chart as a whole (422 at `size_chart`): what to check. */
export const SIZE_CHART_REFUSED =
  'Check the size chart: every size needs at least one measurement, each above 0 and up to 500, with at most one decimal.'

/** Draft -> the `SizeChart` to send, or null when no row is filled. Call after `sizeChartProblems` is empty. */
export function toSizeChart(d: SizeChartDraft): SizeChart | null {
  const rows = d.rows.filter(rowFilled).map((r) => {
    const out: SizeChartRow = { size: r.size.trim() }
    for (const m of MEASURES) if (r[m].trim()) out[m] = Number(r[m].trim())
    return out
  })
  return rows.length ? { unit: d.unit, basis: d.basis, rows } : null
}

export function fromSizeChart(c: SizeChart | null | undefined): SizeChartDraft {
  if (!c) return emptySizeChart()
  return {
    unit: c.unit,
    basis: c.basis,
    rows: c.rows.map((r) => {
      const d = emptySizeRow(r.size)
      for (const m of MEASURES) d[m] = r[m] == null ? '' : String(r[m])
      return d
    }),
  }
}

/** Filled rows (for completeness marks). */
export const sizeChartCount = (d: SizeChartDraft) => d.rows.filter(rowFilled).length

/* ------------------------------------------------------------------------------------- Party */

/** ISO 3166-2:IN without `IN-` (backend core/india.py), with names, sorted by name. */
export const IN_STATES: readonly { code: string; name: string }[] = [
  ['AN', 'Andaman and Nicobar Islands'],
  ['AP', 'Andhra Pradesh'],
  ['AR', 'Arunachal Pradesh'],
  ['AS', 'Assam'],
  ['BR', 'Bihar'],
  ['CH', 'Chandigarh'],
  ['CT', 'Chhattisgarh'],
  ['DH', 'Dadra and Nagar Haveli and Daman and Diu'],
  ['DL', 'Delhi'],
  ['GA', 'Goa'],
  ['GJ', 'Gujarat'],
  ['HR', 'Haryana'],
  ['HP', 'Himachal Pradesh'],
  ['JK', 'Jammu and Kashmir'],
  ['JH', 'Jharkhand'],
  ['KA', 'Karnataka'],
  ['KL', 'Kerala'],
  ['LA', 'Ladakh'],
  ['LD', 'Lakshadweep'],
  ['MP', 'Madhya Pradesh'],
  ['MH', 'Maharashtra'],
  ['MN', 'Manipur'],
  ['ML', 'Meghalaya'],
  ['MZ', 'Mizoram'],
  ['NL', 'Nagaland'],
  ['OD', 'Odisha'],
  ['PY', 'Puducherry'],
  ['PB', 'Punjab'],
  ['RJ', 'Rajasthan'],
  ['SK', 'Sikkim'],
  ['TN', 'Tamil Nadu'],
  ['TG', 'Telangana'],
  ['TR', 'Tripura'],
  ['UP', 'Uttar Pradesh'],
  ['UT', 'Uttarakhand'],
  ['WB', 'West Bengal'],
].map(([code, name]) => ({ code: code!, name: name! }))

export const stateName = (code: string | null | undefined) => IN_STATES.find((s) => s.code === code)?.name ?? code ?? ''

export const PARTY_FIELDS = ['legal_name', 'address_line1', 'address_line2', 'city', 'state_code', 'postal_code', 'gstin'] as const
export type PartyField = (typeof PARTY_FIELDS)[number]
export type PartyDraft = Record<PartyField, string>

export const emptyParty = (): PartyDraft => ({ legal_name: '', address_line1: '', address_line2: '', city: '', state_code: '', postal_code: '', gstin: '' })

export const PIN_PATTERN = /^[1-9][0-9]{5}$/
export const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/

export const partyFilled = (p: PartyDraft) => PARTY_FIELDS.some((k) => p[k].trim() !== '')

/** Field errors keyed by party field (callers prefix them, e.g. `manufacturer.city`). */
export function partyProblems(p: PartyDraft): Partial<Record<PartyField, string>> {
  const e: Partial<Record<PartyField, string>> = {}
  const text = (k: PartyField, label: string, max: number, required: boolean) => {
    const v = p[k].trim()
    if (!v) {
      if (required) e[k] = `Enter the ${label}.`
      return
    }
    if (hasStrayControlChars(v)) e[k] = CONTROL_MSG
    else if (codePoints(v) > max) e[k] = `Shorten the ${label} to ${max} characters or fewer.`
  }
  text('legal_name', 'legal name', 300, true)
  text('address_line1', 'address', 300, true)
  text('address_line2', 'second address line', 300, false)
  text('city', 'city', 100, true)
  if (!p.state_code) e.state_code = 'Choose the state.'
  else if (!IN_STATES.some((s) => s.code === p.state_code)) e.state_code = 'Choose a state from the list.'
  const pin = p.postal_code.replace(/\s/g, '')
  if (!pin) e.postal_code = 'Enter the PIN code.'
  else if (!PIN_PATTERN.test(pin)) e.postal_code = 'Enter the 6-digit PIN code, like 110001.'
  const gst = p.gstin.replace(/\s/g, '').toUpperCase()
  if (gst && !GSTIN_PATTERN.test(gst)) e.gstin = 'Enter the 15-character GSTIN, like 07ABCDE1234F1Z5, or leave it empty.'
  return e
}

export function toPartyIn(p: PartyDraft): PartyIn {
  const opt = (v: string) => (v.trim() ? v.trim() : undefined)
  const out: PartyIn = {
    legal_name: p.legal_name.trim(),
    address_line1: p.address_line1.trim(),
    city: p.city.trim(),
    state_code: p.state_code,
    postal_code: p.postal_code.replace(/\s/g, ''),
    country_code: 'IN',
  }
  const line2 = opt(p.address_line2)
  if (line2) out.address_line2 = line2
  const gst = p.gstin.replace(/\s/g, '').toUpperCase()
  if (gst) out.gstin = gst
  return out
}

export function fromPartyOut(p: PartyOut | null | undefined): PartyDraft {
  if (!p) return emptyParty()
  return {
    legal_name: p.legal_name ?? '',
    address_line1: p.address_line1 ?? '',
    address_line2: p.address_line2 ?? '',
    city: p.city ?? '',
    state_code: p.state_code ?? '',
    postal_code: p.postal_code ?? '',
    gstin: p.gstin ?? '',
  }
}

/** Two drafts that would send the same `PartyIn`. */
export const samePartyDraft = (a: PartyDraft, b: PartyDraft) => JSON.stringify(toPartyIn(a)) === JSON.stringify(toPartyIn(b))

/** "Mumbai, Maharashtra 400001" for a party read. */
export function partyPlace(p: Pick<PartyOut, 'city' | 'state_code' | 'postal_code'>): string {
  return [p.city, [stateName(p.state_code), p.postal_code].filter(Boolean).join(' ')].filter(Boolean).join(', ')
}

/* --------------------------------------------------------------------------------- Pick-lists */

/**
 * Suggestions only: the backend stores the seller's own words for `fabric_type` and `color`
 * (no vocabulary in attribute_dictionary.json). Marketplace value maps are applied later (SI2).
 */
export const FABRIC_TYPES = [
  'Cotton',
  'Cotton Blend',
  'Cotton Lycra',
  'Linen',
  'Rayon',
  'Viscose',
  'Modal',
  'Silk',
  'Art Silk',
  'Chanderi',
  'Georgette',
  'Chiffon',
  'Crepe',
  'Polyester',
  'Polyester Blend',
  'Denim',
  'Wool',
  'Khadi',
  'Muslin',
  'Organza',
  'Velvet',
  'Net',
] as const

export const COLOURS = [
  'Black',
  'White',
  'Off White',
  'Cream',
  'Beige',
  'Brown',
  'Grey',
  'Navy Blue',
  'Blue',
  'Sky Blue',
  'Teal',
  'Green',
  'Olive',
  'Mint',
  'Yellow',
  'Mustard',
  'Orange',
  'Peach',
  'Red',
  'Maroon',
  'Pink',
  'Magenta',
  'Purple',
  'Lavender',
  'Gold',
  'Silver',
  'Multicolour',
] as const

/* --------------------------------------------------------------------------------- 422 paths */

/**
 * A 422 detail `loc` (`["body", "size_chart", "rows", 0, "chest"]`) as a form key
 * (`size_chart.rows.0.chest`). Attributes become `attr.<key>`, the image list `images`. Pydantic
 * union tags such as `function-after[...]` are dropped. Null when it is not a body path.
 */
export function bodyErrorKey(loc: readonly (string | number)[]): string | null {
  const [where, ...rest] = loc
  if (where !== 'body' || !rest.length) return null
  const segs = rest.filter((s) => typeof s === 'number' || !/[[\]-]|^[A-Z]/.test(s)).map(String)
  if (!segs.length) return null
  if (segs[0] === 'attributes') return segs[1] ? `attr.${segs[1] === 'fabric_composition' ? 'fiber_composition' : segs[1]}` : 'attributes'
  if (segs[0] === 'image_uploads' || segs[0] === 'images' || segs[0] === 'id') return 'images'
  if (segs[0] === 'manufacturer') return segs[1] ? `manufacturer.${segs[1]}` : 'manufacturer'
  if (segs[0] === 'size_chart') {
    if (segs[1] === 'rows' && segs[2] !== undefined) return segs[3] ? `size_chart.rows.${segs[2]}.${segs[3]}` : `size_chart.rows.${segs[2]}.size`
    return 'size_chart'
  }
  return segs.join('.')
}
