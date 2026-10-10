import { useEffect } from 'react'
import { api, unwrap } from '@/api/client'
import { PAGE_SIZE, useCursorList } from '@/hooks/use-cursor-list'
import { useKeys, type RulesFilters } from '@/lib/query-keys'
import type { Rule } from './labels'

/** GET /rules with the server filters (marketplace, exact category), cursor paged. */
export function useRulesList(filters: RulesFilters, opts: { enabled?: boolean } = {}) {
  const keys = useKeys()
  return useCursorList<Rule>({
    queryKey: keys.rules.list(filters),
    enabled: opts.enabled,
    fetchPage: (cursor) =>
      unwrap(
        api.GET('/rules', {
          params: {
            query: {
              limit: PAGE_SIZE,
              cursor,
              marketplace: filters.marketplace,
              category: filters.category,
            },
          },
        }),
      ),
  })
}

/** Same list, but keeps fetching pages until `has_more` is false (for lookups, not tables). */
export function useAllRules(filters: RulesFilters, opts: { enabled?: boolean } = {}) {
  const list = useRulesList(filters, opts)
  const { hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage } = list
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && !isFetchNextPageError) void fetchNextPage()
  }, [hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage])
  return { ...list, complete: !!list.data && !hasNextPage }
}
