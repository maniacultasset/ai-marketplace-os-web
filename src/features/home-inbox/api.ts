/**
 * Home and Inbox reads. Every call is typed from the contract and checked against the backend
 * (`.backend/apps/api/app/api/v1/routers/*`):
 *
 *   GET /listings                          listings.py listings_list   (tenant:read; status, marketplace,
 *                                          product_id, limit 1..200, cursor; newest first; no total)
 *   GET /products?limit=1                  products.py products_list   (tenant:read)
 *   GET /tasks, GET /issues                tasks.py / issues.py        (via features/inbox/api)
 *   GET /marketplaces/accounts             marketplaces.py             (via features/marketplaces/api)
 *   GET /tenants/me                        tenants.py                  (via features/brand/api)
 *   GET /listings/{id}, /{id}/submissions  listings.py                 (via features/listings/api)
 *   GET /products/{id}                     products.py                 (via features/products/api)
 *   POST /issues/{id}/dismiss              issues.py issues_dismiss    (via features/inbox/api; Idempotency-Key)
 *
 * The API has no totals, no dashboard summary and no GET /issues/{id}; this file walks pages with
 * a hard cap and reports whether the walk was complete, so the UI can say "+" honestly.
 */
import { useQueries, useQuery } from '@tanstack/react-query'
import { api, unwrap } from '@/api/client'
import type { Schema } from '@/api/types'
import { fetchIssuesPage } from '@/features/inbox/api'
import type { Issue } from '@/features/inbox/model'
import { productQuery } from '@/features/products/api'
import { useKeys } from '@/lib/query-keys'
import { summarizeListings, type ListingsSnapshot } from './model'

type Listing = Schema<'ListingOut'>

/** Largest page GET /listings allows. */
const LISTINGS_PAGE = 200
/** Pages walked for Home: the newest 1,000 listings. Beyond that every count shows "+". */
const LISTINGS_PAGES = 5
export const LISTINGS_CAP = LISTINGS_PAGE * LISTINGS_PAGES
const HOME_REFRESH_MS = 60_000

export async function walkListings(
  fetchPage: (cursor: string | undefined) => Promise<{ data: Listing[]; page: { has_more: boolean; next_cursor?: string | null } }>,
  maxPages = LISTINGS_PAGES,
): Promise<{ rows: Listing[]; complete: boolean }> {
  const rows: Listing[] = []
  let cursor: string | undefined
  for (let i = 0; i < maxPages; i++) {
    const page = await fetchPage(cursor)
    rows.push(...page.data)
    if (!page.page.has_more || !page.page.next_cursor) return { rows, complete: true }
    cursor = page.page.next_cursor
  }
  return { rows, complete: false }
}

/** Every listing state Home needs, from GET /listings (all statuses) walked up to the cap. */
export function useListingsSnapshot() {
  const keys = useKeys()
  return useQuery({
    // Under `listings.lists()`, so every listing mutation that invalidates lists refreshes Home.
    queryKey: [...keys.listings.lists(), 'home-snapshot'] as const,
    queryFn: async (): Promise<ListingsSnapshot> => {
      const { rows, complete } = await walkListings((cursor) =>
        unwrap(api.GET('/listings', { params: { query: { limit: LISTINGS_PAGE, cursor } } })),
      )
      return summarizeListings(rows, complete)
    },
    refetchInterval: HOME_REFRESH_MS,
    refetchIntervalInBackground: false,
  })
}

/** Whether the brand has any product at all (first-run checklist). One row is enough. */
export function useHasProducts() {
  const keys = useKeys()
  return useQuery({
    queryKey: [...keys.products.list(), { limit: 1 }] as const,
    queryFn: async () => {
      const page = await unwrap(api.GET('/products', { params: { query: { limit: 1 } } }))
      return page.data.length > 0
    },
  })
}

/** Products for task rows (SKU and title), deduplicated, sharing the product page's cache entry. */
export function useProductsById(ids: readonly (string | null | undefined)[]) {
  const keys = useKeys()
  const unique = [...new Set(ids.filter((x): x is string => !!x))].slice(0, 25)
  const results = useQueries({ queries: unique.map((id) => ({ ...productQuery(keys, id), meta: { toast: false }, retry: false })) })
  const map = new Map<string, { sku: string; title: string }>()
  unique.forEach((id, i) => {
    const d = results[i]?.data
    if (d) map.set(id, { sku: d.sku, title: d.title })
  })
  return map
}

const ISSUE_STATUSES = ['open', 'auto_fixed', 'resolved', 'dismissed'] as const

/**
 * Every issue on one listing, all statuses (4 small requests; a listing has few issues). Used by
 * Issue detail to find the issue by id, since the API has no GET /issues/{id}.
 */
export function useListingIssues(listingId: string | undefined) {
  const keys = useKeys()
  return useQuery({
    queryKey: [...keys.issues.all(), 'by-listing', listingId ?? null] as const,
    enabled: !!listingId,
    queryFn: async (): Promise<Issue[]> => {
      const pages = await Promise.all(
        ISSUE_STATUSES.map((status) => walkIssues((cursor) => fetchIssuesPage({ status, listingId }, cursor), 2)),
      )
      return pages.flat()
    },
  })
}

async function walkIssues(fetchPage: (cursor: string | undefined) => Promise<{ data: Issue[]; page: { has_more: boolean; next_cursor?: string | null } }>, maxPages: number) {
  const rows: Issue[] = []
  let cursor: string | undefined
  for (let i = 0; i < maxPages; i++) {
    const page = await fetchPage(cursor)
    rows.push(...page.data)
    if (!page.page.has_more || !page.page.next_cursor) break
    cursor = page.page.next_cursor
  }
  return rows
}

/**
 * A deep link without `?listing=`: look for the issue among the newest issues of each status
 * (up to 4 pages of 50 each). Returns its listing id, or null when it is not there.
 */
export function useFindIssueListing(issueId: string, enabled: boolean) {
  const keys = useKeys()
  return useQuery({
    queryKey: [...keys.issues.all(), 'find', issueId] as const,
    enabled,
    queryFn: async (): Promise<string | null> => {
      for (const status of ISSUE_STATUSES) {
        const rows = await walkIssues((cursor) => fetchIssuesPage({ status }, cursor), 4)
        const hit = rows.find((i) => i.id === issueId)
        if (hit) return hit.listing_id
      }
      return null
    },
  })
}
