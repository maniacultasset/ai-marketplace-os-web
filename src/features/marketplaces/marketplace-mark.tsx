import { MarketplaceTile } from '@/components/la/marketplace'
import type { Marketplace } from './api'

/** The hi-fi marketplace tile (initial in a 28/36/44 tile). */
export function MarketplaceMark({
  marketplace,
  size = 'md',
  className,
}: {
  marketplace: Marketplace
  size?: 'sm' | 'md' | 'big'
  className?: string
}) {
  return <MarketplaceTile id={marketplace} size={size} className={className} />
}
