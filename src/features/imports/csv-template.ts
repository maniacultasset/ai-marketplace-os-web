/**
 * CSV columns accepted by POST /products/bulk (backend
 * services/imports/headers.py). Used to build the downloadable template client-side.
 */

/** Hard limit of the whole multipart request (10 MiB). */
export const MAX_REQUEST_BYTES = 10 * 1024 * 1024
/** Leave room for the multipart envelope (boundary, part headers). */
export const MAX_FILE_BYTES = MAX_REQUEST_BYTES - 4 * 1024
export const MAX_IMPORT_ROWS = 10_000

export const REQUIRED_COLUMNS = ['seller_sku', 'product_name', 'category'] as const

export interface ColumnGroup {
  label: string
  columns: readonly string[]
  /** Accepted in the header but not stored; non-blank cells produce a warning. */
  notStored?: boolean
}

export const COLUMN_GROUPS: readonly ColumnGroup[] = [
  {
    label: 'Identity',
    columns: [
      'seller_sku',
      'parent_style_id',
      'product_name',
      'brand_name',
      'manufacturer_name',
      'manufacturer_address',
      'product_identifier_type',
      'product_identifier',
    ],
  },
  { label: 'Classification', columns: ['gender', 'category', 'sub_category', 'product_type'] },
  {
    label: 'Attributes',
    columns: [
      'color_name',
      'normalized_color',
      'size_name',
      'normalized_size',
      'size_system',
      'fit',
      'pattern',
      'fabric_type',
      'fiber_composition',
      'lining',
      'stretch',
      'neckline',
      'collar_type',
      'sleeve_type',
      'sleeve_length',
      'garment_length',
      'rise',
      'leg_style',
      'closure',
      'pocket_type',
      'occasion',
      'season',
    ],
  },
  { label: 'Care', columns: ['wash_care', 'iron_care'] },
  {
    label: 'Compliance',
    columns: ['country_of_origin', 'mrp', 'consumer_care_email', 'consumer_care_phone', 'hsn_code'],
  },
  {
    label: 'Commercial',
    columns: [
      'selling_price',
      'tax_rate',
      'package_weight',
      'package_length_cm',
      'package_breadth_cm',
      'package_height_cm',
    ],
  },
  { label: 'Media', columns: ['main_image', 'additional_images', 'size_chart'] },
  {
    label: 'Content',
    // `bullet_1_to_n` is the BRD name; one column per bullet (`bullet_1` … `bullet_99`) also works.
    columns: ['title', 'bullet_1_to_n', 'bullet_1 … bullet_99', 'description', 'keywords'],
    notStored: true,
  },
  {
    label: 'Marketplace',
    columns: [
      'marketplace_category',
      'marketplace_product_type',
      'marketplace_sku',
      'marketplace_listing_id',
      'marketplace_status',
      'live_url',
    ],
    notStored: true,
  },
  {
    label: 'Workflow',
    columns: ['overall_status', 'open_issue_count', 'human_action_required', 'last_updated'],
    notStored: true,
  },
]

/** Alternative header names and the column they fill (backend headers.py ALIASES). */
export const COLUMN_ALIASES: readonly { alias: string; column: string; note?: string }[] = [
  { alias: 'parent_sku', column: 'parent_style_id' },
  { alias: 'mrp_inr', column: 'mrp' },
  { alias: 'price_inr', column: 'selling_price' },
  { alias: 'weight_grams', column: 'package_weight', note: 'bare grams' },
  { alias: 'package_weight_g', column: 'package_weight', note: 'bare grams' },
]

/** Header for the minimal template: required columns + one image column. */
export const MINIMAL_HEADER = [...REQUIRED_COLUMNS, 'main_image'] as const

/** Header for the full template: every stored column, in the documented order. */
export const FULL_HEADER = COLUMN_GROUPS.filter((g) => !g.notStored).flatMap((g) => g.columns)

/** Trigger a browser download of a CSV with only a header line. */
export function downloadTemplate(kind: 'minimal' | 'full') {
  const header = kind === 'minimal' ? MINIMAL_HEADER : FULL_HEADER
  const blob = new Blob([`${header.join(',')}\r\n`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = kind === 'minimal' ? 'products-template.csv' : 'products-template-all-columns.csv'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}
