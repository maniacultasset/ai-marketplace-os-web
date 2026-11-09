/**
 * Sidebar "Agent" card (hi-fi p06): derived only from real data, the listings in progress right now
 * (GET /listings?status=generating|publishing|published, counted like Home's "In progress").
 */
import { useQueries, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { api, unwrap } from '@/api/client'
import { IconTile } from '@/components/la/icons'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { Schema } from '@/api/types'
import { listingBucket, type ListingsSnapshot } from '@/features/home-inbox/model'
import { useKeys } from '@/lib/query-keys'

const LIMIT = 100
/** Once a minute: the three reads share the brand's rate limit with every teammate's tab. */
const REFRESH_MS = 60_000

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

/**
 * Which source the card reads: Home's snapshot only when it is newer than every agent-card read
 * (`agentAt` holds each read's dataUpdatedAt, 0 while it has no data). While the card's own reads
 * have not all answered, a snapshot from the last minute stands in rather than "Checking…".
 */
function pickFresher(agentAt: readonly number[], snapshotAt: number, now: number): 'agent' | 'snapshot' {
  if (!snapshotAt) return 'agent'
  const ownComplete = agentAt.length > 0 && agentAt.every((t) => t > 0)
  if (!ownComplete) return now - snapshotAt < 2 * REFRESH_MS ? 'snapshot' : 'agent'
  return snapshotAt > Math.max(...agentAt) ? 'snapshot' : 'agent'
}

export function useAgentWork() {
  const keys = useKeys()
  const client = useQueryClient()
  // Home already walks every listing: while that snapshot is fresh, the card reads it and makes
  // no calls of its own.
  const home = client.getQueryState<ListingsSnapshot>([...keys.listings.lists(), 'home-snapshot'])
  // A clock that moves every 15 s, so freshness is read from state, not from Date.now in render.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000)
    return () => clearInterval(t)
  }, [])
  const homeFresh = !!home?.data && now - home.dataUpdatedAt < REFRESH_MS
  const results = useQueries({
    queries: WORKING_STATUSES.map((status) => ({
      enabled: !homeFresh,
      queryKey: [...keys.listings.list({ status }), 'agent-card'] as const,
      queryFn: () => unwrap(api.GET('/listings', { params: { query: { status, limit: LIMIT } } })),
      refetchInterval: REFRESH_MS,
      refetchIntervalInBackground: false,
      meta: { toast: false },
    })),
  })
  // Two sources count the same thing: these three reads, and Home's full listings walk when it is
  // in the cache (read only, never fetched here). Use whichever read the API last, so moving between
  // pages never changes the line without a real data change. A refetch in flight keeps its data, so
  // the previous line stays until the new answer lands.
  const state = client.getQueryState<ListingsSnapshot>([...keys.listings.lists(), 'home-snapshot'])
  const source = pickFresher(
    results.map((r) => (r.data ? r.dataUpdatedAt : 0)),
    state?.data ? state.dataUpdatedAt : 0,
    Date.now(),
  )
  if (source === 'snapshot' && state?.data) return { pending: false, failed: false, count: state.data.working, more: !state.data.complete }
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
