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
import { queryOptions, useQueries, useQuery } from '@tanstack/react-query'
import { useCallback } from 'react'
import { api, unwrap } from '@/api/client'
import type { Schema } from '@/api/types'
import { fetchIssuesPage } from '@/features/inbox/api'
import { linkedIssues, type Issue } from '@/features/inbox/model'
import { autoFixedOn, versionRef } from '@/features/listing-flow/auto-fix-model'
import { listingDetailQuery } from '@/features/listings/api'
import { productQuery } from '@/features/products/api'
import { supportsCandidates } from '@/features/analytics-images/images/candidates-model'
import { useKeys, type QueryKeys } from '@/lib/query-keys'
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

/**
 * Products for task rows (SKU and title), deduplicated, sharing the product page's cache entry.
 * `pending` is true while any of them is still on its first read, so a row can paint once with its
 * title and meta together. A failed read is not pending and is not in the map: the row falls back to
 * the kind-only meta.
 */
export function useProductsById(ids: readonly (string | null | undefined)[]): ProductsById {
  const keys = useKeys()
  const unique = [...new Set(ids.filter((x): x is string => !!x))].slice(0, 25)
  const results = useQueries({ queries: unique.map((id) => ({ ...productQuery(keys, id), meta: { toast: false }, retry: false })) })
  const map = new Map<string, ProductSummary>()
  unique.forEach((id, i) => {
    const d = results[i]?.data
    if (d) map.set(id, { sku: d.sku, title: d.title, photoFixes: supportsCandidates(d.image_details) })
  })
  return { map, pending: results.some((r) => r.isPending) }
}

/**
 * The product behind each issue's listing (IssueOut carries listing_id only). One listing detail
 * read per distinct listing, shared with the review and product pages' cache, capped like
 * useProductsById. A failed read leaves that issue without a product name.
 */
export function useListingProductIds(listingIds: readonly (string | null | undefined)[]): { map: Map<string, string>; pending: boolean } {
  const keys = useKeys()
  const unique = [...new Set(listingIds.filter((x): x is string => !!x))].slice(0, 25)
  const results = useQueries({ queries: unique.map((id) => ({ ...listingDetailQuery(keys, id), meta: { toast: false }, retry: false })) })
  const map = new Map<string, string>()
  unique.forEach((id, i) => {
    const d = results[i]?.data
    if (d) map.set(id, d.data.product_id)
  })
  return { map, pending: results.some((r) => r.isPending) }
}

/** `photoFixes`: the backend offers photo fixes on this product (SI7 image candidates). */
export type ProductSummary = { sku: string; title: string; photoFixes?: boolean }
export type ProductsById = { map: Map<string, ProductSummary>; pending: boolean }

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

/**
 * One listing's fix trail: its `auto_fixed` rows (code fixes) and its `resolved` rows closed by an
 * AI rewrite (`ai_correction`; the API has no resolution filter, so they are picked here). Up to
 * 4 pages of each. Under `issues.all()`, so a regenerate, edit or re-check refreshes it.
 */
export function fixTrailQuery(keys: QueryKeys, listingId: string) {
  return queryOptions({
    queryKey: [...keys.issues.all(), 'fix-trail', listingId] as const,
    staleTime: 20_000,
    queryFn: async (): Promise<Issue[]> => {
      const [fixed, resolved] = await Promise.all(
        (['auto_fixed', 'resolved'] as const).map((status) => walkIssues((cursor) => fetchIssuesPage({ status, listingId }, cursor), 4)),
      )
      return [...fixed!, ...resolved!.filter((i) => i.resolution === 'ai_correction')]
    },
  })
}

export function useFixTrail(listingId: string) {
  const keys = useKeys()
  return useQuery(fixTrailQuery(keys, listingId))
}

type FixRef = { id: string; current_version_id?: string | null }

/**
 * How many fixes each listing's current version carries (for chips and "Approve all"). Reads the
 * trail and the listing detail (for when the version was written; shared with the review's cache).
 * A failed trail read counts none; a failed detail read falls back to the version id alone.
 */
export function useFixCounts(listings: readonly FixRef[]): { pending: boolean; counts: Map<string, number> } {
  const keys = useKeys()
  const combine = useCallback(
    (rs: { isPending: boolean; data?: unknown }[]) => {
      const n = listings.length
      const counts = new Map<string, number>()
      listings.forEach((l, i) => {
        const trail = rs[i]?.data as Issue[] | undefined
        const detail = rs[n + i]?.data as { data: Parameters<typeof versionRef>[0] } | undefined
        counts.set(l.id, autoFixedOn(trail ?? [], detail ? versionRef(detail.data) : { id: l.current_version_id }).length)
      })
      return { pending: rs.some((r) => r.isPending), counts }
    },
    [listings],
  )
  return useQueries({
    queries: [
      ...listings.map((l) => ({ ...fixTrailQuery(keys, l.id), meta: { toast: false }, retry: false })),
      ...listings.map((l) => ({ ...listingDetailQuery(keys, l.id), meta: { toast: false } })),
    ],
    combine,
  })
}

/** Pages of open issues walked to find a task's linked issues (the API has no task filter). */
const TASK_ISSUE_PAGES = 4

/**
 * The open issues linked to an account task (`human_task_id`), from GET /issues?status=open
 * walked up to a cap. Under `issues.all()`, so a dismiss, regenerate or re-check refreshes it.
 */
export function useTaskIssues(taskId: string, enabled = true) {
  const keys = useKeys()
  return useQuery({
    queryKey: [...keys.issues.all(), 'by-task', taskId] as const,
    enabled,
    queryFn: async (): Promise<Issue[]> => {
      const rows = await walkIssues((cursor) => fetchIssuesPage({ status: 'open' }, cursor), TASK_ISSUE_PAGES)
      return linkedIssues(taskId, rows)
    },
  })
}
