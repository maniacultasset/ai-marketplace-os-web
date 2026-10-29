/**
 * Marketplace identity and cells (hi-fi Components → Variant cell and marketplace cell).
 * - MarketplaceTile: 36px (44 "big") tile with the marketplace initial, display font, each in its
 *   own letter colour (`--mp-*`) so A/A and M/M read apart. The hi-fi says to use marketplace-provided
 *   logos in production; until we hold licensed assets we keep the designed initial tile.
 *   Unsupported marketplaces get a flat tile with a grey letter (the card around it is dashed).
 * - MarketplaceCell: icon-only status chip, then the listing id in 12px ink-3 (Products table).
 * - VariantCell: 34px matrix cell; unavailable combinations are dashed and stay in the data.
 *
 * MARKETPLACES lists every marketplace the design shows. Only `supported` ones exist in the API
 * (`Marketplace` enum: amazon | flipkart); the rest render honest "Join waitlist"/"Not available"
 * states and never a live control.
 */
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import type { Schema } from '@/api/types'
import { CHIP_META, CHIP_TONE, Glyph, StatusChip, type ChipStatus } from './status-chip'

export type ApiMarketplace = Schema<'Marketplace'>
export type MarketplaceId = ApiMarketplace | 'myntra' | 'ajio' | 'meesho' | 'nykaa'

export interface MarketplaceInfo {
  id: MarketplaceId
  name: string
  short: string
  initial: string
  /** Monogram letter colour (a `--mp-*` token), so A/A and M/M tiles read apart. */
  color: string
  /** In the API contract (connect, listings, rules). */
  supported: boolean
}

export const MARKETPLACES: readonly MarketplaceInfo[] = [
  { id: 'amazon', name: 'Amazon', short: 'Amazon', initial: 'A', color: 'var(--mp-amazon)', supported: true },
  { id: 'flipkart', name: 'Flipkart', short: 'Flipkart', initial: 'F', color: 'var(--mp-flipkart)', supported: true },
  { id: 'myntra', name: 'Myntra', short: 'Myntra', initial: 'M', color: 'var(--mp-myntra)', supported: false },
  { id: 'ajio', name: 'AJIO', short: 'AJIO', initial: 'A', color: 'var(--mp-ajio)', supported: false },
  { id: 'meesho', name: 'Meesho', short: 'Meesho', initial: 'M', color: 'var(--mp-meesho)', supported: false },
  { id: 'nykaa', name: 'Nykaa Fashion', short: 'Nykaa', initial: 'N', color: 'var(--mp-nykaa)', supported: false },
]

export const SUPPORTED_MARKETPLACES = MARKETPLACES.filter((m) => m.supported)

export function marketplaceInfo(id: MarketplaceId): MarketplaceInfo {
  return MARKETPLACES.find((m) => m.id === id)!
}

export function MarketplaceTile({
  id,
  size = 'md',
  unavailable,
  className,
}: {
  id: MarketplaceId
  /** xs 24 (inline in dense example rows), sm 28, md 36, big 44. */
  size?: 'xs' | 'sm' | 'md' | 'big'
  /** Not available to connect: flat, solid hairline, grey letter. The card or chip around it
   *  carries the dashed edge, so the tile never doubles it. Defaults to "not in the API". */
  unavailable?: boolean
  className?: string
}) {
  const m = marketplaceInfo(id)
  // A marketplace you cannot pick keeps a grey letter, so it never out-colours the ones you can.
  const muted = unavailable ?? !m.supported
  return (
    <span
      aria-hidden
      data-slot="monogram-tile"
      data-marketplace={m.id}
      style={muted ? undefined : { color: m.color }}
      className={cn(
        'inline-flex shrink-0 items-center justify-center border border-line bg-surface font-display font-bold shadow-raised-sm',
        muted && 'bg-subtle text-ink-3 shadow-none',
        size === 'xs' && 'size-6 rounded-md text-[11px]',
        size === 'sm' && 'size-7 rounded-lg text-[13px]',
        size === 'md' && 'size-9 rounded-tile text-[15px]',
        size === 'big' && 'size-11 rounded-xl text-[18px]',
        className,
      )}
    >
      {m.initial}
    </span>
  )
}

/** Tile + name, the standard way to name a marketplace in a row or card header. */
export function MarketplaceName({ id, size, className }: { id: MarketplaceId; size?: 'xs' | 'sm' | 'md' | 'big'; className?: string }) {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-3 font-semibold text-ink', className)}>
      <MarketplaceTile id={id} size={size} />
      <span className="truncate">{marketplaceInfo(id).name}</span>
    </span>
  )
}

export function MarketplaceCell({
  status,
  label,
  sub,
  className,
}: {
  status: ChipStatus
  /** Accessible name, e.g. "Amazon: Live". */
  label: string
  /** Small text under the chip: the listing id, "attempt 3", "task". */
  sub?: ReactNode
  className?: string
}) {
  return (
    <span className={cn('inline-flex w-14 flex-col items-center gap-0.5', className)}>
      <StatusChip status={status} iconOnly label={label} />
      {sub ? <span className="max-w-full truncate text-caption font-normal text-ink-3">{sub}</span> : null}
    </span>
  )
}

export function VariantCell({
  status,
  children,
  unavailable,
  label,
  onToggle,
  className,
}: {
  /** Status glyph mode (product detail matrix). */
  status?: ChipStatus
  /** Text mode (variant SKU in the setup matrix). */
  children?: ReactNode
  /** "not made": dashed, stays in the data. */
  unavailable?: boolean
  label?: string
  onToggle?: () => void
  className?: string
}) {
  const tone = status ? CHIP_TONE[CHIP_META[status].tone] : 'border-line-strong bg-surface text-ink'
  const cls = cn(
    'flex h-[34px] min-w-0 items-center justify-center rounded-lg border px-2 text-caption font-semibold',
    unavailable ? 'border-dashed border-line-strong bg-subtle font-medium text-ink-3' : tone,
    onToggle && 'focus-ring cursor-pointer',
    className,
  )
  const body = unavailable ? 'not made' : status ? <Glyph status={status} className="text-[12px]" /> : children
  const name = label ?? (status ? CHIP_META[status].label : undefined)
  if (onToggle) {
    return (
      <button type="button" className={cls} aria-pressed={!unavailable} aria-label={name} onClick={onToggle}>
        {body}
      </button>
    )
  }
  return (
    <span className={cls} role={status ? 'img' : undefined} aria-label={name}>
      {body}
    </span>
  )
}
