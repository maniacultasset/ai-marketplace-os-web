/**
 * /home (hi-fi 06 Home, 05 Home first run). Everything on it comes from the API:
 *   tiles + marketplace cards  GET /listings (walked, capped), GET /tasks, GET /issues,
 *                              GET /marketplaces/accounts
 *   first run                  GET /tenants/me, GET /marketplaces/accounts, GET /products?limit=1
 * "What the agent did" has no API (no tenant-wide activity feed) and says so.
 */
import { Link } from '@tanstack/react-router'
import { useEffect, useState, type ReactNode } from 'react'
import { Page, PageHeader } from '@/components/app/page-header'
import { LaCard, CardHead, MetricTile, TaskRow } from '@/components/la/cards'
import { Icon } from '@/components/la/icons'
import { MarketplaceTile, type MarketplaceId } from '@/components/la/marketplace'
import { StatusChip } from '@/components/la/status-chip'
import { ComingSoon, NOT_YET, UnavailableButton } from '@/components/la/unavailable'
import { ErrorState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useBrandName } from '@/features/brand/api'
import { useIssuesList, useTasksList } from '@/features/inbox/api'
import { MARKETPLACE_LABEL, TASK_KIND_LABEL } from '@/features/inbox/model'
import { useCurrentMarketplaceAccounts } from '@/features/marketplaces/api'
import { useMe } from '@/lib/auth'
import { useCan } from '@/lib/permissions'
import { LISTINGS_CAP, useListingsSnapshot, useProductsById } from './api'
import { FirstRun } from './first-run'
import {
  API_MARKETPLACES,
  fmtCount,
  inProgressTile,
  issueTitle,
  itemKey,
  liveTile,
  marketplaceCard,
  mergeInbox,
  needsYouTile,
  type ListingsSnapshot,
  type TileView,
} from './model'
import { Ago, ItemTile } from './parts'

export function HomePage() {
  const { data: me } = useMe()
  const brand = useBrandName(me)
  const snapshot = useListingsSnapshot()

  if (snapshot.isPending) return <HomeSkeleton />
  if (snapshot.isError)
    return (
      <Page>
        <PageHeader title="Home" />
        <LaCard>
          <ErrorState error={snapshot.error} title="Couldn't load your listings" onRetry={() => void snapshot.refetch()} />
        </LaCard>
      </Page>
    )
  // p05 "Checklist and routes are shown until the first listing exists" (no listings at all).
  if (snapshot.data.total === 0) return <FirstRun brand={brand} />
  return <Dashboard brand={brand} snapshot={snapshot.data} updatedAt={snapshot.dataUpdatedAt} />
}

function Dashboard({ brand, snapshot, updatedAt }: { brand: string; snapshot: ListingsSnapshot; updatedAt: number }) {
  const can = useCan()
  const tasks = useTasksList('open')
  const issues = useIssuesList({})
  const inboxReady = !!tasks.data && !!issues.data
  const tasksCount = { n: tasks.rows.length, more: !!tasks.hasNextPage }
  const issuesCount = { n: issues.rows.length, more: !!issues.hasNextPage }

  const live = liveTile(snapshot, LISTINGS_CAP)
  const working = inProgressTile(snapshot, LISTINGS_CAP)
  const needs = needsYouTile(
    { tasks: tasksCount, issues: issuesCount, approve: snapshot.approve, publish: snapshot.publish, snapshotComplete: snapshot.complete },
    LISTINGS_CAP,
  )
  const inboxError = tasks.error ?? issues.error

  return (
    <Page>
      <PageHeader
        title="Home"
        description={
          <>
            {brand ? `${brand} · ` : null}
            <Updated at={updatedAt} />
          </>
        }
        actions={
          <>
            {can('analytics:read') ? (
              <Button asChild variant="ghost" data-testid="home-reports">
                <Link to="/analytics">Listing reports</Link>
              </Button>
            ) : null}
            {can('product:import') ? (
              <Button asChild data-testid="home-add-products">
                <Link to="/add">
                  <Icon name="plus" size={16} />
                  Add products
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3" data-testid="home-tiles">
        <Tile testId="tile-live" chip={<StatusChip status="live" />} view={live} />
        <Tile testId="tile-working" chip={<StatusChip status="working">In progress</StatusChip>} view={working} />
        {inboxError ? (
          <MetricTile
            emphasis="attention"
            chip={<StatusChip status="needs-you" />}
            value={<Unknown reason="Open questions and issues could not be loaded, so this number is unknown." />}
            caption="Couldn't load your Inbox."
            action={
              <Button size="sm" variant="secondary" onClick={() => void Promise.all([tasks.refetch(), issues.refetch()])}>
                Retry
              </Button>
            }
          />
        ) : !inboxReady ? (
          <TileSkeleton attention />
        ) : (
          <MetricTile
            emphasis="attention"
            className="h-full"
            chip={<StatusChip status="needs-you" />}
            value={<span data-testid="tile-needs-value"><Value view={needs} /></span>}
            caption={<span data-testid="tile-needs-caption">{needs.caption}</span>}
            action={
              // The tile counts two places: questions and issues live in the Inbox, listings to
              // approve or publish live on their product (Products). Link to each part shown.
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm" variant="warn" data-testid="tile-needs-inbox">
                  <Link to="/inbox">Open Inbox</Link>
                </Button>
                {snapshot.approve + snapshot.publish > 0 ? (
                  <Button asChild size="sm" variant="secondary" data-testid="tile-needs-listings">
                    <Link to="/products">
                      {snapshot.approve ? 'Approve' : 'Publish'} in Products
                    </Link>
                  </Button>
                ) : null}
              </div>
            }
          />
        )}
      </div>

      <MarketplaceRow snapshot={snapshot} />

      <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <WaitingCard tasks={tasks} issues={issues} total={fmtCount({ n: tasksCount.n + issuesCount.n, more: tasksCount.more || issuesCount.more })} />
        <LaCard data-testid="agent-feed">
          <CardHead title="What the agent did" action={<ComingSoon />} />
          <p className="mt-3 text-small text-ink-2">{NOT_YET.activityFeed}</p>
          <p className="mt-2 text-small text-ink-2">
            Open a product to see what happened to each of its listings, step by step.
          </p>
          <Button asChild variant="secondary" size="sm" className="mt-4">
            <Link to="/products">Open Products</Link>
          </Button>
        </LaCard>
      </div>
    </Page>
  )
}

/** "updated just now" / "updated 4 minutes ago": when this screen last read the API. */
function Updated({ at }: { at: number }) {
  const now = useNow(30_000)
  const fresh = now - at < 60_000
  return fresh ? <span>updated just now</span> : <>updated <Ago iso={new Date(at).toISOString()} /></>
}

function useNow(everyMs: number) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), everyMs)
    return () => window.clearInterval(t)
  }, [everyMs])
  return now
}

