/**
 * Catalog data: every product, every listing and every open issue of the brand, read page by page
 * (limit 200, the backend maximum) so the Products table can show real totals, variant counts and
 * per-marketplace cells. Backend: routers/products.py `products_list` (newest first, no filters),
 * routers/listings.py `listings_list`, routers/issues.py `issues_list` (status=open).
 *
 * Each walk stops at WALK_MAX_PAGES. When a walk stops early the screen says so ("first N loaded")
 * instead of presenting a partial count as the total.
 */
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { api, unwrap } from '@/api/client'
import type { Page } from '@/api/types'
import { useKeys } from '@/lib/query-keys'
import { buildCatalog, type Issue, type Listing, type Product } from './catalog-model'

export const WALK_PAGE_SIZE = 200
export const WALK_MAX_PAGES = 10

export interface Walked<T> {
  rows: T[]
  /** The API still had more rows when the walk stopped. */
  truncated: boolean
}

export async function walkPages<T>(fetchPage: (cursor: string | undefined) => Promise<Page<T>>, maxPages = WALK_MAX_PAGES): Promise<Walked<T>> {
  const rows: T[] = []
  let cursor: string | undefined
  for (let i = 0; i < maxPages; i++) {
    const page = await fetchPage(cursor)
    rows.push(...page.data)
    if (!page.page.has_more || !page.page.next_cursor) return { rows, truncated: false }
    cursor = page.page.next_cursor
  }
  return { rows, truncated: true }
}

const STALE_MS = 20_000

export function useAllProducts() {
  const keys = useKeys()
  return useQuery({
    queryKey: [...keys.products.list(), 'all'] as const,
    staleTime: STALE_MS,
    queryFn: () =>
      walkPages<Product>((cursor) =>
        unwrap(api.GET('/products', { params: { query: { limit: WALK_PAGE_SIZE, cursor } } })),
      ),
  })
}

export function useAllListings(opts: { productId?: string } = {}) {
  const keys = useKeys()
  return useQuery({
    queryKey: [...keys.listings.list({ productId: opts.productId }), 'all'] as const,
    staleTime: STALE_MS,
    queryFn: () =>
      walkPages<Listing>((cursor) =>
        unwrap(
          api.GET('/listings', {
            params: { query: { product_id: opts.productId, limit: WALK_PAGE_SIZE, cursor } },
          }),
        ),
      ),
  })
}

export function useOpenIssues() {
  const keys = useKeys()
  return useQuery({
    queryKey: [...keys.issues.list({ status: 'open' }), 'all'] as const,
    staleTime: STALE_MS,
    queryFn: () =>
      walkPages<Issue>((cursor) =>
        unwrap(api.GET('/issues', { params: { query: { status: 'open', limit: WALK_PAGE_SIZE, cursor } } })),
      ),
  })
}

/** Whether a joined list is loaded. Until it is, the cells it feeds show a placeholder, not a guess. */
export type LoadState = 'pending' | 'error' | 'ready'

const loadState = (q: { data?: unknown; error: unknown }): LoadState => (q.data ? 'ready' : q.error ? 'error' : 'pending')

/** Products + listings + open issues joined into table rows. */
export function useCatalog() {
  const products = useAllProducts()
  const listings = useAllListings()
  const issues = useOpenIssues()
  const rows = useMemo(
    () => (products.data ? buildCatalog(products.data.rows, listings.data?.rows ?? [], issues.data?.rows ?? []) : []),
    [products.data, listings.data, issues.data],
  )
  const variantCount = useMemo(
    () => (products.data ? products.data.rows.filter((p) => p.parent_product_id).length : 0),
    [products.data],
  )
  return {
    rows,
    products,
    listings,
    issues,
    variantCount,
    /** Products load first; listing cells and issue counts fill in when their lists arrive. */
    isPending: products.isPending,
    /** Listing cells, Overall and the status filters are only true once this is 'ready'. */
    listingsState: loadState(listings),
    /** Issue counts are only true once this is 'ready'. */
    issuesState: loadState(issues),
    error: products.error,
    truncated: !!products.data?.truncated || !!listings.data?.truncated || !!issues.data?.truncated,
    refetch: () => {
      void products.refetch()
      void listings.refetch()
      void issues.refetch()
    },
  }
}
