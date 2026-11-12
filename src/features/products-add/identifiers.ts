/**
 * Which identifier is Kuinn's own and which one a marketplace receives (client feedback 11 Nov,
 * item 3). One short line per identifier, used as the field hints and in the small "Which IDs go
 * to the marketplace" disclosure. What is sent, from the backend adapters:
 *   SKU          → Amazon and Flipkart seller SKU (`listing_items.seller_sku`)
 *   style number → Amazon model number and part number; Flipkart style code (else the style's SKU)
 *   variant SKU  → that child's seller SKU on both marketplaces
 *   barcode      → Amazon's product ID (EAN, UPC or GTIN), or the exemption
 *   product ID   → never sent: Kuinn's own reference (the URL and support)
 */
export const ID_HINT = {
  productId: 'Kuinn’s own reference. Never sent to a marketplace.',
  sku: 'Sent to Amazon and Flipkart as the seller SKU.',
  styleNumber: 'Sent to Amazon as the model and part number, and to Flipkart as the style code.',
  variantSku: 'Each size or colour’s own SKU. Sent as that variant’s seller SKU.',
  barcode: 'Sent to Amazon as the product ID (EAN, UPC or GTIN).',
} as const

export interface IdRow {
  key: keyof typeof ID_HINT
  name: string
  value?: string | null
}

const ROWS: readonly IdRow[] = [
  { key: 'productId', name: 'Product ID' },
  { key: 'sku', name: 'SKU' },
  { key: 'styleNumber', name: 'Style number' },
  { key: 'variantSku', name: 'Variant SKUs' },
  { key: 'barcode', name: 'Barcode' },
]

/** The rows to show, with the product's own values when given (pure). Variants have no style number or variant SKUs of their own. */
export function idRows(values: Partial<Record<IdRow['key'], string | null>> = {}, opts: { variant?: boolean } = {}): IdRow[] {
  return ROWS.filter((r) => !(opts.variant && (r.key === 'styleNumber' || r.key === 'variantSku'))).map((r) => ({ ...r, value: values[r.key] ?? null }))
}
