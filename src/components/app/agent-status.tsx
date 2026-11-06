/**
 * Sidebar "Agent" card (hi-fi p06): derived only from real data, the listings in progress right now
 * (GET /listings?status=generating|publishing|published, counted like Home's "In progress").
 */
import { useQueries, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { api, unwrap } from '@/api/client'
import { IconTile } from '@/components/la/icons'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
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

/** 6px brand dot shown while the agent is working; pulses only when motion is allowed. */
function WorkingDot({ className }: { className?: string }) {
  return <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full bg-brand motion-safe:animate-pulse', className)} />
}

/**
 * Links to Products, where the work it counts lives. The visible line is not a live region (it
 * would repeat on every refetch); a separate polite region speaks the line once it is known and
 * again only when it changes. "Checking…" is never announced.
 */
export function AgentStatusCard({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void } = {}) {
  const work = useAgentWork()
  const line = agentLine(work)
  const working = work.count > 0 && !work.pending && !work.failed
  const label = `Agent: ${line}. Open products`
  const live = (
    <span className="sr-only" aria-live="polite">
      {work.pending ? '' : line}
    </span>
  )
  const tile = <IconTile icon="spark" size="sm" tone={working ? 'brand' : 'neutral'} flat className="shadow-inset-sm" />

  if (collapsed) {
    return (
      <div className="mt-auto flex justify-center">
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              to="/products"
              onClick={onNavigate}
              aria-label={label}
              data-testid="agent-status"
              className="focus-ring tactile press relative inline-flex size-10 items-center justify-center rounded-card hover:bg-hover"
            >
              {tile}
              {working ? <WorkingDot className="absolute top-1.5 right-1.5 ring-2 ring-canvas" /> : null}
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right">{line}</TooltipContent>
        </Tooltip>
        {live}
      </div>
    )
  }

  return (
    <>
      <Link
        to="/products"
        onClick={onNavigate}
        aria-label={label}
        data-testid="agent-status"
        className="focus-ring tactile press mt-auto flex items-center gap-2.5 rounded-card border border-line bg-surface px-3 py-2.5 shadow-raised-sm hover:bg-hover"
      >
        {tile}
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-caption font-bold text-ink">
            Agent
            {working ? <WorkingDot /> : null}
          </span>
          <span className="block truncate text-caption text-ink-2 tabular-nums">{line}</span>
        </span>
      </Link>
      {live}
    </>
  )
}
