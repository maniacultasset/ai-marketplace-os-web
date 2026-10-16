import { Link } from '@tanstack/react-router'
import { ArrowDownRight, ArrowRight, ArrowUpRight, BarChart3, CalendarRange } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import { Page, PageHeader } from '@/components/app/page-header'
import { Icon } from '@/components/la/icons'
import { MarketplaceTile } from '@/components/la/marketplace'
import { EmptyState } from '@/components/states/empty-state'
import { ErrorState } from '@/components/states/error-state'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { MARKETPLACE_META } from '@/features/marketplaces/meta'
import { cn } from '@/lib/utils'
import { useAnalyticsSummary, useAnalyticsTrend, usePreviousSummary, type TrendPoint } from './api'
import {
  bucketLabel,
  countTicks,
  formatCount,
  formatMetric,
  formatRange,
  formatRate,
  isEmptySummary,
  metricDelta,
  metricFraction,
  METRICS,
  metricValue,
  PRESET_LABEL,
  presetRange,
  RANGE_PRESETS,
  RATE_TICKS,
  type AnalyticsSummary,
  type Delta,
  type MarketplaceBreakdown,
  type MetricDef,
  type MetricId,
  type RangePreset,
} from './metrics'

export function Dashboard({ preset, onPreset }: { preset: RangePreset; onPreset: (p: RangePreset) => void }) {
  const range = presetRange(preset)
  const summary = useAnalyticsSummary(range)
  const ready = summary.isSuccess && !summary.isPlaceholderData
  const empty = summary.data ? isEmptySummary(summary.data) : false
  const previous = usePreviousSummary(range, ready && !empty)
  const trend = useAnalyticsTrend(range, ready && !empty)

  const refreshing = summary.isFetching || previous.isFetching || trend.isFetching
  const refresh = () => {
    void summary.refetch()
    if (!empty) {
      void previous.refetch()
      void trend.refetch()
    }
  }

  return (
    <Page>
      <PageHeader
        title="Listing reports"
        description={
          <span className="inline-flex items-center gap-1.5">
            <CalendarRange className="size-3.5" aria-hidden />
            <span data-testid="dashboard-range">{formatRange(range)}</span>
            <span aria-hidden>·</span>
            <span>UTC days</span>
          </span>
        }
        actions={
          <>
            <Tabs value={String(preset)} onValueChange={(v) => {
              const next = RANGE_PRESETS.find((p) => String(p) === v)
              if (next) onPreset(next)
            }}>
              <TabsList aria-label="Date range">
                {RANGE_PRESETS.map((p) => (
                  <TabsTrigger key={p} value={String(p)} className="px-2.5 tabular-nums" data-testid={`range-${p}`}>
                    <span aria-hidden>{PRESET_LABEL[p].short}</span>
                    <span className="sr-only">{PRESET_LABEL[p].long}</span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <Button
              variant="outline"
              size="icon"
              onClick={refresh}
              disabled={refreshing}
              aria-label={refreshing ? 'Refreshing…' : 'Refresh metrics'}
              title="Refresh metrics"
            >
              <Icon name="refresh" size={16} className={cn(refreshing && 'motion-safe:animate-spin')} />
            </Button>
          </>
        }
      />

      {summary.isPending ? (
        <DashboardSkeleton />
      ) : summary.isError && !summary.data ? (
        <Card className="py-0">
          <ErrorState error={summary.error} title="Couldn't load your metrics" onRetry={() => void summary.refetch()} />
        </Card>
      ) : summary.data && empty ? (
        <EmptyDashboard preset={preset} onPreset={onPreset} />
      ) : summary.data ? (
        <div
          className={cn('flex flex-col gap-5 transition-opacity duration-150 lg:gap-6', summary.isPlaceholderData && 'opacity-60')}
          aria-busy={summary.isPlaceholderData}
          data-testid="dashboard"
        >
          <KpiStrip summary={summary.data} previous={previous.data} previousLoading={previous.isPending && previous.fetchStatus !== 'idle'} />
          <div className="grid items-start gap-5 lg:grid-cols-3 lg:gap-6">
            <TrendCard
              className="lg:col-span-2"
              points={trend.data}
              loading={trend.isPending}
              dimmed={trend.isPlaceholderData}
              error={trend.isError && !trend.data ? trend.error : null}
              onRetry={() => void trend.refetch()}
            />
            <OutcomesCard summary={summary.data} />
          </div>
          <MarketplaceCard rows={summary.data.by_marketplace ?? []} />
        </div>
      ) : null}
    </Page>
  )
}

/* ---------------------------------------------------------------- KPI strip */

function KpiStrip({
  summary,
  previous,
  previousLoading,
}: {
  summary: AnalyticsSummary
  previous: AnalyticsSummary | undefined
  previousLoading: boolean
}) {
  return (
    <Card className="gap-0 py-0" data-testid="kpis">
      <dl className="grid grid-cols-2 lg:grid-cols-4">
        {METRICS.map((m, i) => (
          <Kpi
            key={m.id}
            metric={m}
            summary={summary}
            previous={previous}
            previousLoading={previousLoading}
            className={cn(
              i % 2 === 1 && 'border-l',
              i >= 2 && 'border-t lg:border-t-0',
              i === 2 && 'lg:border-l',
            )}
          />
        ))}
      </dl>
    </Card>
  )
}

function Kpi({
  metric,
  summary,
  previous,
  previousLoading,
  className,
}: {
  metric: MetricDef
  summary: AnalyticsSummary
  previous: AnalyticsSummary | undefined
  previousLoading: boolean
  className?: string
}) {
  const value = metricValue(summary, metric.id)
  const fraction = metricFraction(summary.counts, metric.id)
  const delta = previous ? metricDelta(metric.kind, value, metricValue(previous, metric.id)) : null
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5 px-4 py-4 sm:px-5', className)} data-testid={`kpi-${metric.id}`}>
      <dt className="flex items-center gap-1 text-[0.8125rem] text-muted-foreground">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="cursor-help underline decoration-border decoration-dotted underline-offset-4">{metric.label}</span>
          </TooltipTrigger>
          <TooltipContent>{metric.help}</TooltipContent>
        </Tooltip>
      </dt>
      <dd className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-[1.75rem] leading-none font-semibold tracking-[-0.02em]" data-testid={`kpi-${metric.id}-value`}>
          {formatMetric(metric.kind, value)}
        </span>
        {delta ? <DeltaChip delta={delta} /> : previousLoading ? <Skeleton className="h-4 w-12" /> : null}
      </dd>
      <dd className="truncate text-xs text-muted-foreground tabular-nums">
        {fraction
          ? fraction.den > 0
            ? `${formatCount(fraction.num)} of ${formatCount(fraction.den)}`
            : 'Nothing to rate yet'
          : previous
            ? `${formatCount(previous.listings_generated)} in the previous period`
            : 'In this period'}
      </dd>
    </div>
  )
}

function DeltaChip({ delta }: { delta: Delta }) {
  const Icon = delta.direction === 'up' ? ArrowUpRight : delta.direction === 'down' ? ArrowDownRight : ArrowRight
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-xs font-medium tabular-nums',
        delta.direction === 'up' && 'text-success',
        delta.direction === 'down' && 'text-destructive',
        delta.direction === 'flat' && 'text-muted-foreground',
      )}
      title="Change against the previous period of the same length"
    >
      <Icon className="size-3.5" aria-hidden />
      {delta.label}
      <span className="sr-only"> against the previous period</span>
    </span>
  )
}

