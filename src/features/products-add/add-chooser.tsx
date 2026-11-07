/**
 * Add products: choose how (hi-fi p08). Three real routes:
 *   Guided form         → /add/guided (POST /products)
 *   Bulk spreadsheet    → /add/bulk (POST /products/bulk)
 *   Photos and basics   → the guided form opened on its Images section; the agent reads facts
 *                         from the photos when it drafts, and the seller confirms them.
 * Catalog export, product URL and PIM/ERP intake have no API and no V1 value, so they are not shown.
 */
import { useNavigate } from '@tanstack/react-router'
import { useState, type KeyboardEvent } from 'react'
import { Page, PageHeader } from '@/components/app/page-header'
import { Banner, CONCEPT_ICON, FooterBar, IconTile, type IconSource } from '@/components/la'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Marketplace } from './catalog-model'
import { ListOnPicker, serializeListOn, useConnectedMarketplaces } from './list-on'

type RouteId = 'guided' | 'bulk' | 'photos'

interface RouteDef {
  id: RouteId
  icon: IconSource
  title: string
  body: string
}

const ROUTES: readonly RouteDef[] = [
  { id: 'guided', icon: CONCEPT_ICON.guidedForm, title: 'Guided form', body: 'One product at a time. We ask only for what a listing needs.' },
  { id: 'bulk', icon: 'table', title: 'Bulk spreadsheet', body: 'Download the template, fill it in, then upload.' },
  { id: 'photos', icon: 'image', title: 'Photos and basics', body: 'Start with photos, a name and a SKU. The agent reads fabric, colour and more from the photos, and you confirm.' },
]

const LIVE: readonly RouteId[] = ROUTES.map((r) => r.id)

function RouteCard({ def, selected, onSelect }: { def: RouteDef; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      tabIndex={selected ? 0 : -1}
      onClick={onSelect}
      data-testid={`route-${def.id}`}
      className={cn(
        'focus-ring tactile flex cursor-pointer flex-col rounded-card border p-5 text-left',
        selected
          ? 'border-brand bg-brand-bg/40 shadow-selected-inset'
          : 'lift border-line bg-surface shadow-raised-md hover:border-line-strong active:shadow-pressed',
      )}
    >
      <IconTile icon={def.icon} size="lg" tone={selected ? 'brand' : 'neutral'} />
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
  const loadingMarketplaces = listOn === null

  const onKey = (e: KeyboardEvent) => {
    if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) return
    e.preventDefault()
    const step = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1
    const next = LIVE[(LIVE.indexOf(route) + step + LIVE.length) % LIVE.length]!
    setRoute(next)
    ;(e.currentTarget.querySelector(`[data-testid=route-${next}]`) as HTMLElement | null)?.focus()
  }

  const go = () => {
    const on = serializeListOn(listOn ?? [])
    if (route === 'bulk') void navigate({ to: '/add/bulk', search: on ? { on } : {} })
    else void navigate({ to: '/add/guided', search: { ...(on ? { on } : {}), ...(route === 'photos' ? { start: 'photos' as const } : {}) } })
  }

  return (
    <div className="flex min-h-[calc(100svh-56px)] flex-col">
      <Page className="flex-1">
        <PageHeader title="Add products" description="Give us what you have. We ask only for what a listing still needs." />
        <div role="radiogroup" aria-label="How to add products" onKeyDown={onKey} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ROUTES.map((r) => (
            <RouteCard key={r.id} def={r} selected={r.id === route} onSelect={() => setRoute(r.id)} />
          ))}
        </div>
        <Banner tone="info" className="mt-4">
          {route === 'bulk'
            ? 'Rows are matched by seller SKU. A row whose SKU already exists updates that product instead of adding a second one.'
            : 'Each product needs its own seller SKU. A SKU that already exists is refused; the form links you to that product instead.'}
        </Banner>
        <ListOnPicker className="mt-6" value={listOn ?? []} onChange={setListOn} connected={connected} />
      </Page>
      <FooterBar status={loadingMarketplaces ? 'Loading marketplaces…' : 'Nothing is submitted yet. The agent prepares a draft first.'}>
        <Button onClick={go} disabled={loadingMarketplaces} data-testid="add-continue">
          Continue
        </Button>
      </FooterBar>
    </div>
  )
}
