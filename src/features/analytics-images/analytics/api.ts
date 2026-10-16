import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api, unwrap } from '@/api/client'
import { useKeys } from '@/lib/query-keys'
import { bucketCount, previousRange, rangeDays, splitRange, type AnalyticsSummary, type DayRange } from './metrics'
import { createSerialQueue } from './serial'

/** One analytics request at a time per tab (the tenant cap is two; the probe may hold one). */
const queue = createSerialQueue(1)

/** GET /analytics/summary for an inclusive UTC-day range (routers/analytics.py `analytics_summary`). */
function fetchSummary(r: DayRange, signal?: AbortSignal) {
  return queue.run(
    () => unwrap(api.GET('/analytics/summary', { params: { query: { from: r.from, to: r.to } }, signal })),
    signal,
  )
}

/** GET /analytics (the alias, routers/analytics.py `analytics_get`) for one trend bucket. */
function fetchBucket(r: DayRange, signal?: AbortSignal) {
  return queue.run(
    () => unwrap(api.GET('/analytics', { params: { query: { from: r.from, to: r.to } }, signal })),
    signal,
  )
}

export interface TrendPoint {
  range: DayRange
  summary: AnalyticsSummary
}

export function useAnalyticsSummary(range: DayRange) {
  const keys = useKeys()
  return useQuery({
    queryKey: keys.analytics.summary(range),
    queryFn: ({ signal }) => fetchSummary(range, signal),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  })
}

/** The same metrics for the equal-length period before `range`, for the deltas. */
export function usePreviousSummary(range: DayRange, enabled: boolean) {
  const keys = useKeys()
  const prev = previousRange(range)
  return useQuery({
    queryKey: keys.analytics.summary(prev),
    queryFn: ({ signal }) => fetchSummary(prev, signal),
    enabled,
    staleTime: 60_000,
  })
}

/**
 * The range split into buckets (`bucketCount`), one GET /analytics per bucket, sent one at a time.
 * The API has no time series, so a trend is the summary of each sub-range.
 */
export function useAnalyticsTrend(range: DayRange, enabled: boolean) {
  const keys = useKeys()
  const buckets = splitRange(range, bucketCount(rangeDays(range)))
  return useQuery({
    queryKey: [...keys.analytics.all(), 'trend', { from: range.from, to: range.to, buckets: buckets.length }] as const,
    queryFn: async ({ signal }): Promise<TrendPoint[]> => {
      const out: TrendPoint[] = []
      for (const b of buckets) out.push({ range: b, summary: await fetchBucket(b, signal) })
      return out
    },
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  })
}
