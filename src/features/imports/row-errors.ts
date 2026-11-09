/**
 * Import row errors in the seller's words. The backend's row messages are written for developers
 * and name CSV column keys ("selling_price is above mrp"); the API and the full report keep them.
 * Here they read as plain sentences, and warnings (for example "no image URL") are not problems.
 */
import { sentenceCase } from '@/features/listing-flow/format'

type RowError = { error_code: string; message: string; severity?: string | null }

const ACRONYM: Record<string, string> = { mrp: 'MRP', sku: 'SKU', hsn: 'HSN', gtin: 'GTIN', ean: 'EAN', upc: 'UPC', url: 'URL', urls: 'URLs', id: 'ID' }

const COLUMN_WORDS: Record<string, string> = {
  seller_sku: 'SKU',
  parent_style_id: 'style',
  product_identifier: 'barcode',
  product_name: 'product name',
  country_of_origin: 'country of origin',
}

/** "selling_price" → "selling price", "mrp" → "MRP". */
function words(text: string): string {
  return text
    .replace(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g, (k) => COLUMN_WORDS[k] ?? k.replace(/_/g, ' '))
    .replace(/\b(mrp|sku|hsn|gtin|ean|upc|urls?|id)\b/gi, (w) => ACRONYM[w.toLowerCase()] ?? w)
}

const KNOWN: { test: (e: RowError) => boolean; text: string }[] = [
  { test: (e) => e.error_code === 'PRICE_ABOVE_MRP', text: 'Selling price is above the MRP.' },
  { test: (e) => /^country_of_origin\b/.test(e.message), text: 'Country of origin: use a two-letter code like IN.' },
  { test: (e) => /^(?:barcode|product_identifier)\b.*\b8, 12, 13 or 14 digits/.test(e.message), text: 'Barcode must be 8, 12, 13 or 14 digits.' },
  { test: (e) => /family needs size_name or color_name/.test(e.message), text: 'Each size or colour in a style needs a size or colour name.' },
  { test: (e) => /^product_name differs from the rest of its parent_style_id family/.test(e.message), text: 'Product name must match the rest of its style.' },
  { test: (e) => /^package_weight needs a unit/.test(e.message), text: 'Package weight needs a unit (450 g or 0.45 kg), or use the package_weight_g column for whole grams.' },
]

/** A row error as a plain sentence. */
export function plainRowError(e: RowError): string {
  return KNOWN.find((k) => k.test(e))?.text ?? sentenceCase(words(e.message))
}

/** The row's problems only: warnings are left out. */
export function rowProblems<E extends RowError>(errors: readonly E[] | null | undefined): E[] {
  return (errors ?? []).filter((e) => e.severity !== 'warning')
}
