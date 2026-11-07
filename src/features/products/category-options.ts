/**
 * Category choices for adding products (guided form, spreadsheet help), on top of ./categories.ts
 * (shared with the product editor). Apparel is always offered. A mapped category outside apparel
 * (lamps) is offered only to a brand that already sells it, so an apparel brand never sees lamps.
 * There is no "Other": any other category saves, but the agent refuses it (CATEGORY_NOT_MAPPED).
 * There is no GET for the mapped categories yet, so keep these in step with the backend templates.
 */
import { APPAREL_CATEGORIES, categoryLabel, type CategoryChoice } from './categories'

/** Mapped (a template on both marketplaces) but not apparel. */
const BRAND_ONLY: readonly string[] = ['home_decor_lamps']

const LISTABLE: readonly string[] = [...APPAREL_CATEGORIES.map((c) => c.value), ...BRAND_ONLY]

/** Whether the agent has a listing template for this category. */
export const isMappedCategory = (slug: string) => LISTABLE.includes(slug.trim())

export const UNMAPPED_CATEGORY_HINT = 'The agent can’t list this category yet. Choose one from the list.'

export type CategoryOption = CategoryChoice & { mapped: boolean }

/**
 * The choices for a new product: apparel, plus lamps when the brand already has a lamp product.
 * The current value stays in the list even without a template, so an old draft still shows it.
 */
export function brandCategoryChoices(brandCategories: Iterable<string>, current = ''): CategoryOption[] {
  const used = new Set([...brandCategories].map((c) => c.trim()))
  const base: CategoryChoice[] = [...APPAREL_CATEGORIES, ...BRAND_ONLY.filter((s) => used.has(s)).map((s) => ({ value: s, label: categoryLabel(s) }))]
  const cur = current.trim()
  const all = cur && !base.some((c) => c.value === cur) ? [...base, { value: cur, label: categoryLabel(cur) }] : base
  return all.map((c) => ({ ...c, mapped: isMappedCategory(c.value) }))
}
