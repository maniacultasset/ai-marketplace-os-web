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
import { LaCard, CardHead, DashedCard, MetricTile, TaskRow } from '@/components/la/cards'
import { CountUp } from '@/components/la/count-up'
import { CONCEPT_ICON } from '@/components/la/concept-icons'
import { Icon, IconGlyph, IconTile } from '@/components/la/icons'
import { MARKETPLACES, MarketplaceTile, type MarketplaceId } from '@/components/la/marketplace'
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
import { cn } from '@/lib/utils'
import { LISTINGS_CAP, useListingsSnapshot, useProductsById } from './api'
import { FirstRun } from './first-run'
import {
  API_MARKETPLACES,
  fmtCount,
  greeting,
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

  // p05 "Checklist and routes are shown until the first listing exists" (no listings at all).
  // FirstRun mounts its own Page; every other state swaps inside one shared Page so the page-in
  // rise plays once (skeleton → dashboard does not rise twice).
  if (snapshot.isSuccess && snapshot.data.total === 0) return <FirstRun brand={brand} />
  return (
    <Page>
      {snapshot.isPending ? (
        <HomeSkeletonBody />
      ) : snapshot.isError ? (
        <>
          <PageHeader title={greeting(me?.display_name ?? null)} description={brand || undefined} />
          <LaCard className="mx-auto w-full max-w-xl py-10">
            <ErrorState error={snapshot.error} title="Couldn't load your listings" onRetry={() => void snapshot.refetch()} />
          </LaCard>
        </>
      ) : (
        <DashboardBody brand={brand} name={me?.display_name ?? null} snapshot={snapshot.data} updatedAt={snapshot.dataUpdatedAt} />
      )}
    </Page>
  )
}

