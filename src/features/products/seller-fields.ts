/**
 * SI12 seller fields: HSN code, the shipping package and the country of origin. Pure rules shared by
 * the guided form (create) and the product editor (PATCH), mirroring the backend
 * (`services/intake_values.py`: `check_hsn`, `normalize_country`, `check_dimension`, `check_grams`;
 * `schemas/products.py` `PackageIn`):
 *
 * - HSN: 4, 6 or 8 digits.
 * - Package: length, breadth and height in cm are sent together (all set or all empty), each above 0,
 *   at most 99999.99 and at most 2 decimals; the weight is whole grams, 1 to 2,000,000.
 * - Country: an assigned ISO 3166-1 alpha-2 code (`./countries`), upper-cased.
 */
import type { Schema } from '@/api/types'

import { COUNTRIES, COUNTRY_CODES } from './countries'

export { COUNTRIES }

export type PackageIn = Schema<'PackageIn'>
export type PackageOut = Schema<'PackageOut'>

export const HSN_PATTERN = /^(?:[0-9]{4}|[0-9]{6}|[0-9]{8})$/
const DIM_PATTERN = /^(0|[1-9][0-9]{0,4})(\.[0-9]{1,2})?$/
const GRAMS_PATTERN = /^[1-9][0-9]{0,6}$/
export const MAX_GRAMS = 2_000_000
export const MAX_DIMENSION = 99999.99

/**
 * The 4-digit heading suggested for each listable category, the same reviewed map the backend
 * answers as `suggestions.hsn_code` (`services/hsn_suggest.py`). The guided form uses it before
 * the product exists; the editor uses the product read. The seller confirms it by saving.
 */
export const HSN_BY_CATEGORY: Readonly<Record<string, string>> = {
  tshirts: '6109',
  ethnic_wear_kurta_sets: '6204',
  home_decor_lamps: '9405',
}

export const suggestHsn = (category: string): string | null => HSN_BY_CATEGORY[category.trim()] ?? null

export function hsnProblem(raw: string): string | null {
  const v = raw.trim()
  if (!v) return null
  return HSN_PATTERN.test(v) ? null : 'Enter the HSN code as 4, 6 or 8 digits, like 6109.'
}

/* ------------------------------------------------------------------------------------- Package */

export interface PackageDraft {
  length: string
  breadth: string
  height: string
  /** Grams. */
  weight: string
}

export const DIMS = ['length', 'breadth', 'height'] as const
export type Dim = (typeof DIMS)[number]
export const DIM_LABEL: Record<Dim, string> = { length: 'Length', breadth: 'Breadth', height: 'Height' }

export const emptyPackage = (): PackageDraft => ({ length: '', breadth: '', height: '', weight: '' })

const dimsFilled = (p: PackageDraft) => DIMS.filter((d) => p[d].trim() !== '').length

export const packageHasSize = (p: PackageDraft) => dimsFilled(p) === DIMS.length
export const packageHasWeight = (p: PackageDraft) => p.weight.trim() !== ''
export const packageEmpty = (p: PackageDraft) => dimsFilled(p) === 0 && !packageHasWeight(p)

/** Keys `package.length|breadth|height|weight` (and `package` for the three together). */
export function packageProblems(p: PackageDraft): Record<string, string> {
  const e: Record<string, string> = {}
  for (const d of DIMS) {
    const v = p[d].trim()
    if (!v) continue
    if (!DIM_PATTERN.test(v) || Number(v) <= 0) e[`package.${d}`] = `Enter the ${d} in cm, above 0 with up to 2 decimals.`
  }
  const n = dimsFilled(p)
  if (n > 0 && n < DIMS.length && !Object.keys(e).length) e.package = 'Enter all three sizes (length, breadth and height), or none.'
  const w = p.weight.trim()
  if (w && (!GRAMS_PATTERN.test(w) || Number(w) > MAX_GRAMS)) e['package.weight'] = 'Enter the weight in whole grams, from 1 to 20,00,000.'
  return e
}

/* ------------------------------------------------------------------------ Package plausibility */

/**
 * Client item 15: does the packed box look right for its category? The same per-category ranges as
 * the backend (`services/package_sense.py`; keep the two in step). Outside the range is a warning,
 * never an error: an odd but true box still saves. A likely unit slip (grams typed for kilograms,
 * millimetres or metres for centimetres) names what the seller probably meant.
 */
interface PackageRange {
  minCm: number
  maxCm: number
  minG: number
  maxG: number
  /** What the box holds, for "heavy for clothing". */
  noun: string | null
}

const APPAREL: PackageRange = { minCm: 0.3, maxCm: 100, minG: 20, maxG: 5_000, noun: 'clothing' }
const LAMPS: PackageRange = { minCm: 1, maxCm: 200, minG: 50, maxG: 30_000, noun: 'a lamp' }
const ANY_BOX: PackageRange = { minCm: 0.1, maxCm: 300, minG: 5, maxG: 100_000, noun: null }
export const PACKAGE_RANGES: Readonly<Record<string, PackageRange>> = {
  tshirts: APPAREL,
  ethnic_wear_kurta_sets: APPAREL,
  home_decor_lamps: LAMPS,
}

/** 12, 12.5, 0.25: at most 2 decimals, Indian digit grouping. */
const num = (n: number) => (Math.round(n * 100) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })
const forNoun = (r: PackageRange) => (r.noun ? ` for ${r.noun}` : '')

