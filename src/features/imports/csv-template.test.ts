/**
 * The bulk CSV header list must match the backend's (apps/api/app/services/imports/headers.py).
 *
 * `BACKEND` is a copy of that file's lists, taken at backend main 751863f. The first block checks
 * the FE template against it. The second block re-reads headers.py itself when a backend checkout
 * is given (`BACKEND_DIR` or `E2E_BACKEND_DIR`), so a backend change that is not copied here fails
 * locally: run `BACKEND_DIR=../ai-marketplace-os pnpm test csv-template`.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { analyzeCsv, analyzeHeader } from '@/features/products-add/csv-header'
import { COLUMN_ALIASES, COLUMN_GROUPS, FULL_HEADER, MINIMAL_HEADER, PHOTO_LINK_COLUMNS, REQUIRED_COLUMNS } from './csv-template'

const BACKEND = {
  a6: [
    'seller_sku', 'parent_style_id', 'product_name', 'brand_name', 'manufacturer_name', 'manufacturer_address',
    'product_identifier_type', 'product_identifier', 'gender', 'category', 'sub_category', 'product_type', 'color_name',
    'normalized_color', 'size_name', 'normalized_size', 'size_system', 'fit', 'pattern', 'fabric_type', 'fiber_composition',
    'lining', 'stretch', 'neckline', 'collar_type', 'sleeve_type', 'sleeve_length', 'garment_length', 'rise', 'leg_style',
    'closure', 'pocket_type', 'occasion', 'season', 'wash_care', 'iron_care', 'country_of_origin', 'mrp',
    'consumer_care_email', 'consumer_care_phone', 'hsn_code', 'selling_price', 'tax_rate', 'package_weight',
    'package_length_cm', 'package_breadth_cm', 'package_height_cm', 'main_image', 'additional_images', 'size_chart',
    'title', 'bullet_1_to_n', 'description', 'keywords', 'marketplace_category', 'marketplace_product_type',
    'marketplace_sku', 'marketplace_listing_id', 'marketplace_status', 'live_url', 'overall_status', 'open_issue_count',
    'human_action_required', 'last_updated',
  ],
  extension: ['style_number'],
  aliases: {
    parent_sku: 'parent_style_id',
    mrp_inr: 'mrp',
    price_inr: 'selling_price',
    weight_grams: 'package_weight_g',
    package_weight_g: 'package_weight_g',
    fabric_composition: 'fiber_composition',
  } as Record<string, string>,
  required: ['seller_sku', 'product_name', 'category'],
  ignored: [
    'title', 'bullet_1_to_n', 'description', 'keywords', 'marketplace_category', 'marketplace_product_type',
    'marketplace_sku', 'marketplace_listing_id', 'marketplace_status', 'live_url', 'overall_status', 'open_issue_count',
    'human_action_required', 'last_updated',
  ],
}

/** headers.py names `package_weight_g` internally; the FE shows the A.6 column it fills. */
const shown = (column: string) => (column === 'package_weight_g' ? 'package_weight' : column)
/** FE group columns minus the display-only "bullet_1 … bullet_99" entry. */
const names = (groups: typeof COLUMN_GROUPS) => groups.flatMap((g) => g.columns).filter((c) => /^[a-z0-9_]+$/.test(c))

describe('bulk CSV header list matches backend headers.py', () => {
  it('lists every column the backend accepts, and nothing else', () => {
    expect(new Set(names(COLUMN_GROUPS))).toEqual(new Set([...BACKEND.a6, ...BACKEND.extension]))
    expect(names(COLUMN_GROUPS)).toHaveLength(BACKEND.a6.length + BACKEND.extension.length)
  })

  it('has the same aliases', () => {
    expect(Object.fromEntries(COLUMN_ALIASES.map((a) => [a.alias, a.column]))).toEqual(
      Object.fromEntries(Object.entries(BACKEND.aliases).map(([k, v]) => [k, shown(v)])),
    )
  })

  it('has the same required and not-stored columns', () => {
    expect([...REQUIRED_COLUMNS]).toEqual(BACKEND.required)
    expect(new Set(names(COLUMN_GROUPS.filter((g) => g.notStored)))).toEqual(new Set(BACKEND.ignored))
  })

  it('accepts style_number and fabric_composition', () => {
    const a = analyzeHeader(['seller_sku', 'product_name', 'category', 'style_number', 'Fabric_Composition'])
    expect(a.refused).toBe(false)
    expect(a.columns.map((c) => [c.match, c.field])).toEqual([
      ['ok', 'seller_sku'],
      ['ok', 'product_name'],
      ['ok', 'category'],
      ['ok', 'style_number'],
      ['alias', 'fiber_composition'],
    ])
    // fiber_composition and its alias name one column.
    expect(analyzeHeader(['seller_sku', 'product_name', 'category', 'fiber_composition', 'fabric_composition']).columns[4]!.match).toBe('duplicate')
  })
})

