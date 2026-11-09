import { Link } from '@tanstack/react-router'
import { ArrowDownRight, ArrowRight, ArrowUpRight, CalendarRange } from 'lucide-react'
import { useId, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Page, PageHeader } from '@/components/app/page-header'
import { CONCEPT_ICON } from '@/components/la/concept-icons'
import { Icon, IconGlyph } from '@/components/la/icons'
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
import { QualitySection } from '@/features/assist/quality-section'
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
            <IconGlyph icon={CalendarRange} size={14} />
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
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={refresh}
                  disabled={refreshing}
                  aria-label={refreshing ? 'Refreshing…' : 'Refresh metrics'}
                >
                  <Icon name="refresh" size={16} aria-hidden className={cn(refreshing && 'motion-safe:animate-spin')} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Refresh metrics</TooltipContent>
            </Tooltip>
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
      {/* SI14: hidden on a backend without the quality read. */}
      {summary.data && !empty ? <QualitySection range={range} className="mt-5 lg:mt-6" /> : null}
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
      <dt className="flex items-center gap-1 text-small text-ink-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0} className="focus-ring cursor-help rounded-sm underline decoration-line-strong decoration-dotted underline-offset-4">
              {metric.label}
            </span>
          </TooltipTrigger>
          <TooltipContent>{metric.help}</TooltipContent>
        </Tooltip>
      </dt>
      <dd className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="font-display text-h1 tracking-[-0.02em] text-ink tabular-nums" data-testid={`kpi-${metric.id}-value`}>
          {formatMetric(metric.kind, value)}
        </span>
        {delta ? <DeltaChip delta={delta} /> : previousLoading ? <Skeleton className="h-4 w-12" /> : null}
      </dd>
      <dd className="truncate text-caption text-ink-3 tabular-nums">
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
  const arrow = delta.direction === 'up' ? ArrowUpRight : delta.direction === 'down' ? ArrowDownRight : ArrowRight
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-caption font-semibold tabular-nums',
        delta.direction === 'up' && 'text-success-ink',
        delta.direction === 'down' && 'text-danger-ink',
        delta.direction === 'flat' && 'text-ink-3',
      )}
      title="Change against the previous period of the same length"
    >
      <IconGlyph icon={arrow} size={14} />
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
              <TabsTrigger key={m.id} value={m.id} className="px-2 text-caption">
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
      <div className="flex items-end gap-3 pl-12" style={{ height: CHART_H }}>
        {heights.map((h, i) => (
          <Skeleton key={i} className="flex-1 rounded-t-md rounded-b-none" style={{ height: `${h}%` }} />
        ))}
      </div>
      <div className="flex gap-3 pl-12">
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
  const describe = (i: number) => {
    const v = values[i] ?? null
    return `${formatRange(points[i]!.range)}: ${v == null ? 'nothing to rate' : formatMetric(metric.kind, v)}`
  }

  // One tab stop for the whole chart: arrow keys move between periods, Home and End jump.
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    const last = points.length - 1
    const at = active ?? last
    const next =
      e.key === 'ArrowLeft' ? Math.max(0, at - 1) : e.key === 'ArrowRight' ? Math.min(last, at + 1) : e.key === 'Home' ? 0 : e.key === 'End' ? last : null
    if (next == null) return
    e.preventDefault()
    setActive(next)
  }

  return (
    <figure
      aria-labelledby={titleId}
      aria-describedby={`${titleId}-hint`}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onFocus={(e) => {
        if (e.target === e.currentTarget && active == null) setActive(points.length - 1)
      }}
      onBlur={() => setActive(null)}
      className="focus-ring m-0 rounded-md"
    >
      <figcaption id={titleId} className="sr-only">
        {metric.label} per period
      </figcaption>
      <span id={`${titleId}-hint`} className="sr-only">
        Use the left and right arrow keys to move between periods.
      </span>
      <span className="sr-only" aria-live="polite">
        {active != null && points[active] ? describe(active) : ''}
      </span>
      <div className="relative flex" style={{ height: CHART_H }}>
        {/* y axis */}
        <div className="relative w-12 shrink-0 text-caption text-ink-3 tabular-nums" aria-hidden>
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
              className={cn('absolute inset-x-0 h-px', t === 0 ? 'bg-line-strong' : 'bg-line')}
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
                  role="img"
                  aria-label={describe(i)}
                  className="relative flex h-full flex-1 cursor-default items-end justify-center"
                  onMouseEnter={() => setActive(i)}
                >
                  <div className={cn('absolute inset-x-0.5 inset-y-0 rounded-md transition-colors duration-150 motion-reduce:transition-none', isActive && 'bg-hover')} />
                  {v == null ? (
                    <div className="relative mb-0 h-0.5 w-[min(24px,60%)] rounded-full bg-line-strong" />
                  ) : (
                    // Full height, scaled from the bottom: a transform animates on the compositor.
                    <div
                      className={cn(
                        'relative h-full w-[min(24px,60%)] origin-bottom rounded-t-xs transition-[transform,background-color] duration-200 ease-out motion-reduce:transition-none',
                        isActive ? 'bg-brand' : 'bg-brand/80',
                      )}
                      style={{ transform: `scaleY(${h / 100})` }}
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
      <div className="flex pt-2 pl-12 text-caption text-ink-3" aria-hidden>
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
        'pointer-events-none absolute top-1 z-10 w-max max-w-56 rounded-card border border-line bg-surface px-3 py-2 text-ink shadow-raised-lg',
        alignEnd ? 'right-1/2' : 'left-1/2',
      )}
    >
      <div className="text-caption text-ink-3">{formatRange(point.range)}</div>
      <div className="mt-0.5 flex items-center gap-1.5 text-body">
        <span className="size-2 rounded-sm bg-brand" aria-hidden />
        <span className="font-semibold tabular-nums">{value == null ? '—' : formatMetric(metric.kind, value)}</span>
        <span className="text-ink-2">{metric.kind === 'count' ? 'generated' : metric.label.toLowerCase()}</span>
      </div>
      {fraction ? (
        <div className="mt-0.5 text-caption text-ink-3 tabular-nums">
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
      <ul className="divide-y divide-line">
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
        <span className="text-body font-semibold text-ink">{label}</span>
        <span className="text-caption text-ink-3 tabular-nums">{total ? `${formatCount(total)} total` : 'None yet'}</span>
      </div>
      <div
        className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-subtle shadow-inset-sm"
        role="img"
        aria-label={total ? `${good} ${goodLabel}, ${bad} ${badLabel}` : `No ${label.toLowerCase()} in this period`}
      >
        {good > 0 ? <div className="h-full rounded-full bg-success" style={{ width: `${goodPct}%` }} /> : null}
        {bad > 0 ? <div className="h-full flex-1 rounded-full bg-danger" /> : null}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-ink-3 tabular-nums">
        <LegendDot className="bg-success">
          <span className="text-ink">{formatCount(good)}</span> {goodLabel}
          {total ? ` · ${formatRate(good / total)}` : ''}
        </LegendDot>
        <LegendDot className="bg-danger">
          <span className="text-ink">{formatCount(bad)}</span> {badLabel}
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
        <table className="w-full min-w-[40rem] text-body">
          <thead className="border-b border-line bg-sunken text-caption text-ink-3">
            <tr>
              <th scope="col" className="h-9 pl-5 text-left font-semibold">Marketplace</th>
              <th scope="col" className="h-9 px-3 text-right font-semibold">Generated</th>
              {rateCols.map((c) => (
                <th key={c.id} scope="col" className="h-9 px-3 text-left font-semibold last:pr-5">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => {
              const meta = MARKETPLACE_META[r.marketplace]
              return (
                <tr key={r.marketplace} data-marketplace={r.marketplace}>
                  <td className="h-14 pl-5">
                    <span className="flex items-center gap-2.5">
                      <MarketplaceTile id={r.marketplace} size="sm" />
                      <span className="font-semibold text-ink">{meta.short}</span>
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
                            <span className="hidden text-caption text-ink-3 tabular-nums xl:inline">
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
        icon={CONCEPT_ICON.reports}
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
              <Skeleton className="h-8 w-20" />
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
