/**
 * Catalog data: every product, every listing and every open issue of the brand, read page by page
 * (limit 200, the backend maximum) so the Products table can show real totals, variant counts and
 * per-marketplace cells. Backend: routers/products.py `products_list` (newest first, no filters),
 * routers/listings.py `listings_list`, routers/issues.py `issues_list` (status=open).
 *
 * Each walk stops at WALK_MAX_PAGES. When a walk stops early the screen says so ("first N loaded")
 * instead of presenting a partial count as the total.
 */
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useRef } from 'react'
import { api, unwrap } from '@/api/client'
import type { Page } from '@/api/types'
import { BUSY_REFETCH_MS } from '@/features/listings/api'
import { isBusy } from '@/features/listings/model'
import { viewRefreshDelay } from '@/features/products/image-views'
import { useKeys } from '@/lib/query-keys'
import { useChipContext } from '@/features/listing-flow/publishing'
import { buildCatalog, SERVER_BUCKET, type Issue, type Listing, type ListingFilter, type Marketplace, type Product } from './catalog-model'

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
const EMPTY_LISTINGS: Listing[] = []
const EMPTY_PRODUCTS: Product[] = []

export function useAllProducts() {
  const keys = useKeys()
  return useQuery({
    queryKey: [...keys.products.list(), 'all'] as const,
    staleTime: STALE_MS,
    // The thumbnails are signed for about 10 minutes: read again just before the first expires.
    refetchInterval: (q) => viewRefreshDelay(q.state.data?.rows ?? []),
    refetchIntervalInBackground: false,
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
    // While any listing is drafting or publishing, re-read so cells flip from Working on their own.
    // keepPreviousData: a poll never drops the cells back to skeletons. Not for one product's
    // listings: moving to another product must not show the last product's cards as its own.
    refetchInterval: (q) => (q.state.data?.rows.some((l) => isBusy(l.status)) ? BUSY_REFETCH_MS : false),
    refetchIntervalInBackground: false,
    placeholderData: opts.productId ? undefined : keepPreviousData,
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

/**
 * Every open issue of the brand. `refetchInterval` lets a caller keep the counts in step with a
 * live listing re-read; the query key never changes, so a re-read never drops back to skeletons.
 */
export function useOpenIssues(opts: { refetchInterval?: number | false } = {}) {
  const keys = useKeys()
  return useQuery({
    queryKey: [...keys.issues.list({ status: 'open' }), 'all'] as const,
    staleTime: STALE_MS,
    refetchInterval: opts.refetchInterval ?? false,
    refetchIntervalInBackground: false,
    queryFn: () =>
      walkPages<Issue>((cursor) =>
        unwrap(api.GET('/issues', { params: { query: { status: 'open', limit: WALK_PAGE_SIZE, cursor } } })),
      ),
  })
}

/**
 * A Home filter read on the server (client feedback item 6): the listings in the filter's bucket
 * (`GET /listings?bucket=`) and the products that own them (`GET /products?listing=`), both on
 * `marketplace` when given. The backend applies the same bucket definition as Home's counts, so
 * the filtered list holds what the tile counts even when the whole-catalog walk stops early.
 * Off (no request) while `filter` is null.
 */
export function useListingFilter(filter: ListingFilter | null, marketplace: Marketplace | null) {
  const keys = useKeys()
  const bucket = filter ? SERVER_BUCKET[filter] : undefined
  const mp = marketplace ?? undefined
  const listings = useQuery({
    queryKey: [...keys.listings.lists(), 'bucket', bucket ?? null, mp ?? null] as const,
    enabled: !!bucket,
    staleTime: STALE_MS,
    queryFn: () =>
      walkPages<Listing>((cursor) =>
        unwrap(api.GET('/listings', { params: { query: { bucket, marketplace: mp, limit: WALK_PAGE_SIZE, cursor } } })),
      ),
  })
  const products = useQuery({
    queryKey: [...keys.products.list(), 'listing', bucket ?? null, mp ?? null] as const,
    enabled: !!bucket,
    staleTime: STALE_MS,
    queryFn: () =>
      walkPages<Product>((cursor) =>
        unwrap(api.GET('/products', { params: { query: { listing: bucket, marketplace: mp, limit: WALK_PAGE_SIZE, cursor } } })),
      ),
  })
  const state: LoadState = !bucket ? 'ready' : listings.error || products.error ? 'error' : listings.data && products.data ? 'ready' : 'pending'
  return {
    listings: listings.data?.rows ?? EMPTY_LISTINGS,
    products: products.data?.rows ?? EMPTY_PRODUCTS,
    state,
    truncated: !!listings.data?.truncated || !!products.data?.truncated,
  }
}

/** Whether a joined list is loaded. Until it is, the cells it feeds show a placeholder, not a guess. */
export type LoadState = 'pending' | 'error' | 'ready'

const loadState = (q: { data?: unknown; error: unknown }): LoadState => (q.data ? 'ready' : q.error ? 'error' : 'pending')

/** Products + listings + open issues joined into table rows. */
export function useCatalog() {
  const products = useAllProducts()
  const listings = useAllListings()
  // While a listing is drafting or publishing, open issues are re-read with the listings, so a
  // row's chip and its issue count change together.
  const busy = !!listings.data?.rows.some((l) => isBusy(l.status))
  const issues = useOpenIssues({ refetchInterval: busy ? BUSY_REFETCH_MS : false })
  // One last read when the work settles: the final issues land with the final chip.
  const wasBusy = useRef(busy)
  const refetchIssues = issues.refetch
  useEffect(() => {
    if (wasBusy.current && !busy) void refetchIssues()
    wasBusy.current = busy
  }, [busy, refetchIssues])
  // Amazon publishing switched off: an approved Amazon listing reads "publishing paused", not "ready to list".
  const { amazonPublishingPaused } = useChipContext()
  const rows = useMemo(
    () => (products.data ? buildCatalog(products.data.rows, listings.data?.rows ?? [], issues.data?.rows ?? [], { amazonPublishingPaused }) : []),
    [products.data, listings.data, issues.data, amazonPublishingPaused],
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
    /**
     * True until all three lists have answered (or failed), so the rows, their chips and their
     * issue counts paint once together. A failed list is not pending: its cells show "?" and the
     * page shows the banner.
     */
    isPending: products.isPending || listings.isPending || issues.isPending,
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