function Value({ view }: { view: TileView }) {
  if (!view.note) return <>{view.value}</>
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="cursor-help rounded-sm underline decoration-line-strong decoration-dotted underline-offset-[6px]">
          {view.value}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-72">{view.note}</TooltipContent>
    </Tooltip>
  )
}

/** "—" with the reason: a number we cannot compute honestly is never guessed. */
function Unknown({ reason }: { reason: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} aria-label={`Unknown. ${reason}`} className="cursor-help rounded-sm">
          —
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-72">{reason}</TooltipContent>
    </Tooltip>
  )
}

function Tile({ chip, view, testId }: { chip: ReactNode; view: TileView; testId: string }) {
  return (
    <MetricTile
      className="h-full"
      chip={chip}
      value={<span data-testid={`${testId}-value`}><Value view={view} /></span>}
      caption={<span data-testid={`${testId}-caption`}>{view.caption}</span>}
    />
  )
}

const MARKETPLACE_CARDS: readonly MarketplaceId[] = ['amazon', 'flipkart', 'myntra', 'ajio']

function MarketplaceRow({ snapshot }: { snapshot: ListingsSnapshot }) {
  const accounts = useCurrentMarketplaceAccounts()
  return (
    <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="home-marketplaces">
      {MARKETPLACE_CARDS.map((id) => {
        const name = id === 'ajio' ? 'AJIO' : id.charAt(0).toUpperCase() + id.slice(1)
        const supported = (API_MARKETPLACES as readonly string[]).includes(id)
        if (!supported) {
          return (
            <LaCard key={id} emphasis="dashed" pad="sm" data-testid={`home-mp-${id}`}>
              <div className="flex items-center gap-3 font-semibold text-ink">
                <MarketplaceTile id={id} />
                {name}
              </div>
              <div className="mt-3">
                <StatusChip status="not-listed">Not available</StatusChip>
              </div>
              <UnavailableButton reason={NOT_YET.waitlist} variant="link" size="xs" className="mt-2 h-auto text-caption">
                Join waitlist
              </UnavailableButton>
            </LaCard>
          )
        }
        const m = id as (typeof API_MARKETPLACES)[number]
        if (accounts.isPending)
          return (
            <LaCard key={id} pad="sm">
              <Skeleton className="h-9 w-32" />
              <Skeleton className="mt-3 h-[22px] w-20 rounded-full" />
              <Skeleton className="mt-2 h-3 w-24" />
            </LaCard>
          )
        const account = accounts.data?.live[m] ?? null
        const view = accounts.isError ? null : marketplaceCard(account, snapshot.byMarketplace[m], snapshot.complete)
        return (
          <LaCard key={id} pad="sm" emphasis={view && !view.action ? 'default' : 'dashed'} data-testid={`home-mp-${id}`}>
            <div className="flex items-center gap-3 font-semibold text-ink">
              <MarketplaceTile id={id} />
              {MARKETPLACE_LABEL[m]}
            </div>
            <div className="mt-3">
              {view ? (
                <StatusChip status={view.chip.status} className="tabular-nums">
                  <span data-testid="mp-chip">{view.chip.label}</span>
                </StatusChip>
              ) : (
                <StatusChip status="not-listed">Unknown</StatusChip>
              )}
            </div>
            <p className="mt-2 text-caption text-ink-2">
              {!view ? (
                "Couldn't load the account."
              ) : view.action ? (
                <Link to="/marketplaces" className="font-semibold text-brand underline-offset-4 hover:underline">
                  {view.sub}
                </Link>
              ) : (
                view.sub
              )}
            </p>
          </LaCard>
        )
      })}
    </div>
  )
}

