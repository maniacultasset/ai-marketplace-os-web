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
import { useSession } from '@/lib/auth'

export type ImportRowsStatus = 'imported' | 'failed' | undefined
export interface RulesFilters {
  marketplace?: 'amazon' | 'flipkart'
  category?: string
}

export function keysFor(tid: string) {
  const T = ['t', tid] as const
  return {
    /** Prefix of every key for this tenant. */
    all: () => T,
    me: () => [...T, 'me'] as const,
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
  }
}

export type QueryKeys = ReturnType<typeof keysFor>

/** Keys bound to the active tenant. Only call inside the authenticated app layout. */
export function useKeys(): QueryKeys {
  const { tenantId } = useSession()
  return useMemo(() => keysFor(tenantId ?? 'anonymous'), [tenantId])
}
