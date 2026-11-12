/**
 * Category choices for adding products (guided form, spreadsheet help), on top of ./categories.ts
 * (shared with the product editor). Apparel is always offered. Lamps are offered only while the
 * backend's lamps switch is on (features/assist/flags.ts `useLampsEnabled`, SI14): while it is off
 * the backend refuses a new lamps listing, so offering lamps would lead nowhere.
 * There is no "Other": any other category saves, but the agent refuses it (CATEGORY_NOT_MAPPED).
 * The add form reads the categories from `GET /catalog/categories` (./catalog-categories.ts); this
 * list stands in while that read is pending or failed, so keep it in step with the backend templates.
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
 * The choices for a new product: apparel, plus lamps while the lamps switch is on. The current
 * value stays in the list even when it is not offered, so an old draft still shows it.
 */
export function brandCategoryChoices(lampsEnabled: boolean, current = ''): CategoryOption[] {
  const base: CategoryChoice[] = [...APPAREL_CATEGORIES, ...(lampsEnabled ? BRAND_ONLY.map((s) => ({ value: s, label: categoryLabel(s) })) : [])]
  const cur = current.trim()
  const all = cur && !base.some((c) => c.value === cur) ? [...base, { value: cur, label: categoryLabel(cur) }] : base
  return all.map((c) => ({ ...c, mapped: isMappedCategory(c.value) }))
}
