/**
 * SI12 seller fields: HSN code, the shipping package and the country of origin. Pure rules shared by
 * the guided form (create) and the product editor (PATCH), mirroring the backend
 * (`services/intake_values.py`: `check_hsn`, `normalize_country`, `check_dimension`, `check_grams`;
 * `schemas/products.py` `PackageIn`):
 *
 * - HSN: 4, 6 or 8 digits.
 * - Package: length, breadth and height in cm are sent together (all set or all empty), each above 0,
 *   at most 99999.99 and at most 2 decimals; the weight is whole grams, 1 to 2,000,000.
 * - Country: a two-letter ISO code, upper-cased.
 */
import type { Schema } from '@/api/types'

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

/** The countries garments sold in India most often come from, India first. */
export const COUNTRIES: readonly { code: string; name: string }[] = [
  { code: 'IN', name: 'India' },
  { code: 'BD', name: 'Bangladesh' },
  { code: 'CN', name: 'China' },
  { code: 'LK', name: 'Sri Lanka' },
  { code: 'NP', name: 'Nepal' },
  { code: 'VN', name: 'Vietnam' },
  { code: 'TR', name: 'Turkey' },
  { code: 'ID', name: 'Indonesia' },
  { code: 'TH', name: 'Thailand' },
  { code: 'KH', name: 'Cambodia' },
  { code: 'PK', name: 'Pakistan' },
  { code: 'IT', name: 'Italy' },
  { code: 'PT', name: 'Portugal' },
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
]

export const countryName = (code: string | null | undefined): string => {
  if (!code) return ''
  const up = code.toUpperCase()
  return COUNTRIES.find((c) => c.code === up)?.name ?? up
}

export function countryProblem(raw: string): string | null {
  const v = raw.trim()
  if (!v) return null
  return /^[A-Za-z]{2}$/.test(v) ? null : 'Choose a country from the list.'
}

export const normalizeCountry = (raw: string) => raw.trim().toUpperCase()
