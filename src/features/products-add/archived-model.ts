/** The Products "Archived" view's rows (`GET /products?archived=true`). */
import type { Product } from './catalog-model'

export interface ArchivedRow {
  product: Product
  variants: number
}

/**
 * The archived products as rows: a size whose style is in the list is counted on the style's row,
 * never a row of its own. `q` matches the name or SKU, as the main list does.
 */
export function archivedRows(products: readonly Product[], q = ''): ArchivedRow[] {
  const ids = new Set(products.map((p) => p.id))
  const variants = new Map<string, number>()
  for (const p of products)
    if (p.parent_product_id && ids.has(p.parent_product_id)) variants.set(p.parent_product_id, (variants.get(p.parent_product_id) ?? 0) + 1)
  const needle = q.trim().toLowerCase()
  return products
    .filter((p) => !(p.parent_product_id && ids.has(p.parent_product_id)))
    .filter((p) => !needle || p.title.toLowerCase().includes(needle) || p.sku.toLowerCase().includes(needle))
    .map((p) => ({ product: p, variants: variants.get(p.id) ?? 0 }))
}
