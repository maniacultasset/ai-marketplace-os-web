/**
 * Home's brand selector and cross-brand overview (client feedback 11 Nov 2026, item 18; ADR-0032
 * light path). The selector shows only for a person in 2+ brands: "All my brands" opens the
 * overview (GET /home/brands, each brand counted by the backend inside that brand), a brand opens
 * that brand's Home (POST /auth/switch-tenant for another one). A row of the overview switches to
 * its brand the same way.
 */
import { useNavigate } from '@tanstack/react-router'
import { useState, type ReactNode } from 'react'
import { LaCard, CardHead } from '@/components/la/cards'
import { Icon } from '@/components/la/icons'
import { ErrorState } from '@/components/states'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { switchTenant, useMe } from '@/lib/auth'
import { cn } from '@/lib/utils'
import { useHomeBrands } from './api'
import { BRAND_DEFINITION, brandRows, brandsSummary, showBrandScope, type BrandRowView, type BrandScope } from './brands-model'

const ALL = 'all'

/** Opens another brand's Home: switch the token, then land on /home (the brand view). */
function useOpenBrand() {
  const navigate = useNavigate()
  const [pending, setPending] = useState<string | null>(null)
  const open = (tenantId: string) => {
    setPending(tenantId)
    switchTenant(tenantId)
      .then(() => navigate({ to: '/home' }))
      .catch(() => undefined)
      .finally(() => setPending(null))
  }
  return { pending, open }
}

