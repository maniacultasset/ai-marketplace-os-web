/**
 * Sidebar "Agent" card (hi-fi p06): derived only from real data, the listings in progress right now
 * (GET /listings?status=generating|publishing|published, counted like Home's "In progress").
 */
import { useQueries, useQueryClient } from '@tanstack/react-query'
import { api, unwrap } from '@/api/client'
import { IconTile } from '@/components/la/icons'
import type { Schema } from '@/api/types'
import { listingBucket, type ListingsSnapshot } from '@/features/home-inbox/model'
import { useKeys } from '@/lib/query-keys'

const LIMIT = 100
const REFRESH_MS = 30_000

/**
 * Same definition as Home's "In progress" tile (listingBucket === 'working'): generating,
 * publishing, and published listings still waiting on the marketplace. The API cannot filter by
 * marketplace_state, so published rows are fetched and filtered here.
 */
const WORKING_STATUSES = ['generating', 'publishing', 'published'] as const satisfies readonly Schema<'ListingStatus'>[]

/** Count of "working" listings in the loaded pages. `more` when any page was cut short. */
export function countWorking(pages: readonly ({ data: readonly Pick<Schema<'ListingOut'>, 'status' | 'marketplace_state'>[]; page: { has_more: boolean } } | undefined)[]) {
  let count = 0
  let more = false
  for (const p of pages) {
    if (!p) continue
    count += p.data.filter((l) => listingBucket(l) === 'working').length
    more ||= p.page.has_more
  }
  return { count, more }
}

export function useAgentWork() {
  const keys = useKeys()
  const client = useQueryClient()
  const results = useQueries({
    queries: WORKING_STATUSES.map((status) => ({
      queryKey: [...keys.listings.list({ status }), 'agent-card'] as const,
      queryFn: () => unwrap(api.GET('/listings', { params: { query: { status, limit: LIMIT } } })),
      refetchInterval: REFRESH_MS,
      refetchIntervalInBackground: false,
      meta: { toast: false },
    })),
  })
  // On Home the full listings walk is already loaded: read it (never fetch it here) so the sidebar
  // and the "In progress" tile show the same number.
  // Read from the cache only (the card re-renders with its own 30s refetches).
  const state = client.getQueryState<ListingsSnapshot>([...keys.listings.lists(), 'home-snapshot'])
  const snap = state?.data && Date.now() - state.dataUpdatedAt < 2 * REFRESH_MS ? state.data : undefined
  if (snap) return { pending: false, failed: false, count: snap.working, more: !snap.complete }
  const pending = results.some((r) => r.isPending)
  const failed = results.some((r) => r.isError)
  return { pending, failed, ...countWorking(results.map((r) => r.data)) }
}

export function agentLine(w: { pending: boolean; failed: boolean; count: number; more: boolean }): string {
  if (w.pending) return 'Checking…'
  if (w.failed) return 'Status unavailable'
  if (w.count === 0) return 'Idle'
  return `Working on ${w.count}${w.more ? '+' : ''} listing${w.count === 1 && !w.more ? '' : 's'}`
}

export function AgentStatusCard() {
  const work = useAgentWork()
  return (
    <div
      className="mt-auto flex items-center gap-2.5 rounded-[12px] border border-line bg-surface px-3 py-2.5 text-caption font-normal text-ink-2 shadow-raised-sm"
      role="status"
      aria-live="polite"
    >
      <IconTile icon="spark" size="sm" tone={work.count > 0 && !work.pending && !work.failed ? 'brand' : 'neutral'} flat className="shadow-inset-sm" />
      <span className="min-w-0">
        <b className="font-bold text-ink">Agent</b>
        <br />
        {agentLine(work)}
      </span>
    </div>
  )
}
