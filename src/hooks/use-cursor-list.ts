/**
 * Cursor pagination over any list op:
 *   { data, page: { next_cursor, has_more, limit } }, "Load more" (no totals, no page numbers).
 * A 422 "Invalid cursor." resets the list to its first page.
 *
 *   const list = useCursorList({
 *     queryKey: keys.products.list(),
 *     fetchPage: (cursor) => unwrap(api.GET('/products', { params: { query: { limit: 50, cursor } } })),
 *   })
 *   <DataTable list={list} columns={columns} getRowId={(p) => p.id} />
 */
import { keepPreviousData, useInfiniteQuery, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
import { isInvalidCursor } from '@/api/errors'
import type { Page } from '@/api/types'

export const PAGE_SIZE = 50

export interface UseCursorListOptions<T> {
  queryKey: QueryKey
  fetchPage: (cursor: string | undefined) => Promise<Page<T>>
  enabled?: boolean
  refetchInterval?: number | false
  /**
   * Keep showing the previous key's rows while a new filter loads (default true), so a filter
   * change never flashes skeletons. `list.isPlaceholderData` is true meanwhile (DataTable dims).
   */
  keepPrevious?: boolean
}

const EMPTY: never[] = []

export function useCursorList<T>({
  queryKey,
  fetchPage,
  enabled,
  refetchInterval,
  keepPrevious = true,
}: UseCursorListOptions<T>) {
  const qc = useQueryClient()
  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => fetchPage(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.page.has_more ? (last.page.next_cursor ?? undefined) : undefined),
    enabled,
    refetchInterval,
    placeholderData: keepPrevious ? keepPreviousData : undefined,
  })

  const rows = useMemo<T[]>(() => query.data?.pages.flatMap((p) => p.data) ?? (EMPTY as T[]), [query.data])

  const invalidCursor = isInvalidCursor(query.error)
  useEffect(() => {
    if (invalidCursor) void qc.resetQueries({ queryKey, exact: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- queryKey is structurally stable
  }, [invalidCursor, qc])

  return { ...query, rows }
}

export type CursorList<T> = ReturnType<typeof useCursorList<T>>
