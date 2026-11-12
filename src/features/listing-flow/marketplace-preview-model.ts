/**
 * "Preview on Amazon / Flipkart" (client feedback item 16, bullet 5): the complete listing laid out
 * the way the marketplace's product page shows it. Pure: everything comes from the listing's
 * current version (title, bullets, description, attributes, image order) and the product read
 * (signed photo views, price and MRP, sizes, colours, brand). Nothing is fetched or sent, and the
 * page says it is an approximation.
 */
import type { ListingDetail } from '@/features/listings/model'
import type { Product } from '@/features/products/api'
import { viewsById } from '@/features/products/image-views'
import { discountPercent, formatMoney } from '@/features/products/intake-model'
import { attributeLabel, attributeText, type AttributeValue } from './sections-model'

export interface PreviewPhoto {
  id: string
  src: string
  main: boolean
}

export interface PreviewModel {
  title: string
  brand: string | null
  photos: PreviewPhoto[]
  /** Images on the listing whose view the product read does not carry (not checked yet). */
  photosMissing: number
  price: string | null
  mrp: string | null
  discount: number | null
  sizes: string[]
  colours: string[]
  /** A variant's own axis values, picked already ("Size: M"). */
  picked: Record<string, string>
  bullets: string[]
  description: string
  details: [label: string, value: string][]
  searchTerms: number
}

/** The listing's images in marketplace order: the main photo first, then by position. */
export function galleryOrder<T extends { slot?: string | null; position?: number | null }>(images: readonly T[]): T[] {
  return [...images].sort((a, b) => Number(b.slot === 'main') - Number(a.slot === 'main') || (a.position ?? 0) - (b.position ?? 0))
}

export function previewModel(listing: Pick<ListingDetail, 'content'>, product: Product | null | undefined): PreviewModel {
  const canonical = listing.content!
  const views = viewsById(product)
  const refs = galleryOrder(canonical.images ?? [])
  const photos: PreviewPhoto[] = []
  for (const ref of refs) {
    const src = views.get(ref.image_id)
    if (src) photos.push({ id: ref.image_id, src, main: ref.slot === 'main' })
  }
  const attributes = (canonical.attributes ?? {}) as Record<string, AttributeValue>
  const details: [string, string][] = []
  // The listing's own attribute wins over the product's copy, so a row is never shown twice.
  if (product?.brand_name && !('brand' in attributes)) details.push(['Brand', product.brand_name])
  for (const key of Object.keys(attributes).sort()) details.push([attributeLabel(key), attributeText(attributes[key]!)])
  if (product?.country_of_origin && !('country_of_origin' in attributes)) details.push(['Country of origin', product.country_of_origin])
  const price = formatMoney(product?.selling_price)
  const mrp = formatMoney(product?.mrp)
  const discount = product?.selling_price && product?.mrp ? discountPercent(product.selling_price, product.mrp) : null
  const picked: Record<string, string> = {}
  for (const [axis, value] of Object.entries(product?.variant_attributes ?? {})) if (value) picked[axis] = value
  const keywords = canonical.keywords
  return {
    title: canonical.content.title,
    brand: product?.brand_name ?? null,
    photos,
    photosMissing: refs.length - photos.length,
    price,
    // An MRP equal to the price is not shown as a strike-through.
    mrp: mrp && mrp !== price ? mrp : null,
    discount,
    sizes: [...(product?.size_run ?? [])],
    colours: (product?.colourways ?? []).map((c) => c.colour).filter(Boolean),
    picked,
    bullets: [...canonical.content.bullets],
    description: canonical.content.description,
    details,
    searchTerms: (keywords?.search_terms?.length ?? 0) + (keywords?.hidden_terms?.length ?? 0),
  }
}
