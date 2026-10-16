import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { MARKETPLACE_STATE_META, STATUS_META, type ItemMarketplaceState, type ListingStatus, type MarketplaceState } from './model'

function Dot({ live }: { live?: boolean }) {
  return <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full bg-current', live && 'motion-safe:animate-pulse')} />
}

export function ListingStatusBadge({ status, className }: { status: ListingStatus; className?: string }) {
  const m = STATUS_META[status]
  return (
    <Badge variant={m.tone} className={className} data-testid="listing-status" data-status={status}>
      <Dot live={status === 'generating' || status === 'publishing'} />
      {m.label}
    </Badge>
  )
}

export function MarketplaceStateBadge({ state }: { state: MarketplaceState | ItemMarketplaceState }) {
  const m = MARKETPLACE_STATE_META[state]
  return (
    <Badge variant={m.tone} data-state={state}>
      <Dot live={state === 'processing'} />
      {m.label}
    </Badge>
  )
}