function DashboardBody({
  brand,
  name,
  snapshot,
  updatedAt,
}: {
  brand: string
  name: string | null
  snapshot: ListingsSnapshot
  updatedAt: number
}) {
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
  // DashboardBody only mounts once the snapshot has loaded, so this is the whole S10 gate.
  const tilesReady = inboxReady || !!inboxError

  return (
    <>
      <PageHeader
        title={greeting(name)}
        description={
          <>
            {brand ? `${brand} · ` : null}
            <Updated at={updatedAt} />
          </>
        }
        actions={
          <>
            {can('analytics:read') ? (
              <Button asChild variant="ghost" className="max-sm:flex-1" data-testid="home-reports">
                <Link to="/analytics">
                  <IconGlyph icon={CONCEPT_ICON.reports} size={16} />
                  Listing reports
                </Link>
              </Button>
            ) : null}
            {can('product:import') ? (
              <Button asChild className="max-sm:flex-1" data-testid="home-add-products">
                <Link to="/add">
                  <Icon name="plus" size={16} />
                  Add products
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      {/* The three tiles land together: skeletons until Home's listings and the Inbox have both
          answered (or the Inbox failed), then one row that rises once and counts up once. */}
      {!tilesReady ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4" aria-busy="true" data-testid="home-tiles-loading">
          <TileSkeleton />
          <TileSkeleton />
          <TileSkeleton attention className="col-span-2 md:col-span-1" />
        </div>
      ) : (
        <div className="stagger-children grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4" data-testid="home-tiles">
          <Tile testId="tile-live" chip={<StatusChip status="live" />} view={live} />
          <Tile
            testId="tile-working"
            chip={<StatusChip status="working">In progress</StatusChip>}
            view={working}
            action={
              snapshot.working > 0 ? (
                <Button asChild size="sm" variant="secondary">
                  <Link to="/products">See in Products</Link>
                </Button>
              ) : undefined
            }
          />
          {inboxError ? (
            <MetricTile
              emphasis="attention"
              className="col-span-2 md:col-span-1"
              chip={<StatusChip status="needs-you" />}
              value={<Unknown reason="Open questions and issues could not be loaded, so this number is unknown." />}
              caption="Couldn't load your Inbox."
              action={
                <Button size="sm" variant="secondary" onClick={() => void Promise.all([tasks.refetch(), issues.refetch()])}>
                  Retry
                </Button>
              }
            />
          ) : (
            <MetricTile
              emphasis="attention"
              className="col-span-2 md:col-span-1"
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
                    <Button asChild size="sm" variant="secondary" className="min-w-0 max-w-full" data-testid="tile-needs-listings">
                      <Link to="/products">
                        {/* One text item: the button is a flex row with a gap, and the label must not split. */}
                        <span className="min-w-0 truncate">
                          {snapshot.approve ? 'Approve' : 'Publish'}
                          <span className="max-lg:sr-only"> in Products</span>
                        </span>
                      </Link>
                    </Button>
                  ) : null}
                </div>
              }
            />
          )}
        </div>
      )}

      <MarketplaceRow snapshot={snapshot} />

      <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <WaitingCard tasks={tasks} issues={issues} total={fmtCount({ n: tasksCount.n + issuesCount.n, more: tasksCount.more || issuesCount.more })} />
        {/* Not built yet: a flat tint card so it recedes behind the live cards. */}
        <LaCard emphasis="tint" data-testid="agent-feed">
          <CardHead title="What the agent did" icon="activity" iconTone="neutral" action={<ComingSoon />} />
          <p className="mt-3 max-w-[52ch] text-small text-ink-2">
            {NOT_YET.activityFeed} Open a product to see what happened to each of its listings, step by step.
          </p>
          <Button asChild variant="secondary" size="sm" className="mt-4">
            <Link to="/products">Open Products</Link>
          </Button>
        </LaCard>
      </div>
    </>
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
  if (!view.note) return <CountUp value={view.value} />
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="cursor-help rounded-sm underline decoration-line-strong decoration-dotted underline-offset-[6px]">
          <CountUp value={view.value} />
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

function Tile({ chip, view, testId, action }: { chip: ReactNode; view: TileView; testId: string; action?: ReactNode }) {
  return (
    <MetricTile
      chip={chip}
      action={action}
      value={<span data-testid={`${testId}-value`}><Value view={view} /></span>}
      caption={<span data-testid={`${testId}-caption`}>{view.caption}</span>}
    />
  )
}

const MARKETPLACE_CARDS: readonly MarketplaceId[] = ['amazon', 'flipkart', 'myntra', 'ajio']
const SUPPORTED_CARDS = MARKETPLACE_CARDS.filter((id): id is (typeof API_MARKETPLACES)[number] => (API_MARKETPLACES as readonly string[]).includes(id))
const UNSUPPORTED_CARDS = MARKETPLACE_CARDS.filter((id) => !(API_MARKETPLACES as readonly string[]).includes(id))
const MARKETPLACE_ROW = 'mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3'

function MarketplaceRow({ snapshot }: { snapshot: ListingsSnapshot }) {
  const accounts = useCurrentMarketplaceAccounts()
  return (
    <div className={cn('stagger-children [--stagger-base:80ms]', MARKETPLACE_ROW)} data-testid="home-marketplaces">
      {SUPPORTED_CARDS.map((m) => {
        if (accounts.isPending) return <MarketplaceCardSkeleton key={m} />
        const account = accounts.data?.live[m] ?? null
        const view = accounts.isError ? null : marketplaceCard(account, snapshot.byMarketplace[m], snapshot.complete)
        return (
          // Solid once anything is live on it; dashed only while nothing is listed and nothing to fix.
          <LaCard
            key={m}
            pad="sm"
            emphasis={view && view.chip.status === 'not-listed' && !view.action ? 'dashed' : 'default'}
            data-testid={`home-mp-${m}`}
          >
            <div className="flex items-center gap-3 font-semibold text-ink">
              <MarketplaceTile id={m} />
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
                <Link
                  to="/marketplaces"
                  className="inline-flex min-h-10 items-center gap-1 font-semibold text-attention-ink underline decoration-attention-line underline-offset-4 hover:decoration-attention pointer-fine:min-h-0"
                >
                  {view.sub}
                </Link>
              ) : (
                view.sub
              )}
            </p>
          </LaCard>
        )
      })}
      <UnsupportedMarketplaces />
    </div>
  )
}

function MarketplaceCardSkeleton() {
  return (
    <LaCard pad="sm">
      <Skeleton className="h-9 w-32" />
      <Skeleton className="mt-3 h-[22px] w-20 rounded-full" />
      <Skeleton className="mt-2 h-4 w-24" />
    </LaCard>
  )
}

/**
 * Marketplaces Kuinn does not list on yet, in one quiet card so the two real ones keep the room.
 * Static (no API): the skeleton body shows the same card, so it never swaps on load.
 */
