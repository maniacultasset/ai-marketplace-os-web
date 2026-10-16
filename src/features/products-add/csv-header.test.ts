import { describe, expect, it } from 'vitest'
import { analyzeCsv, analyzeHeader, parseCsv } from './csv-header'

describe('parseCsv', () => {
  it('handles quotes, commas, CRLF and embedded line breaks', () => {
    expect(parseCsv('a,"b,c","d ""e"""\r\n1,"two\nlines",3\n\n')).toEqual([
      ['a', 'b,c', 'd "e"'],
      ['1', 'two\nlines', '3'],
    ])
  })
})

describe('analyzeHeader', () => {
  it('matches by name like the server (BOM, case, aliases, not-stored, bullets)', () => {
    const a = analyzeHeader(['﻿Seller_SKU', 'product_name', 'category', 'parent_sku', 'bullet_3', 'Description', 'Wash'])
    expect(a.columns.map((c) => c.match)).toEqual(['ok', 'ok', 'ok', 'alias', 'not-stored', 'not-stored', 'unknown'])
    expect(a.columns[3]!.field).toBe('parent_style_id')
    expect(a.missing).toEqual([])
    expect(a.refused).toBe(true)
  })
  it('flags duplicates through aliases and missing required columns', () => {
    const a = analyzeHeader(['seller_sku', 'mrp', 'mrp_inr'])
    expect(a.columns[2]!.match).toBe('duplicate')
    expect(a.missing).toEqual(['product_name', 'category'])
  })
  it('accepts a clean template and counts data rows', () => {
    const a = analyzeCsv('seller_sku,product_name,category\nA,Kurta,kurtas\nB,Tee,tees\n')
    expect(a.refused).toBe(false)
    expect(a.rows).toBe(2)
  })
})
