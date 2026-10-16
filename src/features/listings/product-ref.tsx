/**
 * ListingOut names its product only by id. Show the SKU and title from one GET /products page
 * (200, cached under `products.list()` so product invalidations reach it); a product beyond that
 * page is read on its own (GET /products/{id}, shared with the product detail cache).
 */
import { useQuery } from '@tanstack/react-query'
import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { fetchProductsPage, productQuery, type Product } from '@/features/products/api'
import { Skeleton } from '@/components/ui/skeleton'
import { useKeys } from '@/lib/query-keys'
import { cn } from '@/lib/utils'

type ProductIndex = { map: Map<string, Pick<Product, 'id' | 'sku' | 'title'>>; ready: boolean }

const IndexContext = createContext<ProductIndex | null>(null)

export function useProductIndexQuery() {
  const keys = useKeys()
  const q = useQuery({
    queryKey: [...keys.products.list(), { index: 200 }] as const,
    queryFn: () => fetchProductsPage(200),
    staleTime: 60_000,
  })
  return useMemo<ProductIndex>(
    () => ({ map: new Map((q.data?.data ?? []).map((p) => [p.id, p])), ready: !q.isPending }),
    [q.data, q.isPending],
  )
}

export function ProductIndexProvider({ children }: { children: ReactNode }) {
  const index = useProductIndexQuery()
  return <IndexContext.Provider value={index}>{children}</IndexContext.Provider>
}

/** SKU + title for a product id. Inside a ProductIndexProvider it reads the shared page first. */
export function useProductRef(productId: string) {
  const index = useContext(IndexContext)
  const keys = useKeys()
  const fromIndex = index?.map.get(productId)
  const single = useQuery({
    ...productQuery(keys, productId),
    enabled: !fromIndex && (index ? index.ready : true),
    staleTime: 60_000,
  })
  const product = fromIndex ?? single.data
  return { product, loading: !product && (index ? !index.ready || single.isPending : single.isPending), error: single.error }
}

export function ProductRef({ productId, className }: { productId: string; className?: string }) {
  const { product, loading } = useProductRef(productId)
  if (loading)
    return (
      <span className={cn('flex flex-col gap-1.5', className)}>
        <Skeleton className="h-3.5 w-20" />
        <Skeleton className="h-3 w-40" />
      </span>
    )
  if (!product)
    return (
      <span className={cn('block min-w-0 text-muted-foreground', className)} title={productId}>
        <span className="block text-[13px]">Product unavailable</span>
        <code className="block truncate font-mono text-[11px]">{productId.slice(0, 8)}</code>
      </span>
    )
  return (
    <span className={cn('block min-w-0', className)}>
      <code className="block truncate font-mono text-xs text-foreground" data-testid="listing-sku">
        {product.sku}
      </code>
      <span className="block truncate text-[13px] text-muted-foreground" title={product.title}>
        {product.title}
      </span>
    </span>
  )
}
