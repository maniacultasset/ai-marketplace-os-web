/**
 * The categories the product editor offers. Amazon and Flipkart templates exist for kurta sets,
 * t-shirts and lamps (backend db/seed_data/platform_templates.json), and bottomwear (jeans,
 * trousers, track pants, shorts, skirts) from Nov 2026. Offering only the apparel ones is a
 * product choice for the V1 apparel brands, not a backend limit. The product's own category is
 * always kept in the list, so an existing lamp product still shows its value. The pickers prefer
 * the backend's list (`GET /catalog/categories`, ./catalog-categories.ts); this one stands in.
 */
export interface CategoryChoice {
  value: string
  label: string
}

/** The picker's groups, in the order they show (contract: CategoryOut.group). */
export const CATEGORY_GROUPS = ['topwear', 'bottomwear', 'ethnic', 'home', 'other'] as const
export type CategoryGroup = (typeof CATEGORY_GROUPS)[number]

export const GROUP_LABEL: Record<CategoryGroup, string> = {
  topwear: 'Topwear',
  bottomwear: 'Bottomwear',
  ethnic: 'Ethnic',
  home: 'Home',
  other: 'Other',
}

export const APPAREL_CATEGORIES: readonly CategoryChoice[] = [
  { value: 'ethnic_wear_kurta_sets', label: 'Kurta sets' },
  { value: 'tshirts', label: 'T-shirts' },
  { value: 'jeans', label: 'Jeans' },
  { value: 'trousers', label: 'Trousers' },
  { value: 'track_pants', label: 'Track pants' },
  { value: 'shorts', label: 'Shorts' },
  { value: 'skirts', label: 'Skirts' },
]

const ALL_LABELS: Record<string, string> = {
  ...Object.fromEntries(APPAREL_CATEGORIES.map((c) => [c.value, c.label])),
  home_decor_lamps: 'Lamps',
}

/** The group of each known slug, for a catalog read without `group` (an older backend). */
const SLUG_GROUP: Record<string, CategoryGroup> = {
  tshirts: 'topwear',
  jeans: 'bottomwear',
  trousers: 'bottomwear',
  track_pants: 'bottomwear',
  shorts: 'bottomwear',
  skirts: 'bottomwear',
  ethnic_wear_kurta_sets: 'ethnic',
  home_decor_lamps: 'home',
}

const isGroup = (g: unknown): g is CategoryGroup => typeof g === 'string' && (CATEGORY_GROUPS as readonly string[]).includes(g)

/** The backend's group when it sent a known one, else the built-in one; "other" for the rest (pure). */
export function categoryGroup(slug: string, group?: string | null): CategoryGroup {
  if (isGroup(group)) return group
  return SLUG_GROUP[slug.trim()] ?? 'other'
}

/** Other words sellers use, so the search finds the category ("denim" finds Jeans). */
export const CATEGORY_KEYWORDS: Record<string, readonly string[]> = {
  tshirts: ['tee', 'tees', 't shirt', 'tshirt', 'top'],
  jeans: ['denim', 'pants', 'bottom'],
  trousers: ['pants', 'chinos', 'formal', 'cargo', 'bottom'],
  track_pants: ['joggers', 'trackpants', 'lowers', 'pants', 'bottom'],
  shorts: ['bermuda', 'bottom'],
  skirts: ['skirt', 'bottom'],
  ethnic_wear_kurta_sets: ['kurta', 'kurti', 'ethnic', 'set'],
  home_decor_lamps: ['lamp', 'light', 'decor'],
}

/** "ethnic_wear_kurta_sets" → "Kurta sets"; an unknown slug reads as words. */
export function categoryLabel(slug: string): string {
  const known = ALL_LABELS[slug]
  if (known) return known
  const s = slug.replace(/[_-]+/g, ' ').trim()
  return s ? s[0]!.toUpperCase() + s.slice(1) : slug
}

/** The choices for one product: the mapped ones, plus its current category when it is another. */
export function categoryChoices(current: string): CategoryChoice[] {
  const c = current.trim()
  if (!c || APPAREL_CATEGORIES.some((x) => x.value === c)) return [...APPAREL_CATEGORIES]
  return [...APPAREL_CATEGORIES, { value: c, label: categoryLabel(c) }]
}

/**
 * Whether the product's category may change: the backend refuses once it has a listing.
 * `unknown`: the listings read failed, so it is treated as fixed until a retry answers.
 */
export type CategoryLock = 'open' | 'locked' | 'pending' | 'unknown'