describe('templates and photo links', () => {
  it('never asks for photo links, and keeps style_number and the size chart link', () => {
    expect(MINIMAL_HEADER).toEqual(['seller_sku', 'product_name', 'category'])
    for (const c of PHOTO_LINK_COLUMNS) expect(FULL_HEADER).not.toContain(c)
    expect(PHOTO_LINK_COLUMNS).toEqual(['main_image', 'additional_images'])
    expect(FULL_HEADER).toContain('style_number')
    expect(FULL_HEADER).toContain('size_chart')
  })

  it('accepts a file with photo links, marks them not used and counts the rows that fill them', () => {
    const a = analyzeCsv('seller_sku,product_name,category,main_image,additional_images\nA,Kurta,kurtas,https://x.test/a.jpg,\nB,Tee,tees,,\nC,Tee,tees, ,https://x.test/c.jpg\n')
    expect(a.refused).toBe(false)
    expect(a.columns.slice(3).map((c) => c.match)).toEqual(['photo-link', 'photo-link'])
    expect(a.photoLinkRows).toBe(2)
    expect(analyzeCsv('seller_sku,product_name,category\nA,Kurta,kurtas\n').photoLinkRows).toBe(0)
  })
})

const backendDir = process.env.BACKEND_DIR || process.env.E2E_BACKEND_DIR
const headersPy = backendDir ? join(backendDir, 'apps/api/app/services/imports/headers.py') : ''

/** The text of `NAME: ... = (…)` or `{…}` in headers.py, up to its balanced close, comments dropped. */
function pyBlock(src: string, name: string): string {
  const start = src.search(new RegExp(`^${name}:`, 'm'))
  if (start < 0) throw new Error(`${name} not found in headers.py`)
  const from = start + src.slice(start).search(/= /)
  const text = src.slice(from).replace(/#.*$/gm, '')
  let depth = 0
  let inString = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (ch === '"') inString = !inString
    if (inString) continue
    if (ch === '(' || ch === '{') depth++
    else if (ch === ')' || ch === '}') {
      depth--
      if (depth === 0) return text.slice(0, i + 1)
    }
  }
  throw new Error(`${name} is not closed in headers.py`)
}
const strings = (block: string) => [...block.matchAll(/"([^"]+)"/g)].map((m) => m[1]!)

describe.skipIf(!headersPy || !existsSync(headersPy))('the copy above matches the backend checkout', () => {
  it('reads the same lists from headers.py', () => {
    const src = readFileSync(headersPy, 'utf8')
    expect(strings(pyBlock(src, 'A6_COLUMNS'))).toEqual(BACKEND.a6)
    expect(strings(pyBlock(src, 'EXTENSION_COLUMNS'))).toEqual(BACKEND.extension)
    expect(strings(pyBlock(src, 'REQUIRED'))).toEqual(BACKEND.required)
    expect(new Set(strings(pyBlock(src, 'IGNORED_WITH_WARNING')))).toEqual(new Set(BACKEND.ignored))
    const aliasBlock = pyBlock(src, 'ALIASES').replace(/GRAMS_COLUMN/g, '"package_weight_g"')
    const pairs = [...aliasBlock.matchAll(/"([^"]+)":\s*"([^"]+)"/g)].map((m) => [m[1]!, m[2]!])
    expect(Object.fromEntries(pairs)).toEqual(BACKEND.aliases)
  })
})
