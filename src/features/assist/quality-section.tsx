/**
 * SI14 listing quality on Listing reports: first-pass rate, blocked rate, edit rate at approval and
 * cost per listing for the chosen range. Platform admins also get the staff view across brands
 * (ids and counts only). Renders nothing on a backend that does not serve the quality read.
 */
import { useState } from 'react'
import { isApiError } from '@/api/errors'
import { MarketplaceTile } from '@/components/la/marketplace'
import { ErrorState } from '@/components/states/error-state'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useQuality } from '@/features/analytics-images/analytics/api'
import type { DayRange } from '@/features/analytics-images/analytics/metrics'
import { MARKETPLACE_META } from '@/features/marketplaces/meta'
import { useCan } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import {
  editedFieldBars,
  fieldLabel,
  formatQuality,
  formatQualityRate,
  formatUsd,
  isEmptyQuality,
  QUALITY_METRICS,
  qualityValue,
  shortTenant,
  type QualitySummary,
} from './quality-model'

/** No quality read on this backend (or not for this role): show nothing. */
const absent = (err: unknown) => isApiError(err) && [403, 404, 405, 501].includes(err.status)

const count = new Intl.NumberFormat('en-IN')

export function QualitySection({ range, className }: { range: DayRange; className?: string }) {
  const can = useCan()
  const staff = can('platform:admin')
  const [scope, setScope] = useState<'brand' | 'platform'>('brand')
  const brand = useQuality(range, 'brand')
  const platform = useQuality(range, 'platform', staff)
  // The staff view is offered only once the backend has answered it for this person.
  const platformOk = staff && platform.isSuccess
  const q = scope === 'platform' && platformOk ? platform : brand

  if (brand.isError && absent(brand.error) && !platformOk) return null

  return (
    <Card className={cn('gap-0 py-0', className)} data-testid="quality" data-scope={scope}>
      <CardHeader className="flex flex-col gap-3 border-b py-3 sm:min-h-14 sm:flex-row sm:items-center sm:justify-between sm:py-0 [.border-b]:pb-3 sm:[.border-b]:pb-0">
        <div className="min-w-0">
          <CardTitle>Listing quality</CardTitle>
          <p className="mt-0.5 text-caption text-ink-3">How often a listing is right the first time, and what it costs.</p>
        </div>
        {platformOk ? (
          <Tabs value={scope} onValueChange={(v) => setScope(v === 'platform' ? 'platform' : 'brand')}>
            <TabsList aria-label="Quality scope">
              <TabsTrigger value="brand" className="px-2.5" data-testid="quality-scope-brand">
                This brand
              </TabsTrigger>
              <TabsTrigger value="platform" className="px-2.5" data-testid="quality-scope-platform">
                All brands
              </TabsTrigger>
            </TabsList>
          </Tabs>
        ) : null}
      </CardHeader>
      {q.isPending ? (
        <QualitySkeleton />
      ) : q.isError && !q.data ? (
        <ErrorState error={q.error} compact title="Couldn’t load the quality numbers" onRetry={() => void q.refetch()} />
      ) : q.data && isEmptyQuality(q.data) ? (
        <p className="px-5 py-6 text-small text-ink-2" data-testid="quality-empty">
          Quality numbers appear once listings are generated in this range.
        </p>
      ) : q.data ? (
        <div className={cn('transition-opacity duration-150', q.isPlaceholderData && 'opacity-60')} aria-busy={q.isPlaceholderData || undefined}>
          <QualityKpis data={q.data} />
          <div className="grid border-t lg:grid-cols-2">
            <ByMarketplace data={q.data} />
            <EditedFields data={q.data} />
          </div>
          {scope === 'platform' && q.data.by_tenant?.length ? <ByTenant data={q.data} /> : null}
        </div>
      ) : null}
    </Card>
  )
}

