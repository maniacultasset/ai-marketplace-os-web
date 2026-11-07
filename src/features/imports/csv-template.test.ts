/**
 * The bulk CSV header list must match the backend's (apps/api/app/services/imports/headers.py).
 *
 * backend-headers.snapshot.json is generated from headers.py (`BACKEND_DIR=… pnpm gen:headers`)
 * and names the backend commit it came from. The FE template is always checked against it. When
 * a backend checkout is given (`BACKEND_DIR` or `E2E_BACKEND_DIR`), the snapshot is also checked
 * against that checkout's headers.py, so a stale snapshot fails locally.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { analyzeCsv, analyzeHeader } from '@/features/products-add/csv-header'
import snapshot from './backend-headers.snapshot.json'
import { HEADERS_PY_PATH, parseHeadersPy } from './headers-py'
import { COLUMN_ALIASES, COLUMN_GROUPS, FULL_HEADER, MINIMAL_HEADER, PHOTO_LINK_COLUMNS, REQUIRED_COLUMNS } from './csv-template'

const BACKEND = snapshot

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
const headersPy = backendDir ? join(backendDir, HEADERS_PY_PATH) : ''

describe('the snapshot', () => {
  it('names the backend commit it came from', () => {
    expect(snapshot.source).toBe(HEADERS_PY_PATH)
    expect(snapshot.backend_sha).toMatch(/^[0-9a-f]{40}$/)
  })
})

describe.skipIf(!headersPy || !existsSync(headersPy))('the snapshot matches the backend checkout', () => {
  it('reads the same lists from headers.py', () => {
    const { a6, extension, aliases, required, ignored } = snapshot
    expect(parseHeadersPy(readFileSync(headersPy, 'utf8'))).toEqual({ a6, extension, aliases, required, ignored })
  })
})
