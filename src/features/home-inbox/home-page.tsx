/**
 * /home (hi-fi 06 Home, 05 Home first run). One read, GET /home/summary (client feedback 11 Nov,
 * item 6): exact counts with a definition each, every tile linked to its filtered list, the
 * things that wait on the caller (product, issue, action), the agent's recent work with its
 * failures and pending jobs, and each marketplace's next step. Everything lands together, after
 * skeletons shaped like the page.
 *   first run  GET /tenants/me, GET /marketplaces/accounts, GET /products?limit=1 (./first-run)
 */
import { Link, type LinkProps } from '@tanstack/react-router'
import { useEffect, useState, type ReactNode } from 'react'
import { Page, PageHeader } from '@/components/app/page-header'
import { LaCard, CardHead, DashedCard, MetricTile, TaskRow } from '@/components/la/cards'
import { CountUp } from '@/components/la/count-up'
import { CONCEPT_ICON } from '@/components/la/concept-icons'
import { Icon, IconGlyph, IconTile } from '@/components/la/icons'
import { MARKETPLACES, MarketplaceTile, type MarketplaceId } from '@/components/la/marketplace'
import { StatusChip } from '@/components/la/status-chip'
import { RoadmapChip, WaitlistButton } from '@/components/la/unavailable'
import { ErrorState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useBrandName } from '@/features/brand/api'
import { MARKETPLACE_LABEL } from '@/features/inbox/model'
import { comingSoon, comingSoonReason } from '@/features/marketplaces/meta'
import { useMe } from '@/lib/auth'
import { useCan } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { useHomeSummary } from './api'
import { BrandScopeSelect, BrandsOverview } from './brands-overview'
import { showBrandScope, type BrandScope } from './brands-model'
import { FirstRun } from './first-run'
import { API_MARKETPLACES, greeting } from './model'
import { Ago } from './parts'
import {
  feedRows,
  feedSummary,
  liveTile,
  marketCard,
  needsYouTile,
  progressTile,
  STATE_WORD,
  waitingEmpty,
  waitingRow,
  type HomeSummary,
  type SummaryTile,
  type Target,
} from './summary-model'

/** A summary link target as router Link props (the targets are this app's own routes). */
const linkTo = (t: Target) => t as unknown as LinkProps

/**
 * `scope` is the URL's brand scope (`/home?brands=all`, `./brands-model`); `onScope` changes it.
 * Without a router (tests) the page keeps it itself.
 */
export function HomePage({ scope, onScope }: { scope?: BrandScope; onScope?: (s: BrandScope) => void } = {}) {
  const { data: me } = useMe()
  const brand = useBrandName(me)
  const [local, setLocal] = useState<BrandScope>(undefined)
  const current = onScope ? scope : local
  const setScope = onScope ?? setLocal
  const all = current === 'all' && showBrandScope(me)
  const summary = useHomeSummary()
  const picker = <BrandScopeSelect scope={all ? 'all' : undefined} onScope={setScope} />

  if (all) {
    return (
      <Page>
        <PageHeader title={greeting(me?.display_name ?? null)} description="All my brands" actions={picker} />
        <BrandsOverview onScope={setScope} />
      </Page>
    )
  }
  // p05 "Checklist and routes are shown until the first listing exists" (no listings at all).
  // FirstRun mounts its own Page; every other state swaps inside one shared Page so the page-in
  // rise plays once (skeleton → dashboard does not rise twice).
  if (summary.isSuccess && summary.data.listings.total === 0) return <FirstRun brand={brand} actions={picker} />
  return (
    <Page>
      {summary.isPending ? (
        <HomeSkeletonBody />
      ) : summary.isError ? (
        <>
          <PageHeader title={greeting(me?.display_name ?? null)} description={brand || undefined} actions={picker} />
          <LaCard className="mx-auto w-full max-w-xl py-10">
            <ErrorState error={summary.error} title="Couldn't load Home" onRetry={() => void summary.refetch()} />
          </LaCard>
        </>
      ) : (
        <DashboardBody brand={brand} name={me?.display_name ?? null} summary={summary.data} updatedAt={summary.dataUpdatedAt} picker={picker} />
      )}
    </Page>
  )
}

