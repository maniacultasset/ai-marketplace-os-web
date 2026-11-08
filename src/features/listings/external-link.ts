/**
 * The marketplace's own page for a listing (SI9 `external_id`, the Amazon ASIN). Prefers the
 * backend's `live_url`; for Amazon without one, the product page is built from the ASIN. Null
 * until the marketplace has read the product, or when the field is absent (older backend).
 */
import { externalIdFromUrl } from '@/features/listing-flow/proof'

const ASIN = /^[A-Z0-9]{10}$/

export interface MarketplaceLink {
  href: string
  /** "ASIN B0C9X12345" (Amazon) or the plain id. */
  idLabel: string | null
}

export function marketplaceLink(l: {
  marketplace: string
  live_url?: string | null
  external_id?: string | null
}): MarketplaceLink | null {
  const id = (l.external_id ?? '').trim() || externalIdFromUrl(l.live_url) || null
  const label = id ? (l.marketplace === 'amazon' ? `ASIN ${id}` : id) : null
  if (l.live_url) return { href: l.live_url, idLabel: label }
  if (l.marketplace === 'amazon' && id && ASIN.test(id)) return { href: `https://www.amazon.in/dp/${id}`, idLabel: label }
  return null
}
