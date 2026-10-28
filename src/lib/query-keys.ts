/**
 * Tenant-scoped query keys (every key starts with ['t', tenantId], so a
 * tenant switch / logout can clear everything). Declared for ALL features up front; features
 * use these, never ad-hoc arrays, so invalidations from one screen reach every other screen.
 *
 *   const keys = useKeys()
 *   useQuery({ queryKey: keys.products.list(), ... })
 *   queryClient.invalidateQueries({ queryKey: keys.products.list() })
 */
import { useMemo } from 'react'
import type { Schema, V1Paths } from '@/api/types'
import { useSession } from '@/lib/auth'

/** The query params of `GET <path>` from the contract (so filters can never drift from it). */
type QueryOf<P extends keyof V1Paths> = V1Paths[P] extends { get: { parameters: { query?: infer Q } } }
  ? NonNullable<Q>
  : never

export type ImportRowsStatus = QueryOf<'/imports/{import_id}/rows'>['status']
export type Marketplace = Schema<'Marketplace'>
export interface RulesFilters {
  marketplace?: Marketplace
  category?: string
}

export type ListingStatus = Schema<'ListingStatus'>
export interface ListingsFilters {
  status?: ListingStatus
  marketplace?: Marketplace
  productId?: string
}
export type IssueStatus = NonNullable<QueryOf<'/issues'>['status']>
export interface IssuesFilters {
  /** Backend default: 'open'. */
  status?: IssueStatus
  listingId?: string
  source?: Schema<'ErrorSource'>
  errorCode?: Schema<'ErrorCode'>
  marketplace?: Marketplace
}
/** Backend default: 'open'. */
export type TaskStatus = NonNullable<QueryOf<'/tasks'>['status']>
/** ISO dates (YYYY-MM-DD); null means the backend default window. */
export interface AnalyticsRange {
  from?: string | null
  to?: string | null
}
/** GET /admin/signup-requests `status`; the backend default (absent) lists every status. */
export type SignupStatus = NonNullable<QueryOf<'/admin/signup-requests'>['status']>

export function keysFor(tid: string) {
  const T = ['t', tid] as const
  return {
    /** Prefix of every key for this tenant. */
    all: () => T,
    me: () => [...T, 'me'] as const,
    /** GET /auth/security (per user; the tenant prefix keeps it inside the tenant clear). */
    security: () => [...T, 'security'] as const,
    capabilities: () => [...T, 'capabilities'] as const,
    products: {
      all: () => [...T, 'products'] as const,
      list: () => [...T, 'products', 'list'] as const,
      detail: (productId: string) => [...T, 'products', 'detail', productId] as const,
    },
    imports: {
      all: () => [...T, 'imports'] as const,
      /** GET /imports/{id} (ImportReport). Also the prefix of that import's rows. */
      detail: (importId: string) => [...T, 'imports', importId] as const,
    },
    importRows: {
      /** Prefix for every status filter of one import's rows. */
      all: (importId: string) => [...T, 'imports', importId, 'rows'] as const,
      list: (importId: string, status?: ImportRowsStatus) =>
        [...T, 'imports', importId, 'rows', { status: status ?? null }] as const,
    },
    jobs: {
      all: () => [...T, 'jobs'] as const,
      detail: (jobId: string) => [...T, 'jobs', jobId] as const,
    },
    marketplaceAccounts: {
      all: () => [...T, 'marketplaces'] as const,
      list: () => [...T, 'marketplaces', 'accounts'] as const,
    },
    rules: {
      all: () => [...T, 'rules'] as const,
      list: (filters: RulesFilters = {}) =>
        [...T, 'rules', { marketplace: filters.marketplace ?? null, category: filters.category ?? null }] as const,
    },
    members: {
      all: () => [...T, 'members'] as const,
      list: () => [...T, 'members'] as const,
    },
    /**
     * Listings. `detail(id)` is also the prefix of that listing's history/preview/status/submissions,
     * so invalidating `detail(id)` after an edit/regenerate/publish refreshes all of them.
     * After a mutation also invalidate `listings.lists()` (every filtered list), `issues.all()`,
     * `tasks.all()` and `analytics.all()` when the action changes counts.
     */
    listings: {
      all: () => [...T, 'listings'] as const,
      lists: () => [...T, 'listings', 'list'] as const,
      list: (f: ListingsFilters = {}) =>
        [
          ...T,
          'listings',
          'list',
          { status: f.status ?? null, marketplace: f.marketplace ?? null, productId: f.productId ?? null },
        ] as const,
      /** GET /listings/{id} (value: Versioned<ListingDetail> — body + ETag, see src/api/etag.ts). */
      detail: (listingId: string) => [...T, 'listings', 'detail', listingId] as const,
      history: (listingId: string) => [...T, 'listings', 'detail', listingId, 'history'] as const,
      preview: (listingId: string) => [...T, 'listings', 'detail', listingId, 'preview'] as const,
      status: (listingId: string) => [...T, 'listings', 'detail', listingId, 'status'] as const,
      submissions: (listingId: string) => [...T, 'listings', 'detail', listingId, 'submissions'] as const,
    },
    issues: {
      all: () => [...T, 'issues'] as const,
      list: (f: IssuesFilters = {}) =>
        [
          ...T,
          'issues',
          'list',
          {
            status: f.status ?? 'open',
            listingId: f.listingId ?? null,
            source: f.source ?? null,
            errorCode: f.errorCode ?? null,
            marketplace: f.marketplace ?? null,
          },
        ] as const,
    },
    tasks: {
      all: () => [...T, 'tasks'] as const,
      list: (status: TaskStatus = 'open') => [...T, 'tasks', 'list', { status }] as const,
    },
    analytics: {
      all: () => [...T, 'analytics'] as const,
      summary: (range: AnalyticsRange = {}) =>
        [...T, 'analytics', 'summary', { from: range.from ?? null, to: range.to ?? null }] as const,
    },
    brand: {
      all: () => [...T, 'brand'] as const,
      /** GET /tenants/me (value: Versioned<TenantOut> — body + ETag). */
      profile: () => [...T, 'brand', 'profile'] as const,
      documents: () => [...T, 'brand', 'documents'] as const,
    },
    images: {
      all: () => [...T, 'images'] as const,
      report: (imageId: string) => [...T, 'images', imageId, 'report'] as const,
    },
    /** Platform-wide (not tenant data), kept under T so logout/tenant switch still clears it. */
    signups: {
      all: () => [...T, 'admin', 'signups'] as const,
      /** `list('pending')` is the review queue; `list(null)` every request (the backend default). */
      list: (status: SignupStatus | null) => [...T, 'admin', 'signups', { status }] as const,
    },
  }
}

export type QueryKeys = ReturnType<typeof keysFor>

/** Keys bound to the active tenant. Only call inside the authenticated app layout. */
export function useKeys(): QueryKeys {
  const { tenantId } = useSession()
  return useMemo(() => keysFor(tenantId ?? 'anonymous'), [tenantId])
}