export function BrandScopeSelect({ scope, onScope }: { scope: BrandScope; onScope: (s: BrandScope) => void }) {
  const { data: me } = useMe()
  const { pending, open } = useOpenBrand()
  if (!me || !showBrandScope(me)) return null
  return (
    <Select
      value={scope === 'all' ? ALL : me.tenant_id}
      disabled={!!pending}
      onValueChange={(v) => {
        if (v === ALL) onScope('all')
        else if (v === me.tenant_id) onScope(undefined)
        else open(v)
      }}
    >
      <SelectTrigger className="max-w-full min-w-0 max-sm:flex-1" aria-label="Brands shown on Home" data-testid="home-brand-scope">
        {pending ? <Spinner className="size-4" /> : null}
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL} data-testid="home-brand-scope-all">
          All my brands
        </SelectItem>
        <SelectSeparator />
        {me.memberships.map((m) => (
          <SelectItem key={m.tenant_id} value={m.tenant_id}>
            {m.tenant_name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

const COLUMNS: { key: 'live' | 'progress' | 'needsYou' | 'products'; label: string; unit: [string, string] }[] = [
  { key: 'live', label: 'Live', unit: ['live', 'live'] },
  { key: 'progress', label: 'In progress', unit: ['in progress', 'in progress'] },
  { key: 'needsYou', label: 'Needs you', unit: ['needs you', 'need you'] },
  { key: 'products', label: 'Products', unit: ['product', 'products'] },
]

const ROW = 'grid grid-cols-[minmax(0,1fr)] gap-x-4 gap-y-1.5 sm:grid-cols-[minmax(0,1fr)_repeat(4,6.5rem)] sm:items-center'

function ColumnHead({ label, definition }: { label: string; definition: string }) {
  return (
    <span className="flex items-center justify-end gap-1">
      {label}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={`What ${label} counts: ${definition}`}
            className="focus-ring inline-flex size-6 items-center justify-center rounded-full text-ink-3 hover:text-ink-2"
          >
            <Icon name="info" size={14} aria-hidden />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-64">{definition}</TooltipContent>
      </Tooltip>
    </span>
  )
}

function Count({ value, unit, attention }: { value: string; unit: string; attention?: boolean }) {
  return (
    <span className="text-small text-ink-2 sm:text-right">
      <span className={cn('font-semibold tabular-nums text-ink', attention && 'text-attention-ink')}>{value}</span>
      <span className="sm:sr-only"> {unit}</span>
    </span>
  )
}

function BrandRow({ row, pending, onOpen }: { row: BrandRowView; pending: boolean; onOpen: () => void }) {
  const cell = (key: (typeof COLUMNS)[number]['key']) => {
    const col = COLUMNS.find((c) => c.key === key)!
    const value = row[key]
    return <Count key={key} value={value} unit={value === '1' ? col.unit[0] : col.unit[1]} attention={key === 'needsYou' && row.needsYouCount > 0} />
  }
  return (
    <li className="border-b border-line last:border-b-0">
      <button
        type="button"
        onClick={onOpen}
        disabled={pending}
        className={cn(ROW, 'focus-ring tactile w-full rounded-[10px] px-2 py-3 text-left hover:bg-subtle disabled:cursor-progress')}
        aria-label={`${row.name}${row.current ? ', the brand you are in' : ''}: ${row.live} live, ${row.progress} in progress, ${row.needsYou} waiting on you, ${row.products} products. Open its Home.`}
        data-testid="brand-row"
        data-tenant={row.tenantId}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate font-semibold text-ink" data-testid="brand-row-name">
            {row.name}
          </span>
          {row.current ? (
            <Badge variant="brand" className="shrink-0">
              <span className="size-1.5 rounded-full bg-current" aria-hidden />
              Current
            </Badge>
          ) : null}
          <span className="shrink-0 text-caption text-ink-3 capitalize">{row.role}</span>
          {pending ? <Spinner className="size-4 shrink-0" /> : null}
        </span>
        <span className="flex flex-wrap gap-x-3 gap-y-1 sm:contents">
          {cell('live')}
          {cell('progress')}
          {cell('needsYou')}
          {cell('products')}
        </span>
      </button>
    </li>
  )
}

function Frame({ sub, children }: { sub?: ReactNode; children: ReactNode }) {
  return (
    <LaCard data-testid="brands-overview">
      <CardHead title="All my brands" sub={sub} />
      <div className={cn(ROW, 'mt-4 hidden px-2 pb-2 text-caption font-semibold text-ink-3 sm:grid')} aria-hidden>
        <span>Brand</span>
        <ColumnHead label="Live" definition={BRAND_DEFINITION.live} />
        <ColumnHead label="In progress" definition={BRAND_DEFINITION.progress} />
        <ColumnHead label="Needs you" definition={BRAND_DEFINITION.needsYou} />
        <ColumnHead label="Products" definition={BRAND_DEFINITION.products} />
      </div>
      {children}
    </LaCard>
  )
}

export function BrandsOverview({ onScope }: { onScope: (s: BrandScope) => void }) {
  const brands = useHomeBrands(true)
  const { pending, open } = useOpenBrand()
  if (brands.isPending) {
    return (
      <Frame sub={<Skeleton className="h-4 w-40" />}>
        <ul aria-busy className="mt-2 sm:mt-0">
          {[0, 1, 2].map((i) => (
            <li key={i} className="border-b border-line px-2 py-3.5 last:border-b-0">
              <Skeleton className="h-5 w-full max-w-md" />
            </li>
          ))}
        </ul>
      </Frame>
    )
  }
  if (brands.isError) {
    return (
      <LaCard className="py-10" data-testid="brands-overview">
        <ErrorState error={brands.error} title="Couldn't load your brands" onRetry={() => void brands.refetch()} />
      </LaCard>
    )
  }
  const rows = brandRows(brands.data)
  return (
    <Frame sub={<span data-testid="brands-summary">{brandsSummary(brands.data)}</span>}>
      <ul className="mt-2 sm:mt-0">
        {rows.map((row) => (
          <BrandRow key={row.tenantId} row={row} pending={pending === row.tenantId} onOpen={() => (row.current ? onScope(undefined) : open(row.tenantId))} />
        ))}
      </ul>
      <p className="mt-3 px-2 text-caption text-ink-3">Each brand is counted on its own. Open a brand to see its listings and what to do.</p>
    </Frame>
  )
}