function weightWarning(g: number, r: PackageRange): string | null {
  if (g >= r.minG && g <= r.maxG) return null
  if (g > r.maxG) {
    const kg = g / 1000
    if (g % 1000 === 0 && kg >= r.minG && kg <= r.maxG) return `This box weighs ${num(kg)} kg. Did you mean ${num(kg)} g?`
    return `This box weighs ${num(kg)} kg, which is heavy${forNoun(r)}. Check the weight.`
  }
  if (g * 1000 >= r.minG && g * 1000 <= r.maxG) return `This box weighs ${num(g)} g. Did you mean ${num(g)} kg (${num(g * 1000)} g)?`
  return `This box weighs only ${num(g)} g, which is light${forNoun(r)}. Check the weight.`
}

function sizeWarning(sides: readonly number[], r: PackageRange): string | null {
  const big = Math.max(...sides)
  const small = Math.min(...sides)
  const inRange = (n: number) => n >= r.minCm && n <= r.maxCm
  if (big > r.maxCm) {
    if (sides.every((s) => inRange(s / 10))) return `A ${num(big)} cm side is ${num(big / 100)} m long. Did you mean ${num(big)} mm (${num(big / 10)} cm)?`
    return `A ${num(big)} cm side is ${num(big / 100)} m long, which is large${forNoun(r)}. Check the size.`
  }
  if (small < r.minCm) {
    if (sides.every((s) => inRange(s * 100))) return `A ${num(small)} cm side is very thin. Did you mean ${num(small)} m (${num(small * 100)} cm)?`
    return `A ${num(small)} cm side is very thin${forNoun(r)}. Check the size is in cm.`
  }
  return null
}

export interface PackageWarnings {
  size?: string
  weight?: string
}

/** Plausibility warnings for a draft whose values pass `packageProblems` (an invalid value gets none). */
export function packageWarnings(p: PackageDraft, category: string | null | undefined): PackageWarnings {
  const r = PACKAGE_RANGES[(category ?? '').trim()] ?? ANY_BOX
  const problems = packageProblems(p)
  const out: PackageWarnings = {}
  const sizeBad = problems.package !== undefined || DIMS.some((d) => problems[`package.${d}`] !== undefined)
  if (packageHasSize(p) && !sizeBad) {
    const size = sizeWarning(DIMS.map((d) => Number(p[d].trim())), r)
    if (size) out.size = size
  }
  if (packageHasWeight(p) && !problems['package.weight']) {
    const weight = weightWarning(Number(p.weight.trim()), r)
    if (weight) out.weight = weight
  }
  return out
}

const dimNumber = (v: string) => Number(v.trim())

/** The PackageIn for a complete draft, or null when nothing is filled. Call after `packageProblems` is empty. */
export function toPackageIn(p: PackageDraft): PackageIn | null {
  if (packageEmpty(p)) return null
  const out: PackageIn = {}
  if (packageHasSize(p)) {
    out.length_cm = dimNumber(p.length)
    out.breadth_cm = dimNumber(p.breadth)
    out.height_cm = dimNumber(p.height)
  }
  if (packageHasWeight(p)) out.weight_g = Number(p.weight.trim())
  return out
}

const dimText = (v: number | string | null | undefined) => (v === null || v === undefined || v === '' ? '' : String(Number(v)))

export function fromPackageOut(p: PackageOut | null | undefined): PackageDraft {
  return {
    length: dimText(p?.length_cm),
    breadth: dimText(p?.breadth_cm),
    height: dimText(p?.height_cm),
    weight: p?.weight_g == null ? '' : String(p.weight_g),
  }
}

export const samePackage = (a: PackageDraft, b: PackageDraft) => JSON.stringify(toPackageIn(a)) === JSON.stringify(toPackageIn(b))

/**
 * The PATCH value for a changed package (a JSON merge patch): `null` clears all four; otherwise the
 * size travels as a set (all three, or all null to clear) and the weight on its own.
 */
export function packagePatch(base: PackageDraft, next: PackageDraft): PackageIn | null | undefined {
  if (samePackage(base, next)) return undefined
  if (packageEmpty(next)) return null
  const out: PackageIn = {}
  const sizeNow = packageHasSize(next)
  const sizeBefore = packageHasSize(base)
  if (sizeNow && DIMS.some((d) => dimNumber(next[d]) !== dimNumber(base[d]) || !sizeBefore)) {
    out.length_cm = dimNumber(next.length)
    out.breadth_cm = dimNumber(next.breadth)
    out.height_cm = dimNumber(next.height)
  } else if (!sizeNow && sizeBefore) {
    out.length_cm = null
    out.breadth_cm = null
    out.height_cm = null
  }
  const wNow = next.weight.trim()
  if (wNow !== base.weight.trim()) out.weight_g = wNow ? Number(wNow) : null
  return Object.keys(out).length ? out : undefined
}

/** "30 × 25 × 3 cm · 250 g", or the parts there are. */
export function packageText(p: PackageOut | null | undefined): string {
  if (!p) return ''
  const d = fromPackageOut(p)
  const parts: string[] = []
  if (packageHasSize(d)) parts.push(`${d.length} × ${d.breadth} × ${d.height} cm`)
  if (d.weight) parts.push(`${Number(d.weight).toLocaleString('en-IN')} g`)
  return parts.join(' · ')
}

/* ------------------------------------------------------------------------------------- Country */

export const countryName = (code: string | null | undefined): string => {
  if (!code) return ''
  const up = code.toUpperCase()
  return COUNTRIES.find((c) => c.code === up)?.name ?? up
}

export function countryProblem(raw: string): string | null {
  const v = raw.trim()
  if (!v) return null
  return /^[A-Za-z]{2}$/.test(v) && COUNTRY_CODES.has(v.toUpperCase()) ? null : 'Choose a country from the list.'
}

export const normalizeCountry = (raw: string) => raw.trim().toUpperCase()
