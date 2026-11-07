/**
 * The categories a product can be listed under: those with a marketplace template on both Amazon
 * and Flipkart (backend db/seed_data/platform_templates.json). Any other category saves, then fails
 * at generate with CATEGORY_NOT_MAPPED, so the editor offers only these plus the product's own.
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

/** Whether the product's category may change: the backend refuses once it has a listing. */
export type CategoryLock = 'open' | 'locked' | 'pending'
