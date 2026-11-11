/**
 * The categories a seller can pick, read from the backend (`GET /catalog/categories`, client
 * feedback 11 Nov). Each carries its plain label, whether it can be picked for a new product
 * (lamps only while the backend's lamps switch is on) and, per marketplace, the product type the
 * listing sends. While the read is pending or failed the pickers fall back to the built-in list
 * (./category-options.ts), so the form never blocks on it.
 */
import { useQuery } from '@tanstack/react-query'
import { api, unwrap } from '@/api/client'
import type { Schema } from '@/api/types'
import { useKeys } from '@/lib/query-keys'
import type { CategoryOption } from './category-options'

export type CatalogCategory = Schema<'CategoryOut'>
export type CatalogMapping = Schema<'MarketplaceCategoryOut'>
export type CategoryCatalog = Schema<'CategoryCatalogOut'>
type Marketplace = CatalogMapping['marketplace']

const NAME: Record<Marketplace, string> = { amazon: 'Amazon', flipkart: 'Flipkart' }
const ORDER: readonly Marketplace[] = ['amazon', 'flipkart']

export function useCatalogCategories() {
  const keys = useKeys()
  return useQuery({
    queryKey: [...keys.all(), 'catalog', 'categories'] as const,
    queryFn: () => unwrap(api.GET('/catalog/categories')),
    staleTime: 10 * 60_000,
    retry: 1,
  })
}

/**
 * The picker's choices from the catalog (pure): the categories that can be picked, plus the
 * current value when it is another one (an old draft or a switched-off category still shows).
 */
export function catalogChoices(items: readonly CatalogCategory[], current = ''): CategoryOption[] {
  const cur = current.trim()
  const out: CategoryOption[] = items.filter((c) => c.enabled).map((c) => ({ value: c.category, label: c.label, mapped: true }))
  if (cur && !out.some((c) => c.value === cur)) {
    const known = items.find((c) => c.category === cur)
    out.push({ value: cur, label: known?.label ?? cur, mapped: !!known })
  }
  return out
}

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/** "Kurta (KURTA)" for an upper-case code, "Kurta" when the code is the name in other words. */
export function typeText(m: Pick<CatalogMapping, 'product_type' | 'product_type_name'>): string {
  const code = m.product_type
  const name = m.product_type_name || code
  const sameWords = squash(code) === squash(name) && code !== code.toUpperCase()
  return sameWords ? name : `${name} (${code})`
}

/**
 * "On Amazon: Kurta (KURTA) · On Flipkart: Kurta" for the marketplaces the product is listed on
 * (every one the category maps to when none is ticked yet); null when nothing maps (pure).
 */
export function mappingText(item: CatalogCategory | null | undefined, listOn: readonly Marketplace[] = []): string | null {
  if (!item) return null
  const wanted = listOn.length ? listOn : ORDER
  const parts = ORDER.filter((m) => wanted.includes(m))
    .map((m) => (item.marketplaces ?? []).find((x) => x.marketplace === m))
    .filter((x): x is CatalogMapping => !!x)
    .map((x) => `On ${NAME[x.marketplace]}: ${typeText(x)}`)
  return parts.length ? parts.join(' · ') : null
}

/** The marketplaces ticked for the product that have no template for the category (pure). */
export function unmappedOn(item: CatalogCategory | null | undefined, listOn: readonly Marketplace[]): Marketplace[] {
  if (!item) return []
  return ORDER.filter((m) => listOn.includes(m) && !(item.marketplaces ?? []).some((x) => x.marketplace === m))
}

export const marketplaceName = (m: Marketplace) => NAME[m]