export function DashboardBody({
  brand,
  name,
  summary,
  updatedAt,
  picker,
}: {
  brand: string
  name: string | null
  summary: HomeSummary
  updatedAt: number
  /** The brand selector (2+ brands only). */
  picker?: ReactNode
}) {
  const can = useCan()
  const live = liveTile(summary)
  const working = progressTile(summary)
  const needs = needsYouTile(summary)

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
            {picker}
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

      {/* One read answers every tile, so the row rises once and counts up once. */}
      <div className="stagger-children grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4" data-testid="home-tiles">
        <Tile testId="tile-live" chip={<StatusChip status="live" />} view={live} />
        <Tile testId="tile-working" chip={<StatusChip status="working">In progress</StatusChip>} view={working} />
        <MetricTile
          emphasis="attention"
          className="col-span-2 md:col-span-1"
          chip={<TileChip chip={<StatusChip status="needs-you" />} definition={needs.definition} testId="tile-needs" />}
          value={
            <span data-testid="tile-needs-value">
              <CountUp value={needs.value} />
            </span>
          }
          caption={
            <>
              <span data-testid="tile-needs-caption">{needs.caption}</span>
              {needs.aside ? (
                <span className="mt-0.5 block text-caption text-ink-3" data-testid="tile-needs-aside">
                  {needs.aside}
                </span>
              ) : null}
            </>
          }
          action={
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm" variant="warn" data-testid="tile-needs-link">
                <Link {...linkTo(needs.link.target)}>{needs.link.label}</Link>
              </Button>
              {needs.listings ? (
                <Button asChild size="sm" variant="secondary" className="min-w-0 max-w-full" data-testid="tile-needs-listings">
                  <Link {...linkTo(needs.listings.target)}>
                    <span className="min-w-0 truncate">{needs.listings.label}</span>
                  </Link>
                </Button>
              ) : null}
            </div>
          }
        />
      </div>

      <MarketplaceRow summary={summary} />

      <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <WaitingCard summary={summary} />
        <AgentFeed summary={summary} />
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

/** The tile's chip with an info mark: what the number counts, in plain words. */
function TileChip({ chip, definition, testId }: { chip: ReactNode; definition: string; testId: string }) {
  return (
    <span className="flex items-center gap-1.5">
      {chip}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={`What this counts: ${definition}`}
            className="inline-flex size-6 items-center justify-center rounded-full text-ink-3 hover:text-ink-2 focus-visible:text-ink-2"
            data-testid={`${testId}-definition`}
          >
            <Icon name="info" size={14} aria-hidden />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-72">{definition}</TooltipContent>
      </Tooltip>
    </span>
  )
}

function Tile({ chip, view, testId }: { chip: ReactNode; view: SummaryTile; testId: string }) {
  return (
    <MetricTile
      chip={<TileChip chip={chip} definition={view.definition} testId={testId} />}
      value={
        <span data-testid={`${testId}-value`}>
          <CountUp value={view.value} />
        </span>
      }
      caption={<span data-testid={`${testId}-caption`}>{view.caption}</span>}
      action={
        <Button asChild size="sm" variant="secondary" data-testid={`${testId}-link`}>
          <Link {...linkTo(view.link.target)}>{view.link.label}</Link>
        </Button>
      }
    />
  )
}

const MARKETPLACE_CARDS: readonly MarketplaceId[] = ['amazon', 'flipkart', 'myntra', 'ajio']
const SUPPORTED_CARDS = MARKETPLACE_CARDS.filter((id): id is (typeof API_MARKETPLACES)[number] => (API_MARKETPLACES as readonly string[]).includes(id))
const UNSUPPORTED_CARDS = MARKETPLACE_CARDS.filter((id) => !(API_MARKETPLACES as readonly string[]).includes(id))
const MARKETPLACE_ROW = 'mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3'

const LINK_ATTENTION =
  'inline-flex min-h-10 items-center gap-1 font-semibold text-attention-ink underline decoration-attention-line underline-offset-4 hover:decoration-attention pointer-fine:min-h-0'
const LINK_QUIET = 'inline-flex min-h-10 items-center gap-1 font-semibold text-brand underline-offset-4 hover:underline pointer-fine:min-h-0'
const LINK_COUNT =
  'inline-flex min-h-10 items-center tabular-nums text-ink-2 underline decoration-line underline-offset-4 hover:text-ink hover:decoration-ink-3 pointer-fine:min-h-0'

function MarketplaceRow({ summary }: { summary: HomeSummary }) {
  // Connecting is an owner or admin's job: other roles get the reason, not a dead-end link.
  const canConnect = useCan()('marketplace:connect')
  const connected = summary.marketplaces.filter((m) => m.account !== 'not_connected').map((m) => m.marketplace)
  return (
    <div className={cn('stagger-children [--stagger-base:80ms]', MARKETPLACE_ROW)} data-testid="home-marketplaces">
      {SUPPORTED_CARDS.map((m) => {
        const soon = comingSoon(m, connected) ? { reason: comingSoonReason(m) } : null
        const view = marketCard(summary, m, soon)
        const next = view.action || view.problem || soon ? null : view.next
        const line = view.action || view.problem || view.sub || next
        return (
          // Solid once anything is live, counted or to do on it; dashed only while it is empty.
          <LaCard
            key={m}
            pad="sm"
            emphasis={view.chip.status === 'not-listed' && !view.action && !next && !view.stats.length && !view.paused ? 'dashed' : 'default'}
            data-testid={`home-mp-${m}`}
          >
            <div className="flex items-center gap-3 font-semibold text-ink">
              <MarketplaceTile id={m} />
              {MARKETPLACE_LABEL[m]}
            </div>
            <div className="mt-3">
              {view.chip.target && view.chip.definition ? (
                <CountLink target={view.chip.target} definition={view.chip.definition} testId="mp-chip-link" className="inline-flex rounded-full">
                  <StatusChip status={view.chip.status} className="tabular-nums">
                    <span data-testid="mp-chip">{view.chip.label}</span>
                  </StatusChip>
                </CountLink>
              ) : (
                <StatusChip status={view.chip.status} className="tabular-nums">
                  <span data-testid="mp-chip">{view.chip.label}</span>
                </StatusChip>
              )}
            </div>
            {view.stats.length ? (
              <p className="mt-2 flex flex-wrap items-center gap-x-1.5 text-caption text-ink-2" data-testid="mp-stats">
                {view.stats.map((st, i) => (
                  <span key={st.key} className="inline-flex items-center gap-x-1.5">
                    {i > 0 ? <span aria-hidden className="text-ink-3">·</span> : null}
                    <CountLink target={st.target} definition={st.definition} testId={`mp-stat-${st.key}`} className={st.attention ? LINK_ATTENTION : LINK_COUNT}>
                      {st.label}
                    </CountLink>
                  </span>
                ))}
              </p>
            ) : null}
            {line ? (
              <p className="mt-2 text-caption text-ink-2">
                {view.action && !canConnect ? (
                  <span data-testid="mp-connect-who">
                    {view.action === 'reconnect' ? 'Access expired. An owner or admin can reconnect it.' : 'Not connected. An owner or admin can connect it.'}
                  </span>
                ) : view.problem ? (
                  <Link to="/products/$productId" params={{ productId: view.problem.productId }} className={LINK_ATTENTION} data-testid="mp-problem">
                    {view.problem.text}
                  </Link>
                ) : view.action ? (
                  <Link to="/marketplaces" search={{ mp: m }} className={LINK_ATTENTION} data-testid="mp-connect">
                    {view.sub}
                  </Link>
                ) : (
                  <>
                    {view.sub && !(next && view.sub === 'Connected. No listings yet.') ? <span>{view.sub}</span> : null}
                    {next ? (
                      <>
                        {view.sub && view.sub !== 'Connected. No listings yet.' ? ' · ' : null}
                        {next.definition ? (
                          <CountLink target={next.target} definition={next.definition} testId="mp-next" className={LINK_QUIET}>
                            {next.label}
                          </CountLink>
                        ) : (
                          <Link {...linkTo(next.target)} className={LINK_QUIET} data-testid="mp-next">
                            {next.label}
                          </Link>
                        )}
                      </>
                    ) : null}
                  </>
                )}
              </p>
            ) : null}
            {view.paused ? (
              <p className="mt-2 flex items-start gap-1.5 text-caption text-ink-3" data-testid="mp-paused">
                <Icon name="info" size={14} className="mt-px shrink-0" aria-hidden />
                <span>{view.paused}</span>
              </p>
            ) : null}
          </LaCard>
        )
      })}
      <UnsupportedMarketplaces />
    </div>
  )
}

/**
 * A number on a marketplace card: it opens its filtered list, and says what it counts on hover or
 * focus (the tooltip) and to a screen reader (the hidden sentence in the link's name).
 */
function CountLink({ target, definition, testId, className, children }: { target: Target; definition: string; testId: string; className?: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link {...linkTo(target)} className={cn('focus-ring', className)} data-testid={testId}>
          {children}
          <span className="sr-only">. {definition}</span>
        </Link>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">{definition}</TooltipContent>
    </Tooltip>
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
              <RoadmapChip />
              <WaitlistButton
                name={MARKETPLACES.find((x) => x.id === id)?.name ?? id}
                variant="link"
                size="xs"
                className="h-auto px-0 text-caption font-medium text-ink-3 no-underline aria-disabled:opacity-100"
              />
            </span>
          </li>
        ))}
      </ul>
    </DashedCard>
  )
}

