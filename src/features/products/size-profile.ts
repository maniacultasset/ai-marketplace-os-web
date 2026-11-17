/**
 * Sizes that follow the category (client feedback: the size step asked chest for jeans).
 *
 *   GET /catalog/requirements?category=  ->  size_profile: null | {size_system, sizes, measures}
 *
 * The backend's profile wins when the field is in the answer. A backend without the field (or no
 * answer yet) falls back to the static map below, which matches the backend's table, so jeans get
 * waist sizes before the field ships. A category with no profile (lamps, none chosen yet, unknown)
 * keeps today's chart: letter sizes and chest, waist, hip, length.
 */
import type { Schema } from '@/api/types'
import { COMMON_SIZES, DEFAULT_MEASURES, MEASURES, type Measure } from './intake-model'

export type SizeProfileOut = Schema<'SizeProfileOut'>
export type RequirementLevels = Schema<'RequirementLevelsOut'>

export interface SizeProfile {
  sizeSystem: 'alpha' | 'waist'
  /** The size chips the chart offers, in order. */
  sizes: readonly string[]
  /** The chart columns shown by default, in order. */
  measures: readonly Measure[]
}

export type CategoryGroup = 'topwear' | 'bottomwear' | 'ethnic' | 'home' | 'other'

/** Today's chart: what every category without its own profile keeps. */
export const DEFAULT_SIZE_PROFILE: SizeProfile = { sizeSystem: 'alpha', sizes: COMMON_SIZES, measures: DEFAULT_MEASURES }

const ALPHA = COMMON_SIZES
const evenRange = (from: number, to: number) => Array.from({ length: (to - from) / 2 + 1 }, (_, i) => String(from + i * 2))
const WAIST_26_44 = evenRange(26, 44)
const WAIST_26_40 = evenRange(26, 40)
const BOTTOM_LONG: readonly Measure[] = ['waist', 'hip', 'inseam', 'length']
const BOTTOM_SHORT: readonly Measure[] = ['waist', 'hip', 'length']

/** The backend's table (contract C), for a backend that does not send `size_profile` yet. */
export const FALLBACK_SIZE_PROFILES: Readonly<Record<string, SizeProfile>> = {
  tshirts: DEFAULT_SIZE_PROFILE,
  ethnic_wear_kurta_sets: DEFAULT_SIZE_PROFILE,
  jeans: { sizeSystem: 'waist', sizes: WAIST_26_44, measures: BOTTOM_LONG },
  trousers: { sizeSystem: 'waist', sizes: WAIST_26_44, measures: BOTTOM_LONG },
  track_pants: { sizeSystem: 'alpha', sizes: ALPHA, measures: BOTTOM_LONG },
  shorts: { sizeSystem: 'waist', sizes: WAIST_26_40, measures: BOTTOM_SHORT },
  skirts: { sizeSystem: 'alpha', sizes: ALPHA, measures: BOTTOM_SHORT },
}

/** The group of each category the web knows (the backend's `group` on CategoryOut). */
const GROUP: Readonly<Record<string, CategoryGroup>> = {
  tshirts: 'topwear',
  ethnic_wear_kurta_sets: 'ethnic',
  home_decor_lamps: 'home',
  jeans: 'bottomwear',
  trousers: 'bottomwear',
  track_pants: 'bottomwear',
  shorts: 'bottomwear',
  skirts: 'bottomwear',
}

/** The category's group; null for none chosen or a category the web does not know. */
export function categoryGroup(category: string | null | undefined): CategoryGroup | null {
  return GROUP[(category ?? '').trim()] ?? null
}

export const isBottomwear = (category: string | null | undefined) => categoryGroup(category) === 'bottomwear'

const isMeasure = (m: string): m is Measure => (MEASURES as readonly string[]).includes(m)

function fromOut(p: SizeProfileOut): SizeProfile | null {
  const measures = p.measures.filter(isMeasure)
  const sizes = p.sizes.map((s) => s.trim()).filter(Boolean)
  if (!measures.length && !sizes.length) return null
  return { sizeSystem: p.size_system, sizes: sizes.length ? sizes : COMMON_SIZES, measures: measures.length ? measures : DEFAULT_MEASURES }
}

/**
 * The size profile the chart uses (pure). `req` is the requirements answer for this category:
 * its `size_profile` wins when present (null there means "no size step", which keeps today's
 * chart); otherwise the static map; otherwise today's chart.
 */
export function sizeProfileFor(
  category: string | null | undefined,
  req?: { category?: string; size_profile?: SizeProfileOut | null } | null,
): SizeProfile {
  const c = (category ?? '').trim()
  if (req && (req.category == null || req.category === c) && req.size_profile !== undefined)
    return (req.size_profile && fromOut(req.size_profile)) || DEFAULT_SIZE_PROFILE
  return FALLBACK_SIZE_PROFILES[c] ?? DEFAULT_SIZE_PROFILE
}

/* ------------------------------------------------------------- Garment-part attribute fields */

/** The category template names this key on some marketplace (any level but `unsupported`). */
export function levelsName(levels: RequirementLevels | null | undefined, key: string): boolean {
  if (!levels) return false
  return [levels.amazon, levels.flipkart].some((l) => l?.[key] != null && l[key] !== 'unsupported')
}

/**
 * Whether a garment-part field shows for this category (pure). `top` fields (neckline, sleeve
 * length) hide for bottomwear; `bottom` fields (rise, leg style, closure, waist style) show only
 * for it. A field with a value, or one the category's template names, always shows; a field with
 * no part always shows.
 */
export function showsForCategory(
  part: 'top' | 'bottom' | undefined,
  key: string,
  category: string | null | undefined,
  value: string | undefined,
  levels?: RequirementLevels | null,
): boolean {
  if (!part || (value ?? '').trim() || levelsName(levels, key)) return true
  return part === 'bottom' ? isBottomwear(category) : !isBottomwear(category)
}
