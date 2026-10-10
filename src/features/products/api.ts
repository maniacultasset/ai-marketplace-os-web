/**
 * Products data layer. Live ops: products_list, products_get, products_create.
 * No update/delete/search/sort exists on the backend, so none is offered here.
 */
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, unwrap } from '@/api/client'
import { isApiError } from '@/api/errors'
import type { Schema } from '@/api/types'
import { PAGE_SIZE, useCursorList } from '@/hooks/use-cursor-list'
import { useKeys, type QueryKeys } from '@/lib/query-keys'
import { toCreateBody, toCreateJson, type ProductFormValues } from './schema'

export type Product = Schema<'ProductOut'>
export type ProductCreateBody = Schema<'ProductCreate'>

/** Backend `limit` bounds for GET /products. */
export const MAX_PAGE_SIZE = 200

export function fetchProductsPage(limit: number, cursor?: string) {
  return unwrap(api.GET('/products', { params: { query: { limit, cursor } } }))
}

/**
 * A product as the detail page shows it: `attribute_literals` holds the JSON text of every number
 * attribute a JS number can't reproduce (e.g. 12345678901234567890, stored exactly by the
 * backend but rounded by JSON.parse), so the page can print the stored digits.
 */
export type ProductDetail = Product & { attribute_literals: Record<string, string> }

class NumberLiteral {
  readonly source: string
  readonly value: number
  constructor(source: string, value: number) {
    this.source = source
    this.value = value
  }
}

/** JSON.parse that keeps the source text of lossy numbers (reviver `context.source`, ES2025). */
export function parseProductJson(text: string): ProductDetail {
  const reviver = (_key: string, value: unknown, context?: { source?: string }) =>
    typeof value === 'number' && context?.source !== undefined && context.source !== String(value)
      ? new NumberLiteral(context.source, value)
      : value
  const raw = JSON.parse(text, reviver as (key: string, value: unknown) => unknown) as Record<string, unknown>
  const literals: Record<string, string> = {}
  const unwrapLiterals = (v: unknown, attrKey?: string): unknown => {
    if (v instanceof NumberLiteral) {
      if (attrKey !== undefined) literals[attrKey] = v.source
      return v.value
    }
    if (Array.isArray(v)) return v.map((x) => unwrapLiterals(x))
    if (v && typeof v === 'object')
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, unwrapLiterals(x)]))
    return v
  }
  const product = unwrapLiterals({ ...raw, attributes: undefined }) as Product
  const attributes = raw.attributes as Record<string, unknown> | null | undefined
  if (attributes)
    product.attributes = Object.fromEntries(
      Object.entries(attributes).map(([k, x]) => [k, unwrapLiterals(x, k)]),
    ) as Product['attributes']
  else product.attributes = attributes as Product['attributes']
  return { ...product, attribute_literals: literals }
}

export async function fetchProduct(productId: string): Promise<ProductDetail> {
  const text = await unwrap(
    api.GET('/products/{product_id}', { params: { path: { product_id: productId } }, parseAs: 'text' }),
  )
  return parseProductJson(text)
}

/**
 * Newest-first product list with cursor paging. `pageSize` (dev/test override, 1..200) gets
 * its own cache entry under the list prefix, so invalidating `keys.products.list()` covers it.
 */
export function useProductsList(pageSize?: number) {
  const keys = useKeys()
  const limit = pageSize ?? PAGE_SIZE
  return useCursorList<Product>({
    queryKey: pageSize ? [...keys.products.list(), { limit }] : keys.products.list(),
    fetchPage: (cursor) => fetchProductsPage(limit, cursor),
  })
}

export const productQuery = (keys: QueryKeys, productId: string) =>
  queryOptions({
    // Own entry under the detail prefix (invalidating `products.detail(id)` covers it): the value
    // carries `attribute_literals`, which other screens caching the plain product don't fill.
    queryKey: [...keys.products.detail(productId), 'exact'] as const,
    queryFn: () => fetchProduct(productId),
  })

export function useProduct(productId: string | null | undefined) {
  const keys = useKeys()
  return useQuery({ ...productQuery(keys, productId ?? ''), enabled: !!productId })
}

export function useCreateProduct() {
  const keys = useKeys()
  const qc = useQueryClient()
  return useMutation({
    // Field errors / SKU conflict are shown inline by the form.
    meta: { toast: false },
    // Sent as hand-built JSON so number attributes keep the digits the user typed (see toCreateJson).
    mutationFn: async (values: ProductFormValues) =>
      parseProductJson(
        await unwrap(
          api.POST('/products', {
            body: toCreateBody(values),
            bodySerializer: () => toCreateJson(values),
            parseAs: 'text',
          }),
        ),
      ),
    onSuccess: (product) => {
      qc.setQueryData(productQuery(keys, product.id).queryKey, product)
      void qc.invalidateQueries({ queryKey: keys.products.list() })
    },
    onError: (err) => {
      // Lost response (status 0): the product may exist now, so the cached list can be stale.
      if (isApiError(err) && err.status === 0) void qc.invalidateQueries({ queryKey: keys.products.list() })
    },
  })
}
