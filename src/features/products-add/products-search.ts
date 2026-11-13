/**
 * The Products filters in the URL (`/products?status=needs-you&marketplace=amazon`), so Home and
 * other screens can link to a filtered list and a filtered view survives reload and Back.
 * A bad value is dropped (`.catch`), never an error page.
 */
import { z } from 'zod'
import { BUCKETS, LISTING_FILTERS, type Bucket, type ListingFilter, type Marketplace } from './catalog-model'

/** `archived` is the Archived view (`GET /products?archived=true`), not a listing bucket. */
const STATUS_VALUES = [...BUCKETS.map((b) => b.value), 'archived'] as unknown as [Bucket | 'archived', ...(Bucket | 'archived')[]]
const LISTING_VALUES = Object.keys(LISTING_FILTERS) as [ListingFilter, ...ListingFilter[]]

export const productsSearchSchema = z.object({
  /** The overall status bucket, or `archived` (the archived products); absent is All. */
  status: z.enum(STATUS_VALUES).optional().catch(undefined),
  /** Rows with a listing in this Home bucket (`catalog-model` `listingBucket`): what a Home tile opens. */
  listing: z.enum(LISTING_VALUES).optional().catch(undefined),
  /** Rows with a listing on this marketplace. */
  marketplace: z.enum(['amazon', 'flipkart'] satisfies Marketplace[]).optional().catch(undefined),
  /** A category slug, as the products carry it. */
  category: z
    .string()
    .regex(/^[a-z0-9_]{1,64}$/)
    .optional()
    .catch(undefined),
  /** Name or SKU search over the loaded products. */
  q: z.string().max(200).optional().catch(undefined),
})
export type ProductsSearch = z.infer<typeof productsSearchSchema>

/** The search with empty values dropped, so the URL stays short ("All" is no `status`). */
export function cleanProductsSearch(s: ProductsSearch): ProductsSearch {
  const out: ProductsSearch = {}
  if (s.status) out.status = s.status
  if (s.listing) out.listing = s.listing
  if (s.marketplace) out.marketplace = s.marketplace
  if (s.category) out.category = s.category
  if (s.q && s.q.trim() !== '') out.q = s.q
  return out
}
