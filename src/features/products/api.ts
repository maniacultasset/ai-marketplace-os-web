/**
 * Products data layer. Live ops: products_list, products_get (with ETag), products_create,
 * products_update (PATCH, If-Match), brand_profile_get / brand_profile_update and images_delete.
 * No product delete, search or sort exists on the backend, so none is offered here.
 */
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, unwrap } from '@/api/client'
import { isApiError } from '@/api/errors'
import { ifMatchHeader, unwrapVersioned, type Versioned } from '@/api/etag'
import type { Schema } from '@/api/types'
import { PAGE_SIZE, useCursorList } from '@/hooks/use-cursor-list'
import { useKeys, type QueryKeys } from '@/lib/query-keys'
import { toCreateBody, toCreateJson, type ProductFormValues } from './schema'

export type Product = Schema<'ProductOut'>
export type ProductCreateBody = Schema<'ProductCreate'>
export type ProductPatchBody = Schema<'ProductPatch'>
export type BrandProfile = Schema<'BrandProfileOut'>
export type BrandProfileBody = Schema<'BrandProfileIn'>

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
export type ProductDetail = Product & {
  attribute_literals: Record<string, string>
  /** The `ETag` the read was served with: send it back as If-Match on PATCH. */
  etag?: string | null
}

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
  const { data: text, etag } = await unwrapVersioned(
    api.GET('/products/{product_id}', { params: { path: { product_id: productId } }, parseAs: 'text' }),
  )
  return { ...parseProductJson(text), etag }
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
    mutationFn: async (values: ProductFormValues): Promise<ProductDetail> => {
      // The 201 carries the product's ETag: cache it, so an edit right after can PATCH.
      const { data: text, etag } = await unwrapVersioned(
        api.POST('/products', {
          body: toCreateBody(values),
          bodySerializer: () => toCreateJson(values),
          parseAs: 'text',
        }),
      )
      return { ...parseProductJson(text), etag }
    },
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

/** PATCH /products/{id} under If-Match; the product as the detail page reads it, with its new ETag. */
export async function patchProduct(productId: string, body: ProductPatchBody, etag: string | null | undefined): Promise<ProductDetail> {
  const { data: text, etag: next } = await unwrapVersioned(
    api.PATCH('/products/{product_id}', {
      params: { path: { product_id: productId }, header: ifMatchHeader(etag) },
      body,
      parseAs: 'text',
    }),
  )
  return { ...parseProductJson(text), etag: next }
}

/**
 * PATCH /products/{id} with If-Match = the ETag the edit started from (never a newer cached one:
 * that would overwrite someone else's save). 409 STALE_VERSION and 422s are handled inline.
 */
export function useUpdateProduct(productId: string) {
  const keys = useKeys()
  const qc = useQueryClient()
  return useMutation({
    meta: { toast: false },
    mutationFn: ({ body, etag }: { body: ProductPatchBody; etag: string | null | undefined }) => patchProduct(productId, body, etag),
    onSuccess: (product) => {
      qc.setQueryData(productQuery(keys, productId).queryKey, product)
      void qc.invalidateQueries({ queryKey: keys.products.list() })
    },
  })
}

/** DELETE /images/{image_id} (204). The product read is refreshed so its image list drops it. */
export function useDeleteImage(productId: string) {
  const keys = useKeys()
  const qc = useQueryClient()
  return useMutation({
    meta: { toast: false },
    mutationFn: (imageId: string) => unwrap(api.DELETE('/images/{image_id}', { params: { path: { image_id: imageId } } })),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.products.detail(productId) }),
  })
}

export const fetchBrandProfile = () => unwrapVersioned(api.GET('/brand-profile'))

/** GET /brand-profile with its ETag: the default manufacturer every product inherits. */
export function useBrandManufacturer(enabled = true) {
  const keys = useKeys()
  return useQuery({ queryKey: [...keys.brand.all(), 'brand-profile'] as const, queryFn: fetchBrandProfile, enabled, staleTime: 60_000 })
}

/** PATCH /brand-profile (settings:manage) with If-Match. */
export function useSaveBrandManufacturer() {
  const keys = useKeys()
  const qc = useQueryClient()
  return useMutation({
    meta: { toast: false },
    mutationFn: ({ body, etag }: { body: BrandProfileBody; etag: string | null }) =>
      unwrapVersioned(api.PATCH('/brand-profile', { params: { header: ifMatchHeader(etag) }, body })),
    onSuccess: (next: Versioned<BrandProfile>) => {
      qc.setQueryData([...keys.brand.all(), 'brand-profile'], next)
      // Products inherit the default: their effective manufacturer changed too.
      void qc.invalidateQueries({ queryKey: keys.products.all() })
    },
  })
}
