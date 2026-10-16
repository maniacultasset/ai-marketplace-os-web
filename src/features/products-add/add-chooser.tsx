/**
 * Add products: choose how (hi-fi p08). Guided form (→ /add/guided, POST /products) and Bulk
 * spreadsheet (→ /add/bulk, POST /products/bulk) are real. Photos, catalog export and product URL
 * intake have no API yet (no `POST /intakes`), so their cards say "Coming soon" with the reason;
 * PIM or ERP is "Later", as designed.
 */
import { useNavigate } from '@tanstack/react-router'
import { useState, type KeyboardEvent } from 'react'
import { Page, PageHeader } from '@/components/app/page-header'
import { Banner, ComingSoon, FooterBar, Icon, NOT_YET, TagChip, type IconName } from '@/components/la'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { Marketplace } from './catalog-model'
import { ListOnPicker, serializeListOn, useConnectedMarketplaces } from './list-on'

type RouteId = 'guided' | 'bulk'

interface RouteDef {
  id: RouteId | 'photos' | 'catalog' | 'url' | 'pim'
  icon: IconName
  title: string
  body: string
  /** Why it is not available (cards without a route). */
  reason?: string
  later?: boolean
}

const ROUTES: readonly RouteDef[] = [
  { id: 'guided', icon: 'file', title: 'Guided form', body: 'One product at a time. We ask only for what a listing needs.' },
  { id: 'bulk', icon: 'table', title: 'Bulk spreadsheet', body: 'Download the template, fill it in, then upload.' },
  { id: 'photos', icon: 'image', title: 'Photos and basics', body: 'Upload images plus a name and price. We read the rest.', reason: NOT_YET.intakePhotos },
  { id: 'catalog', icon: 'upload', title: 'Catalog export', body: 'Upload a file from another marketplace or store.', reason: NOT_YET.intakeCatalog },
  { id: 'url', icon: 'link', title: 'Product page URL', body: 'Paste your own website’s product link.', reason: NOT_YET.intakeUrl },
  { id: 'pim', icon: 'grid', title: 'PIM or ERP', body: 'Connect a system of record. Not in V1.', reason: NOT_YET.pim, later: true },
]

const LIVE: readonly RouteId[] = ['guided', 'bulk']

function RouteCard({ def, selected, onSelect }: { def: RouteDef; selected: boolean; onSelect?: () => void }) {
  const tile = (
    <span
      className={cn(
        'inline-flex size-11 items-center justify-center rounded-[10px]',
        selected ? 'bg-brand-bg text-brand' : def.reason ? 'bg-subtle text-ink-3' : 'bg-subtle text-ink-2',
      )}
    >
      <Icon name={def.icon} size={22} />
    </span>
  )
  if (def.reason) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            tabIndex={0}
            aria-disabled
            aria-label={`${def.title}: ${def.reason}`}
            className={cn(
              'focus-ring flex cursor-not-allowed flex-col rounded-card border p-5',
              def.later ? 'border-dashed border-line-strong bg-transparent' : 'border-line bg-surface shadow-sm',
            )}
          >
            {tile}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <h3 className={cn('text-h3', def.later ? 'text-ink-2' : 'text-ink')}>{def.title}</h3>
              {def.later ? <TagChip tone="plain">Later</TagChip> : <ComingSoon />}
            </div>
            <p className="mt-1 text-small text-ink-2">{def.body}</p>
          </div>
        </TooltipTrigger>
        <TooltipContent>{def.reason}</TooltipContent>
      </Tooltip>
    )
  }
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      tabIndex={selected ? 0 : -1}
      onClick={onSelect}
      data-testid={`route-${def.id}`}
      className={cn(
        'focus-ring flex cursor-pointer flex-col rounded-card border bg-surface p-5 text-left transition-[border-color,box-shadow] duration-150',
        selected ? 'border-brand shadow-selected' : 'border-line shadow-sm hover:border-line-strong',
      )}
    >
      {tile}
      <h3 className="mt-3 text-h3 text-ink">{def.title}</h3>
      <p className="mt-1 text-small text-ink-2">{def.body}</p>
    </button>
  )
}

export function AddChooser() {
  const navigate = useNavigate()
  const [route, setRoute] = useState<RouteId>('guided')
  const { connected } = useConnectedMarketplaces()
  // Connected marketplaces are pre-selected until the person changes the choice.
  const [picked, setListOn] = useState<Marketplace[] | null>(null)
  const listOn = picked ?? connected

  const onKey = (e: KeyboardEvent) => {
    if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) return
    e.preventDefault()
    const next = LIVE[(LIVE.indexOf(route) + 1) % LIVE.length]!
    setRoute(next)
    ;(e.currentTarget.querySelector(`[data-testid=route-${next}]`) as HTMLElement | null)?.focus()
  }

  const go = () => {
    const on = serializeListOn(listOn ?? [])
    void navigate({ to: route === 'guided' ? '/add/guided' : '/add/bulk', search: on ? { on } : {} })
  }

  return (
    <div className="flex min-h-[calc(100svh-56px)] flex-col">
      <Page className="flex-1">
        <PageHeader title="Add products" description="Give us what you have. We ask only for what a listing still needs." />
        <div role="radiogroup" aria-label="How to add products" onKeyDown={onKey} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ROUTES.map((r) => (
            <RouteCard key={r.id} def={r} selected={r.id === route} onSelect={LIVE.includes(r.id as RouteId) ? () => setRoute(r.id as RouteId) : undefined} />
          ))}
        </div>
        <Banner tone="info" icon="spark" className="mt-4">
          {route === 'bulk'
            ? 'Rows are matched by seller SKU. A row whose SKU already exists updates that product instead of adding a second one.'
            : 'Each product needs its own seller SKU. A SKU that already exists is refused; the form links you to that product instead.'}
        </Banner>
        <ListOnPicker className="mt-6" value={listOn ?? []} onChange={setListOn} connected={connected} />
      </Page>
      <FooterBar status="Nothing is submitted yet. The agent prepares a draft first.">
        <Button onClick={go} data-testid="add-continue">
          Continue
        </Button>
      </FooterBar>
    </div>
  )
}