function UnsupportedMarketplaces() {
  return (
    <DashedCard pad="sm" className="col-span-2 lg:col-span-1" data-testid="home-mp-more">
      <h3 className="text-small font-semibold text-ink-2">More marketplaces</h3>
      <ul className="mt-1.5">
        {UNSUPPORTED_CARDS.map((id) => (
          <li
            key={id}
            className="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-b border-line py-2 last:border-b-0 last:pb-0"
            data-testid={`home-mp-${id}`}
          >
            <span className="flex min-w-0 items-center gap-2.5 font-semibold text-ink">
              <MarketplaceTile id={id} size="xs" />
              {MARKETPLACES.find((x) => x.id === id)?.name ?? id}
            </span>
            <span className="ml-auto flex items-center gap-2">
              <StatusChip status="not-listed">Not available</StatusChip>
              <UnavailableButton
                reason={NOT_YET.waitlist}
                variant="link"
                size="xs"
                className="h-auto px-0 text-caption font-medium text-ink-3 no-underline aria-disabled:opacity-100"
              >
                Join waitlist
              </UnavailableButton>
            </span>
          </li>
        ))}
      </ul>
    </DashedCard>
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
  // A row paints once, title and meta together: wait for its product (SKU) too.
  const pending = tasks.isPending || issues.isPending || products.pending
  return (
    <LaCard data-testid="waiting-card">
      <CardHead
        title="Waiting for you"
        action={
          items.length ? (
            <Link
              to="/inbox"
              className="group -mx-1 -my-2 inline-flex min-h-10 items-center gap-1 rounded-sm px-1 text-small font-bold text-brand underline-offset-4 hover:underline"
              data-testid="waiting-view-all"
            >
              View all {total}
              {/* chev points down in the set: turned to point right; the nudge animates `translate`. */}
              <Icon
                name="chev"
                size={14}
                aria-hidden
                className="-rotate-90 transition-[translate] duration-[var(--dur-tactile)] ease-[var(--ease-tactile)] group-hover:translate-x-0.5"
              />
            </Link>
          ) : null
        }
      />
      <div className="mt-2">
        {error ? (
          <ErrorState compact error={error} title="Couldn't load your Inbox" onRetry={() => void Promise.all([tasks.refetch(), issues.refetch()])} />
        ) : pending ? (
          Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="flex items-center gap-3 border-b border-line py-3.5 last:border-b-0">
              <Skeleton className="size-9 rounded-tile" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-40 max-w-full" />
                <Skeleton className="h-3 w-56 max-w-full" />
              </div>
            </div>
          ))
        ) : items.length === 0 ? (
          <div className="flex items-center gap-3 py-3 text-small text-ink-2" data-testid="waiting-empty">
            <IconTile icon="check" tone="ok" size="lg" />
            Nothing needs you right now. New questions from the agent appear here.
          </div>
        ) : (
          items.map((it) => {
            const product = it.kind === 'task' && it.task.product_id ? products.map.get(it.task.product_id) : undefined
            const title = it.kind === 'task' ? it.task.question : issueTitle(it.issue)
            const meta =
              it.kind === 'task'
                ? [product?.sku, TASK_KIND_LABEL[it.task.kind]].filter(Boolean).join(' · ')
                : `${MARKETPLACE_LABEL[it.issue.marketplace]} · ${it.issue.severity === 'error' ? 'Error' : 'Warning'} on ${it.issue.field_path}`
            return (
              <TaskRow
                key={itemKey(it)}
                className="py-3.5"
                interactive
                leading={<ItemTile item={it} />}
                title={<span data-testid="waiting-title">{title}</span>}
                meta={meta}
                action={
                  <Button asChild size="sm" variant="secondary">
                    {/* The ::after stretches the link over the whole row, so a press anywhere opens it. */}
                    <Link
                      to="/inbox"
                      search={{ item: itemKey(it) }}
                      aria-label={`Open ${title}`}
                      className="after:absolute after:inset-0 after:content-['']"
                    >
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

function TileSkeleton({ attention, className }: { attention?: boolean; className?: string }) {
  return (
    <LaCard emphasis={attention ? 'attention' : 'default'} className={cn('flex min-h-[168px] flex-col', className)}>
      <Skeleton className="h-[22px] w-20 rounded-full" />
      <Skeleton className="mt-3 h-12 w-16" />
      <Skeleton className="mt-1.5 h-4 w-44 max-w-full" />
    </LaCard>
  )
}

/** Loading body: mirrors the dashboard's header and grids so nothing jumps when data lands. */
function HomeSkeletonBody() {
  return (
    <div aria-busy="true">
      <div className="flex flex-col gap-3 pb-5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div>
          <Skeleton className="h-8 w-56" />
          <Skeleton className="mt-2 h-4 w-48" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-36 rounded-control" />
          <Skeleton className="h-9 w-32 rounded-control" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
        <TileSkeleton />
        <TileSkeleton />
        <TileSkeleton attention className="col-span-2 md:col-span-1" />
      </div>
      <div className={MARKETPLACE_ROW}>
        {SUPPORTED_CARDS.map((m) => (
          <MarketplaceCardSkeleton key={m} />
        ))}
        <UnsupportedMarketplaces />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        {[0, 1].map((card) => (
          <LaCard key={card}>
            <Skeleton className="h-[22px] w-40" />
            <div className="mt-2">
              {Array.from({ length: 3 }, (_, i) => (
                <div key={i} className="flex h-14 items-center gap-3 border-b border-line last:border-b-0">
                  <Skeleton className="size-9 rounded-tile" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-40 max-w-full" />
                    <Skeleton className="h-3 w-56 max-w-full" />
                  </div>
                </div>
              ))}
            </div>
          </LaCard>
        ))}
      </div>
      <span className="sr-only">Loading Home…</span>
    </div>
  )
}