function WaitingCard({ summary }: { summary: HomeSummary }) {
  const can = useCan()
  const rows = summary.needs_you_items.map(waitingRow)
  const inbox = summary.needs_you.blocked + summary.needs_you.questions
  const empty = waitingEmpty(summary)
  return (
    <LaCard data-testid="waiting-card">
      <CardHead
        title="Waiting for you"
        action={
          inbox > 0 ? (
            <Link
              to="/inbox"
              className="group -mx-1 -my-2 inline-flex min-h-10 items-center gap-1 rounded-sm px-1 text-small font-bold text-brand underline-offset-4 hover:underline"
              data-testid="waiting-view-all"
            >
              Open Inbox
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
        {rows.length === 0 ? (
          <div className="flex items-start gap-3 py-3 text-small text-ink-2" data-testid="waiting-empty">
            <IconTile icon={empty === 'clear' ? 'check' : 'spark'} tone={empty === 'clear' ? 'ok' : 'brand'} size="lg" />
            <div className="min-w-0">
              {empty === 'add-product' ? (
                <>
                  <p>Nothing to do yet. Add your first product and Kuinn writes its listing.</p>
                  {can('product:import') ? (
                    <Button asChild size="sm" className="mt-2" data-testid="waiting-add">
                      <Link to="/add">Add a product</Link>
                    </Button>
                  ) : null}
                </>
              ) : empty === 'connect' ? (
                <>
                  <p>Nothing needs you right now. Connect a marketplace so approved listings can go live.</p>
                  {can('marketplace:connect') ? (
                    <Button asChild size="sm" variant="secondary" className="mt-2" data-testid="waiting-connect">
                      <Link to="/marketplaces">Connect a marketplace</Link>
                    </Button>
                  ) : (
                    <p className="mt-1 text-caption text-ink-3">An owner or admin can connect one.</p>
                  )}
                </>
              ) : summary.needs_you.own_work > 0 ? (
                <p data-testid="waiting-own-work">
                  Nothing needs you right now. {summary.needs_you.own_work} {summary.needs_you.own_work === 1 ? 'listing you made waits' : 'listings you made wait'} for
                  someone else to approve.
                </p>
              ) : summary.needs_you.publishing_paused > 0 ? (
                <p>
                  Nothing needs you right now. {summary.needs_you.publishing_paused} approved{' '}
                  {summary.needs_you.publishing_paused === 1 ? 'listing waits' : 'listings wait'} while publishing is paused.
                </p>
              ) : (
                <p>Nothing needs you right now. New questions from the agent appear here.</p>
              )}
            </div>
          </div>
        ) : (
          rows.map((r) => (
            <TaskRow
              key={r.key}
              className="py-3.5"
              interactive
              leading={<IconTile icon={r.icon.icon} tone={r.icon.tone} />}
              title={<span data-testid="waiting-title">{r.title}</span>}
              meta={
                <span data-testid="waiting-issue">
                  {r.issue}
                  {r.meta ? <span className="text-ink-3"> · {r.meta}</span> : null}
                </span>
              }
              action={
                <Button asChild size="sm" variant="secondary">
                  {/* The ::after stretches the link over the whole row, so a press anywhere opens it. */}
                  <Link {...linkTo(r.target)} aria-label={`${r.action}: ${r.title}`} className="after:absolute after:inset-0 after:content-['']" data-testid="waiting-action">
                    {r.action}
                  </Link>
                </Button>
              }
            />
          ))
        )}
      </div>
    </LaCard>
  )
}

const FEED_ROWS = 6

function AgentFeed({ summary }: { summary: HomeSummary }) {
  const rows = feedRows(summary.activity).slice(0, FEED_ROWS)
  const sub = feedSummary(summary.activity)
  return (
    <LaCard data-testid="agent-feed">
      <CardHead
        title="What the agent did"
        icon="activity"
        iconTone="neutral"
        sub={sub ? <span data-testid="agent-feed-sub">{sub}</span> : undefined}
        action={
          <Button asChild variant="ghost" size="sm" data-testid="agent-feed-activity">
            <Link to="/activity">Open Activity</Link>
          </Button>
        }
      />
      {rows.length === 0 ? (
        <p className="mt-3 max-w-[52ch] text-small text-ink-2" data-testid="agent-feed-empty">
          Nothing yet. When you add a product, the agent writes its listing, checks its photos and fixes what it can. Each step shows here.
        </p>
      ) : (
        <ol className="mt-2" aria-label="Recent agent actions">
          {rows.map((r) => (
            <li key={r.key} className="flex items-start gap-3 border-b border-line py-2.5 last:border-b-0" data-testid="agent-feed-row" data-state={r.state}>
              <IconTile icon={r.icon.icon} tone={r.icon.tone} size="sm" className="mt-0.5" />
              <div className="min-w-0 flex-1 text-small">
                <span className="sr-only">{STATE_WORD[r.state]}: </span>
                {r.target ? (
                  <Link {...linkTo(r.target)} className="font-semibold text-ink underline-offset-4 hover:underline">
                    {r.text}
                  </Link>
                ) : (
                  <span className="font-semibold text-ink">{r.text}</span>
                )}
                <span className="block text-caption text-ink-3">
                  {r.state === 'failed' ? 'Failed · ' : r.state === 'pending' ? 'In progress · ' : null}
                  <Ago iso={r.at} />
                </span>
              </div>
            </li>
          ))}
        </ol>
      )}
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
