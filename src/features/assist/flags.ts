/**
 * V1.1 assist switches as the backend reports them (SI14). Each screen shows only when its switch
 * is on; while one is off the app looks exactly as before.
 *
 * - Category suggestion: `category_suggest_enabled` on a product detail read (false on lists). The
 *   switch is one per deployment, so the newest product's detail answers it for the add form too.
 *   A brand with no product yet sees no suggestion offer until its first product exists.
 * - Lamps: there is no flag field. While `CATEGORY_LAMPS_ENABLED` is off the backend answers
 *   `GET /catalog/requirements?category=home_decor_lamps` exactly like an unknown category (the
 *   marketplace facts only, services/requirements.py). So lamps count as on only when that answer
 *   differs from an unknown category's.
 */
import { useQuery } from '@tanstack/react-query'
import { api, unwrap } from '@/api/client'
import { useAllProducts } from '@/features/products-add/catalog'
import { fetchProduct } from '@/features/products/api'
import { useKeys } from '@/lib/query-keys'

export const LAMPS = 'home_decor_lamps'
/** A slug no template will ever use: what "unknown category" answers look like. */
const UNKNOWN_PROBE = 'zz_unknown_category'

type Req = { amazon?: readonly string[] | null; flipkart?: readonly string[] | null }

const same = (a: readonly string[] | null | undefined, b: readonly string[] | null | undefined) => {
  const x = [...(a ?? [])].sort()
  const y = [...(b ?? [])].sort()
  return x.length === y.length && x.every((v, i) => v === y[i])
}

/** Lamps are switched on when their requirements are more than an unknown category's (pure). */
export function lampsOnFrom(lamps: Req, unknown: Req): boolean {
  return !(same(lamps.amazon, unknown.amazon) && same(lamps.flipkart, unknown.flipkart))
}

const requirements = (category: string) =>
  unwrap(api.GET('/catalog/requirements', { params: { query: { category } } }))

/** Whether lamps can be offered. False while unknown or on a failed read: nothing is offered then. */
export function useLampsEnabled(): { enabled: boolean; pending: boolean } {
  const keys = useKeys()
  const q = useQuery({
    queryKey: [...keys.all(), 'assist', 'lamps'] as const,
    queryFn: async () => {
      const [lamps, unknown] = await Promise.all([requirements(LAMPS), requirements(UNKNOWN_PROBE)])
      return lampsOnFrom(lamps, unknown)
    },
    staleTime: 10 * 60_000,
    retry: false,
  })
  return { enabled: q.data === true, pending: q.isPending }
}

/**
 * Whether the classifier is on, read from the newest product's detail. False while unknown, so
 * the add form never offers "Let Kuinn suggest" on a guess.
 */
export function useCategorySuggestEnabled(): boolean {
  const keys = useKeys()
  const products = useAllProducts()
  const first = products.data?.rows[0]?.id ?? null
  const q = useQuery({
    queryKey: [...keys.all(), 'assist', 'category-suggest', first] as const,
    queryFn: async () => (await fetchProduct(first!)).category_suggest_enabled === true,
    enabled: !!first,
    staleTime: 10 * 60_000,
    retry: false,
  })
  return q.data === true
}
