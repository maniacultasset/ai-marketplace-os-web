/**
 * Marketplace accounts API hooks.
 * Every mutation that changes accounts invalidates `keys.marketplaceAccounts.list()`.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, unwrap } from '@/api/client'
import type { Schema } from '@/api/types'
import { PAGE_SIZE, useCursorList } from '@/hooks/use-cursor-list'
import { useKeys } from '@/lib/query-keys'

export type MarketplaceAccount = Schema<'MarketplaceAccountOut'>
export type Marketplace = Schema<'Marketplace'>
export type AccountStatus = MarketplaceAccount['status']

/** `ConnectConfirmRequest.pending` (schemas/marketplaces.py PENDING_HANDLE_PATTERN). */
export const PENDING_HANDLE_RE = /^[A-Za-z0-9_-]{43}$/

/** GET /marketplaces/accounts: every status, newest first, cursor paginated. */
export function useMarketplaceAccounts() {
  const keys = useKeys()
  return useCursorList<MarketplaceAccount>({
    queryKey: keys.marketplaceAccounts.list(),
    fetchPage: (cursor) =>
      unwrap(api.GET('/marketplaces/accounts', { params: { query: { limit: PAGE_SIZE, cursor } } })),
  })
}

/** Largest page GET /marketplaces/accounts allows (`limit` 1..200). */
const CURRENT_PAGE_SIZE = 200
const MARKETPLACE_LIST: readonly Marketplace[] = ['amazon', 'flipkart']

export interface CurrentAccounts {
  /** The non-revoked account per marketplace (a tenant has at most one). */
  live: Record<Marketplace, MarketplaceAccount | null>
  /** Newest revoked account per marketplace; only looked for when there is no live one. */
  previous: Record<Marketplace, MarketplaceAccount | null>
}

/**
 * What each marketplace card shows, independent of how far the History table has paged. The
 * endpoint has no marketplace/status filter, so this walks pages (newest first) until every
 * marketplace has its live account or the list ends. Its key sits under `list()`, so every
 * mutation that invalidates the list refreshes it too.
 */
export function useCurrentMarketplaceAccounts() {
  const keys = useKeys()
  return useQuery({
    queryKey: [...keys.marketplaceAccounts.list(), 'current'] as const,
    queryFn: async (): Promise<CurrentAccounts> => {
      const live: CurrentAccounts['live'] = { amazon: null, flipkart: null }
      const previous: CurrentAccounts['previous'] = { amazon: null, flipkart: null }
      let cursor: string | undefined
      for (;;) {
        const page = await unwrap(
          api.GET('/marketplaces/accounts', { params: { query: { limit: CURRENT_PAGE_SIZE, cursor } } }),
        )
        for (const a of page.data) {
          if (a.status === 'revoked') previous[a.marketplace] ??= a
          else live[a.marketplace] ??= a
        }
        if (MARKETPLACE_LIST.every((m) => live[m]) || !page.page.has_more || !page.page.next_cursor) break
        cursor = page.page.next_cursor
      }
      return { live, previous }
    },
  })
}

/** POST /marketplaces/connect -> { authorize_url }. The caller navigates the browser there. */
export function useConnectMarketplace() {
  return useMutation({
    mutationFn: (marketplace: Marketplace) =>
      unwrap(api.POST('/marketplaces/connect', { body: { marketplace } })),
    // 501 is shown inline on the card; other errors are toasted by the caller.
    meta: { toast: false },
  })
}

/** POST /marketplaces/connect/confirm { pending } -> the active account. */
export function useConfirmConnection() {
  const qc = useQueryClient()
  const keys = useKeys()
  return useMutation({
    mutationFn: (pending: string) =>
      unwrap(api.POST('/marketplaces/connect/confirm', { body: { pending } })),
    meta: { toast: false },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.marketplaceAccounts.list() }),
  })
}

/** POST /marketplaces/accounts/{id}/revoke (no body) -> the account with status "revoked". */
export function useRevokeAccount() {
  const qc = useQueryClient()
  const keys = useKeys()
  return useMutation({
    mutationFn: (accountId: string) =>
      unwrap(api.POST('/marketplaces/accounts/{account_id}/revoke', { params: { path: { account_id: accountId } } })),
    meta: { errorTitle: "Couldn't revoke the connection" },
    // Success, or 404 (already gone / another tenant's): the list is stale either way.
    onSettled: () => qc.invalidateQueries({ queryKey: keys.marketplaceAccounts.list() }),
  })
}