function QualityKpis({ data }: { data: QualitySummary }) {
  return (
    <dl className="grid grid-cols-2 lg:grid-cols-4" data-testid="quality-kpis">
      {QUALITY_METRICS.map((m, i) => (
        <div
          key={m.id}
          className={cn('flex min-w-0 flex-col gap-1.5 px-4 py-4 sm:px-5', i % 2 === 1 && 'border-l', i >= 2 && 'border-t lg:border-t-0', i === 2 && 'lg:border-l')}
          data-testid={`quality-${m.id}`}
        >
          <dt className="text-small text-ink-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0} className="focus-ring cursor-help rounded-sm underline decoration-line-strong decoration-dotted underline-offset-4">
                  {m.label}
                </span>
              </TooltipTrigger>
              <TooltipContent>{m.help}</TooltipContent>
            </Tooltip>
          </dt>
          <dd className="font-display text-h1 tracking-[-0.02em] text-ink tabular-nums" data-testid={`quality-${m.id}-value`}>
            {formatQuality(m.kind, qualityValue(data, m.id))}
          </dd>
          <dd className="truncate text-caption text-ink-3">
            {m.id === 'cost_per_listing_usd'
              ? `${count.format(data.listings_generated)} ${data.listings_generated === 1 ? 'listing' : 'listings'} generated`
              : m.better === 'higher'
                ? 'Higher is better'
                : 'Lower is better'}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function ByMarketplace({ data }: { data: QualitySummary }) {
  const rows = data.by_marketplace ?? []
  return (
    <section className="min-w-0 px-4 py-4 sm:px-5" aria-labelledby="quality-mkt" data-testid="quality-by-marketplace">
      <h3 id="quality-mkt" className="text-small font-bold text-ink">
        By marketplace
      </h3>
      {rows.length ? (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[22rem] text-small">
            <thead className="text-caption text-ink-3">
              <tr className="border-b border-line">
                <th scope="col" className="h-8 text-left font-semibold">Marketplace</th>
                <th scope="col" className="h-8 px-2 text-right font-semibold">First pass</th>
                <th scope="col" className="h-8 px-2 text-right font-semibold">Blocked</th>
                <th scope="col" className="h-8 px-2 text-right font-semibold">Edited</th>
                <th scope="col" className="h-8 pl-2 text-right font-semibold">Per listing</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.marketplace} data-marketplace={r.marketplace}>
                  <td className="h-11">
                    <span className="flex items-center gap-2">
                      <MarketplaceTile id={r.marketplace} size="xs" />
                      <span className="font-semibold text-ink">{MARKETPLACE_META[r.marketplace].short}</span>
                    </span>
                  </td>
                  <td className="px-2 text-right tabular-nums">{formatQualityRate(r.first_pass_rate)}</td>
                  <td className="px-2 text-right tabular-nums">{formatQualityRate(r.blocked_rate)}</td>
                  <td className="px-2 text-right tabular-nums">{formatQualityRate(r.edit_rate)}</td>
                  <td className="pl-2 text-right tabular-nums">{formatUsd(r.cost_per_listing_usd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-2 text-small text-ink-2">No marketplace has listings in this range.</p>
      )}
    </section>
  )
}

function EditedFields({ data }: { data: QualitySummary }) {
  const bars = editedFieldBars(data.edited_fields).slice(0, 8)
  return (
    <section className="min-w-0 border-t px-4 py-4 sm:px-5 lg:border-t-0 lg:border-l" aria-labelledby="quality-edits" data-testid="quality-edited-fields">
      <h3 id="quality-edits" className="text-small font-bold text-ink">
        Fields people edit before approving
      </h3>
      {bars.length ? (
        <ul className="mt-3 flex flex-col gap-2.5">
          {bars.map((b) => (
            <li key={b.path} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_2.5rem] items-center gap-3 text-small" title={`${fieldLabel(b.path)}: edited on ${b.count} ${b.count === 1 ? 'listing' : 'listings'}`}>
              <span className="truncate text-ink">{fieldLabel(b.path)}</span>
              <span className="h-2 overflow-hidden rounded-full bg-subtle" aria-hidden>
                <span className="block h-full rounded-full bg-brand" style={{ width: `${Math.max(4, b.share * 100)}%` }} />
              </span>
              <span className="text-right text-ink-2 tabular-nums">{count.format(b.count)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-small text-ink-2">No approved listing was edited in this range.</p>
      )}
    </section>
  )
}

function ByTenant({ data }: { data: QualitySummary }) {
  const rows = [...(data.by_tenant ?? [])].sort((a, b) => b.listings_generated - a.listings_generated)
  return (
    <section className="border-t px-4 py-4 sm:px-5" aria-labelledby="quality-tenants" data-testid="quality-by-tenant">
      <h3 id="quality-tenants" className="text-small font-bold text-ink">
        By brand
      </h3>
      <p className="mt-0.5 text-caption text-ink-3">Brand ids and counts only.</p>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[34rem] text-small">
          <thead className="text-caption text-ink-3">
            <tr className="border-b border-line">
              <th scope="col" className="h-8 text-left font-semibold">Brand id</th>
              <th scope="col" className="h-8 px-2 text-right font-semibold">Generated</th>
              <th scope="col" className="h-8 px-2 text-right font-semibold">First pass</th>
              <th scope="col" className="h-8 px-2 text-right font-semibold">Blocked</th>
              <th scope="col" className="h-8 px-2 text-right font-semibold">Edited</th>
              <th scope="col" className="h-8 pl-2 text-right font-semibold">Total cost</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((t) => (
              <tr key={t.tenant_id}>
                <td className="h-10 font-mono text-ink" title={t.tenant_id}>
                  {shortTenant(t.tenant_id)}
                </td>
                <td className="px-2 text-right tabular-nums">{count.format(t.listings_generated)}</td>
                <td className="px-2 text-right tabular-nums">{formatQualityRate(t.first_pass_rate)}</td>
                <td className="px-2 text-right tabular-nums">{formatQualityRate(t.blocked_rate)}</td>
                <td className="px-2 text-right tabular-nums">{formatQualityRate(t.edit_rate)}</td>
                <td className="pl-2 text-right tabular-nums">{formatUsd(t.cost_usd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function QualitySkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 px-4 py-4 sm:px-5 lg:grid-cols-4" aria-busy="true" aria-label="Loading quality">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex flex-col gap-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-20" />
        </div>
      ))}
    </div>
  )
}