const WAITING_ROWS = 3

function WaitingCard({
  tasks,
  issues,
  total,
}: {
  tasks: ReturnType<typeof useTasksList>
  issues: ReturnType<typeof useIssuesList>
  total: string
}) {
  const items = mergeInbox(tasks.rows, issues.rows).slice(0, WAITING_ROWS)
  const products = useProductsById(items.map((i) => (i.kind === 'task' ? i.task.product_id : null)))
  const error = tasks.error ?? issues.error
  const pending = tasks.isPending || issues.isPending
  return (
    <LaCard data-testid="waiting-card">
      <CardHead
        title="Waiting for you"
        action={
          items.length ? (
            <Link to="/inbox" className="rounded-sm text-small font-bold text-brand underline-offset-4 hover:underline" data-testid="waiting-view-all">
              View all {total}
            </Link>
          ) : null
        }
      />
      <div className="mt-2">
        {error ? (
          <ErrorState compact error={error} title="Couldn't load your Inbox" onRetry={() => void Promise.all([tasks.refetch(), issues.refetch()])} />
        ) : pending ? (
          Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="flex items-center gap-3 border-b border-line py-3 last:border-b-0">
              <Skeleton className="size-11 rounded-[9px]" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-56" />
              </div>
            </div>
          ))
        ) : items.length === 0 ? (
          <div className="flex items-center gap-3 py-3 text-small text-ink-2" data-testid="waiting-empty">
            <span className="inline-flex size-11 items-center justify-center rounded-[9px] border border-success-line bg-success-bg text-success">
              <Icon name="check" size={18} />
            </span>
            Nothing needs you right now. New questions from the agent appear here.
          </div>
        ) : (
          items.map((it) => {
            const product = it.kind === 'task' && it.task.product_id ? products.get(it.task.product_id) : undefined
            const title = it.kind === 'task' ? it.task.question : issueTitle(it.issue)
            const meta =
              it.kind === 'task'
                ? [product?.sku, TASK_KIND_LABEL[it.task.kind]].filter(Boolean).join(' · ')
                : `${MARKETPLACE_LABEL[it.issue.marketplace]} · ${it.issue.severity === 'error' ? 'Error' : 'Warning'} on ${it.issue.field_path}`
            return (
              <TaskRow
                key={itemKey(it)}
                className="py-3.5"
                leading={<ItemTile item={it} size={44} />}
                title={<span data-testid="waiting-title">{title}</span>}
                meta={meta}
                action={
                  <Button asChild size="sm" variant={it.kind === 'task' ? 'primary' : 'secondary'}>
                    <Link to="/inbox" search={{ item: itemKey(it) }} aria-label={`Open ${title}`}>
                      Open
                    </Link>
                  </Button>
                }
              />
            )
          })
        )}
      </div>
    </LaCard>
  )
}

function TileSkeleton({ attention }: { attention?: boolean }) {
  return (
    <LaCard emphasis={attention ? 'attention' : 'default'} className="flex flex-col gap-2">
      <Skeleton className="h-[22px] w-20 rounded-full" />
      <Skeleton className="h-[38px] w-16" />
      <Skeleton className="h-4 w-44" />
    </LaCard>
  )
}

export function HomeSkeleton() {
  return (
    <Page>
      <div className="pb-5">
        <Skeleton className="h-8 w-28" />
        <Skeleton className="mt-2 h-4 w-56" />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <TileSkeleton />
        <TileSkeleton />
        <TileSkeleton attention />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <LaCard key={i} pad="sm">
            <Skeleton className="h-9 w-28" />
            <Skeleton className="mt-3 h-[22px] w-20 rounded-full" />
          </LaCard>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <LaCard className="h-56" />
        <LaCard className="h-56" />
      </div>
      <span className="sr-only">Loading Home…</span>
    </Page>
  )
}