/* ---------------------------------------------------------------- Trend */

const CHART_H = 200

function TrendCard({
  points,
  loading,
  dimmed,
  error,
  onRetry,
  className,
}: {
  points: TrendPoint[] | undefined
  loading: boolean
  dimmed: boolean
  error: unknown
  onRetry: () => void
  className?: string
}) {
  const [metricId, setMetricId] = useState<MetricId>('generated')
  const metric = (METRICS.find((m) => m.id === metricId) ?? METRICS[0])!
  return (
    <Card className={cn('gap-0 py-0', className)} data-testid="trend">
      <CardHeader className="flex flex-col gap-3 border-b py-3 sm:h-14 sm:flex-row sm:items-center sm:justify-between sm:py-0 [.border-b]:pb-3 sm:[.border-b]:pb-0">
        <CardTitle>Trend</CardTitle>
        <Tabs value={metricId} onValueChange={(v) => {
          const next = METRICS.find((m) => m.id === v)
          if (next) setMetricId(next.id)
        }}>
          <TabsList aria-label="Trend metric" className="max-w-full overflow-x-auto">
            {METRICS.map((m) => (
              <TabsTrigger key={m.id} value={m.id} className="px-2 text-xs">
                {m.id === 'generated' ? 'Generated' : m.id === 'approval' ? 'Approval' : m.id === 'validation' ? 'First pass' : 'Publish'}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </CardHeader>
      <div className="px-4 pt-4 pb-3 sm:px-5">
        {error ? (
          <ErrorState error={error} compact title="Couldn't load the trend" onRetry={onRetry} />
        ) : loading || !points ? (
          <TrendSkeleton />
        ) : (
          <div className={cn('transition-opacity duration-150', dimmed && 'opacity-60')}>
            <ColumnChart points={points} metric={metric} />
          </div>
        )}
      </div>
    </Card>
  )
}

function TrendSkeleton() {
  const heights = [40, 62, 48, 75, 55, 68]
  return (
    <div aria-busy="true" aria-label="Loading trend" className="flex flex-col gap-2">
      <div className="flex items-end gap-3 pl-10" style={{ height: CHART_H }}>
        {heights.map((h, i) => (
          <Skeleton key={i} className="flex-1 rounded-t-md rounded-b-none" style={{ height: `${h}%` }} />
        ))}
      </div>
      <div className="flex gap-3 pl-10">
        {heights.map((_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
    </div>
  )
}

function ColumnChart({ points, metric }: { points: TrendPoint[]; metric: MetricDef }) {
  const titleId = useId()
  const values = points.map((p) => metricValue(p.summary, metric.id))
  const ticks: readonly number[] =
    metric.kind === 'rate' ? RATE_TICKS : countTicks(Math.max(0, ...values.map((v) => v ?? 0)))
  const top = ticks[ticks.length - 1] || 1
  const [active, setActive] = useState<number | null>(null)
  // Label every bucket when they fit, else every other one (the tooltip and table carry the rest).
  const labelEvery = points.length > 9 ? 2 : 1
  const fmtTick = (t: number) => (metric.kind === 'rate' ? `${Math.round(t * 100)}%` : formatCount(t))

  return (
    <figure aria-labelledby={titleId} className="m-0">
      <figcaption id={titleId} className="sr-only">
        {metric.label} per period
      </figcaption>
      <div className="relative flex" style={{ height: CHART_H }}>
        {/* y axis */}
        <div className="relative w-10 shrink-0 text-[0.6875rem] text-muted-foreground tabular-nums" aria-hidden>
          {ticks.map((t) => (
            <span key={t} className="absolute right-2 leading-none" style={{ bottom: `${(t / top) * 100}%`, transform: 'translateY(50%)' }}>
              {fmtTick(t)}
            </span>
          ))}
        </div>
        <div className="relative min-w-0 flex-1">
          {ticks.map((t) => (
            <div
              key={t}
              aria-hidden
              className={cn('absolute inset-x-0 h-px', t === 0 ? 'bg-border-strong' : 'bg-border/70')}
              style={{ bottom: `${(t / top) * 100}%` }}
            />
          ))}
          <div className="absolute inset-0 flex items-end" onMouseLeave={() => setActive(null)}>
            {points.map((p, i) => {
              const v = values[i] ?? null
              const h = v == null ? 0 : Math.max((v / top) * 100, v > 0 ? 1.5 : 0)
              const isActive = active === i
              return (
                <div
                  key={p.range.from}
                  tabIndex={0}
                  role="img"
                  aria-label={`${formatRange(p.range)}: ${v == null ? 'nothing to rate' : formatMetric(metric.kind, v)}`}
                  className="group/col relative flex h-full flex-1 cursor-default items-end justify-center outline-none"
                  onMouseEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                >
                  <div className={cn('absolute inset-x-0.5 inset-y-0 rounded-md transition-colors duration-150', isActive && 'bg-muted/70 group-focus-visible/col:ring-2 group-focus-visible/col:ring-ring/50')} />
                  {v == null ? (
                    <div className="relative mb-0 h-0.5 w-[min(24px,60%)] rounded-full bg-border-strong" />
                  ) : (
                    <div
                      className={cn('relative w-[min(24px,60%)] rounded-t-[4px] transition-[height,background-color] duration-300', isActive ? 'bg-brand' : 'bg-brand/80')}
                      style={{ height: `${h}%` }}
                    />
                  )}
                  {isActive ? <ColumnTooltip point={p} metric={metric} value={v} alignEnd={i > points.length / 2} /> : null}
                </div>
              )
            })}
          </div>
        </div>
      </div>
      {/* x axis */}
      <div className="flex pl-10 pt-2 text-[0.6875rem] text-muted-foreground" aria-hidden>
        {points.map((p, i) => (
          <span key={p.range.from} className="flex-1 truncate text-center">
            {i % labelEvery === 0 || i === points.length - 1 ? bucketLabel(p.range) : ''}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>{metric.label} per period</caption>
        <thead>
          <tr>
            <th scope="col">Period</th>
            <th scope="col">{metric.label}</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p, i) => (
            <tr key={p.range.from}>
              <td>{formatRange(p.range)}</td>
              <td>{formatMetric(metric.kind, values[i] ?? null)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}

function ColumnTooltip({
  point,
  metric,
  value,
  alignEnd,
}: {
  point: TrendPoint
  metric: MetricDef
  value: number | null
  alignEnd: boolean
}) {
  const fraction = metricFraction(point.summary.counts, metric.id)
  return (
    <div
      role="presentation"
      className={cn(
        'pointer-events-none absolute top-1 z-10 w-max max-w-56 rounded-lg bg-popover px-3 py-2 text-popover-foreground shadow-elev-3 ring-1 ring-border',
        alignEnd ? 'right-1/2' : 'left-1/2',
      )}
    >
      <div className="text-[0.6875rem] text-muted-foreground">{formatRange(point.range)}</div>
      <div className="mt-0.5 flex items-center gap-1.5 text-sm">
        <span className="size-2 rounded-sm bg-brand" aria-hidden />
        <span className="font-semibold tabular-nums">{value == null ? '—' : formatMetric(metric.kind, value)}</span>
        <span className="text-muted-foreground">{metric.kind === 'count' ? 'generated' : metric.label.toLowerCase()}</span>
      </div>
      {fraction ? (
        <div className="mt-0.5 text-[0.6875rem] text-muted-foreground tabular-nums">
          {fraction.den > 0 ? `${formatCount(fraction.num)} of ${formatCount(fraction.den)}` : 'Nothing to rate'}
        </div>
      ) : null}
    </div>
  )
}

/* ---------------------------------------------------------------- Outcomes */

function OutcomesCard({ summary }: { summary: AnalyticsSummary }) {
  const c = summary.counts
  const rows = [
    {
      id: 'decisions',
      label: 'Review decisions',
      good: c?.approvals ?? 0,
      bad: c?.rejections ?? 0,
      goodLabel: 'approved',
      badLabel: 'rejected',
    },
    {
      id: 'validation',
      label: 'First rule checks',
      good: c?.validation_first_pass_passed ?? 0,
      bad: Math.max(0, (c?.validation_first_pass_total ?? 0) - (c?.validation_first_pass_passed ?? 0)),
      goodLabel: 'passed',
      badLabel: 'failed',
    },
    {
      id: 'publish',
      label: 'Publish attempts',
      good: c?.publish_succeeded ?? 0,
      bad: c?.publish_failed ?? 0,
      goodLabel: 'accepted',
      badLabel: 'failed',
    },
  ]
  return (
    <Card className="gap-0 py-0" data-testid="outcomes">
      <CardHeader className="flex h-14 flex-row items-center border-b py-0 [.border-b]:pb-0">
        <CardTitle>Outcomes</CardTitle>
      </CardHeader>
      <ul className="divide-y divide-border/70">
        {rows.map((r) => (
          <OutcomeRow key={r.id} {...r} />
        ))}
      </ul>
    </Card>
  )
}

function OutcomeRow({
  label,
  good,
  bad,
  goodLabel,
  badLabel,
}: {
  label: string
  good: number
  bad: number
  goodLabel: string
  badLabel: string
}) {
  const total = good + bad
  const goodPct = total ? (good / total) * 100 : 0
  return (
    <li className="flex flex-col gap-2 px-5 py-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-xs text-muted-foreground tabular-nums">{total ? `${formatCount(total)} total` : 'None yet'}</span>
      </div>
      <div
        className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-subtle shadow-inset-sm"
        role="img"
        aria-label={total ? `${good} ${goodLabel}, ${bad} ${badLabel}` : `No ${label.toLowerCase()} in this period`}
      >
        {good > 0 ? <div className="h-full rounded-full bg-success" style={{ width: `${goodPct}%` }} /> : null}
        {bad > 0 ? <div className="h-full flex-1 rounded-full bg-destructive" /> : null}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground tabular-nums">
        <LegendDot className="bg-success">
          <span className="text-foreground">{formatCount(good)}</span> {goodLabel}
          {total ? ` · ${formatRate(good / total)}` : ''}
        </LegendDot>
        <LegendDot className="bg-destructive">
          <span className="text-foreground">{formatCount(bad)}</span> {badLabel}
        </LegendDot>
      </div>
    </li>
  )
}

function LegendDot({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('size-2 rounded-full', className)} aria-hidden />
      <span>{children}</span>
    </span>
  )
}

/* ---------------------------------------------------------------- By marketplace */

function MarketplaceCard({ rows }: { rows: MarketplaceBreakdown[] }) {
  if (rows.length === 0) return null
  const rateCols: { id: Exclude<MetricId, 'generated'>; label: string }[] = [
    { id: 'approval', label: 'Approval' },
    { id: 'validation', label: 'First pass' },
    { id: 'publish', label: 'Publish success' },
  ]
  return (
    <Card className="gap-0 py-0" data-testid="by-marketplace">
      <CardHeader className="flex h-14 flex-row items-center border-b py-0 [.border-b]:pb-0">
        <CardTitle>By marketplace</CardTitle>
      </CardHeader>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-sm">
          <thead className="border-b border-line bg-sunken text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="h-9 pl-5 text-left font-medium">Marketplace</th>
              <th scope="col" className="h-9 px-3 text-right font-medium">Generated</th>
              {rateCols.map((c) => (
                <th key={c.id} scope="col" className="h-9 px-3 text-left font-medium last:pr-5">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/70">
            {rows.map((r) => {
              const meta = MARKETPLACE_META[r.marketplace]
              return (
                <tr key={r.marketplace} data-marketplace={r.marketplace}>
                  <td className="h-14 pl-5">
                    <span className="flex items-center gap-2.5">
                      <MarketplaceTile id={r.marketplace} size="sm" />
                      <span className="font-medium">{meta.short}</span>
                    </span>
                  </td>
                  <td className="px-3 text-right tabular-nums">{formatCount(r.listings_generated)}</td>
                  {rateCols.map((c) => {
                    const v = metricValue(r, c.id)
                    const f = metricFraction(r.counts, c.id)
                    return (
                      <td key={c.id} className="px-3 last:pr-5">
                        <div className="flex items-center gap-3">
                          <span className="w-12 shrink-0 tabular-nums">{formatRate(v)}</span>
                          <span className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-subtle shadow-inset-sm sm:block" aria-hidden>
                            {v != null ? <span className="block h-full rounded-full bg-brand" style={{ width: `${v * 100}%` }} /> : null}
                          </span>
                          {f && f.den > 0 ? (
                            <span className="hidden text-xs text-muted-foreground tabular-nums xl:inline">
                              {formatCount(f.num)}/{formatCount(f.den)}
                            </span>
                          ) : null}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

/* ---------------------------------------------------------------- Empty + skeleton */

function EmptyDashboard({ preset, onPreset }: { preset: RangePreset; onPreset: (p: RangePreset) => void }) {
  return (
    <Card className="py-0" data-testid="dashboard-empty">
      <EmptyState
        icon={BarChart3}
        title={`No listing activity in ${PRESET_LABEL[preset].long}`}
        description="Metrics appear once listings are generated, reviewed, checked against rules or published. Start from a product in your catalog."
        className="py-16"
        actions={
          <>
            <Button asChild>
              <Link to="/products">
                <Icon name="box" size={16} data-icon="inline-start" />
                Go to products
              </Link>
            </Button>
            {preset !== 365 ? (
              <Button variant="outline" onClick={() => onPreset(365)}>
                Show the last 12 months
              </Button>
            ) : null}
          </>
        }
      />
    </Card>
  )
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-5 lg:gap-6" aria-busy="true" aria-label="Loading metrics">
      <Card className="gap-0 py-0">
        <div className="grid grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={cn('flex flex-col gap-2.5 px-4 py-4 sm:px-5', i % 2 === 1 && 'border-l', i >= 2 && 'border-t lg:border-t-0', i === 2 && 'lg:border-l')}
            >
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-7 w-20" />
              <Skeleton className="h-3 w-24" />
            </div>
          ))}
        </div>
      </Card>
      <div className="grid items-start gap-5 lg:grid-cols-3 lg:gap-6">
        <Card className="gap-0 py-0 lg:col-span-2">
          <div className="flex h-14 items-center justify-between border-b px-5">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-7 w-64 max-w-[50%]" />
          </div>
          <div className="px-5 pt-4 pb-3">
            <TrendSkeleton />
          </div>
        </Card>
        <Card className="gap-0 py-0">
          <div className="flex h-14 items-center border-b px-5">
            <Skeleton className="h-4 w-20" />
          </div>
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex flex-col gap-2 border-b px-5 py-4 last:border-b-0">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-2 w-full rounded-full" />
              <Skeleton className="h-3 w-40" />
            </div>
          ))}
        </Card>
      </div>
    </div>
  )
}
