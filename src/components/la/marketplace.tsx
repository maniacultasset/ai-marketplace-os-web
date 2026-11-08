/**
 * Marketplace identity and cells (hi-fi Components → Variant cell and marketplace cell).
 * - MarketplaceTile: 36px (44 "big") raised tile holding the marketplace's own square icon, as the
 *   hi-fi asks for production. The icons come from each marketplace's site (src/assets/marketplaces,
 *   128px, bundled: no remote image loads). The image is decorative; the name beside it is the
 *   label. Unsupported marketplaces get a flat tile with a softened icon (the card around it is
 *   dashed), so they never out-shout the ones you can connect.
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
import ajioLogo from '@/assets/marketplaces/ajio.png'
import amazonLogo from '@/assets/marketplaces/amazon.png'
import flipkartLogo from '@/assets/marketplaces/flipkart.png'
import meeshoLogo from '@/assets/marketplaces/meesho.png'
import myntraLogo from '@/assets/marketplaces/myntra.png'
import nykaaLogo from '@/assets/marketplaces/nykaa.png'

export type ApiMarketplace = Schema<'Marketplace'>
export type MarketplaceId = ApiMarketplace | 'myntra' | 'ajio' | 'meesho' | 'nykaa'

export interface MarketplaceInfo {
  id: MarketplaceId
  name: string
  short: string
  initial: string
  /** Monogram letter colour (a `--mp-*` token), so A/A and M/M tiles read apart. */
  color: string
  /** The marketplace's square icon (bundled asset URL). */
  logo: string
  /** In the API contract (connect, listings, rules). */
  supported: boolean
}

export const MARKETPLACES: readonly MarketplaceInfo[] = [
  { id: 'amazon', name: 'Amazon', short: 'Amazon', initial: 'A', color: 'var(--mp-amazon)', logo: amazonLogo, supported: true },
  { id: 'flipkart', name: 'Flipkart', short: 'Flipkart', initial: 'F', color: 'var(--mp-flipkart)', logo: flipkartLogo, supported: true },
  { id: 'myntra', name: 'Myntra', short: 'Myntra', initial: 'M', color: 'var(--mp-myntra)', logo: myntraLogo, supported: false },
  { id: 'ajio', name: 'AJIO', short: 'AJIO', initial: 'A', color: 'var(--mp-ajio)', logo: ajioLogo, supported: false },
  { id: 'meesho', name: 'Meesho', short: 'Meesho', initial: 'M', color: 'var(--mp-meesho)', logo: meeshoLogo, supported: false },
  { id: 'nykaa', name: 'Nykaa Fashion', short: 'Nykaa', initial: 'N', color: 'var(--mp-nykaa)', logo: nykaaLogo, supported: false },
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
  /** xs 24 (inline in dense example rows), sm 28, md 36, big 44, xl 64 (the landing's call-to-action
   *  lockup). The icons are 128px, so 64 CSS px is the largest size that stays sharp: never larger. */
  size?: 'xs' | 'sm' | 'md' | 'big' | 'xl'
  /** Not available to connect: flat, solid hairline, softened icon. The card or chip around it
   *  carries the dashed edge, so the tile never doubles it. Defaults to "not in the API". */
  unavailable?: boolean
  className?: string
}) {
  const m = marketplaceInfo(id)
  // A marketplace you cannot pick sits flat and softened, so it never out-colours the ones you can.
  const muted = unavailable ?? !m.supported
  return (
    <span
      aria-hidden
      data-slot="marketplace-tile"
      data-marketplace={m.id}
      data-muted={muted || undefined}
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden border border-line bg-surface shadow-raised-sm',
        muted && 'shadow-none',
        size === 'xs' && 'size-6 rounded-md',
        size === 'sm' && 'size-7 rounded-lg',
        size === 'md' && 'size-9 rounded-tile',
        size === 'big' && 'size-11 rounded-xl',
        size === 'xl' && 'size-16 rounded-card',
        className,
      )}
    >
      <img
        src={m.logo}
        alt=""
        width={128}
        height={128}
        decoding="async"
        draggable={false}
        className={cn('size-full object-cover', muted && 'opacity-60 saturate-50')}
      />
    </span>
  )
}

/** Tile + name, the standard way to name a marketplace in a row or card header. */
export function MarketplaceName({ id, size, className }: { id: MarketplaceId; size?: 'xs' | 'sm' | 'md' | 'big' | 'xl'; className?: string }) {
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
