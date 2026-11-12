/**
 * Seller Central links the web may open, by the backend's rule (adapters/amazon/precheck.py
 * `allowed_link`, ADR-0028 CP-D13): https, at most 2048 characters, the exact Seller Central host,
 * no user info, no port. Kuinn sells on Amazon India, so only `sellercentral.amazon.in` is allowed.
 */
const SELLER_CENTRAL_HOSTS: ReadonlySet<string> = new Set(['sellercentral.amazon.in'])

/** True only for an https Seller Central India link with no user info and no port. */
export function isSellerCentralLink(href: string): boolean {
  if (href.length > 2048) return false
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return false
  }
  return url.protocol === 'https:' && SELLER_CENTRAL_HOSTS.has(url.hostname) && !url.username && !url.password && !url.port
}
