/**
 * The categories the product editor offers. Amazon and Flipkart templates exist for kurta sets,
 * t-shirts and lamps (backend db/seed_data/platform_templates.json); offering only the apparel
 * ones is a product choice for the V1 apparel brands, not a backend limit. The product's own
 * category is always kept in the list, so an existing lamp product still shows its value.
 */
export interface CategoryChoice {
  value: string
  label: string
}

export const APPAREL_CATEGORIES: readonly CategoryChoice[] = [
  { value: 'ethnic_wear_kurta_sets', label: 'Kurta sets' },
  { value: 'tshirts', label: 'T-shirts' },
]

const ALL_LABELS: Record<string, string> = {
  ethnic_wear_kurta_sets: 'Kurta sets',
  tshirts: 'T-shirts',
  home_decor_lamps: 'Lamps',
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
