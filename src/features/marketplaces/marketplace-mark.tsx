import { cn } from '@/lib/utils'
import type { Marketplace } from './api'
import { MARKETPLACE_META } from './meta'

const SIZES = {
  sm: 'size-6 rounded-md [&>svg]:size-3.5',
  md: 'size-10 rounded-xl [&>svg]:size-5',
} as const

/** Drawn icon in the marketplace's tinted tile (no letters, no third-party logos). */
export function MarketplaceMark({
  marketplace,
  size = 'md',
  className,
}: {
  marketplace: Marketplace
  size?: keyof typeof SIZES
  className?: string
}) {
  const m = MARKETPLACE_META[marketplace]
  const Icon = m.icon
  return (
    <span
      aria-hidden
      className={cn('inline-flex shrink-0 items-center justify-center ring-1 ring-inset select-none', SIZES[size], m.tileClass, className)}
    >
      <Icon strokeWidth={1.75} />
    </span>
  )
}
