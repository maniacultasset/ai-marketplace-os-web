import { describe, expect, it } from 'vitest'
import { analyzeCsv, analyzeHeader, linkProblem, parseCsv } from './csv-header'

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

describe('photo links the server still checks', () => {
  it('flags non-https, malformed and too many links per row, like row_model media()', () => {
    const nine = Array.from({ length: 9 }, (_, i) => `https://x.test/${i}.jpg`).join('|')
    const ten = `${nine}|https://x.test/9.jpg`
    const csv = [
      'seller_sku,product_name,category,main_image,additional_images,size_chart',
      'A,Kurta,kurtas,https://x.test/a.jpg,,',
      'B,Kurta,kurtas,http://x.test/b.jpg,,',
      'C,Kurta,kurtas,not a link,,',
      `D,Kurta,kurtas,,${nine},`,
      `E,Kurta,kurtas,,${ten},`,
      'F,Kurta,kurtas,,,ftp://x.test/chart.png',
      'G,Kurta,kurtas,https://user:pw@x.test/g.jpg,,',
    ].join('\n')
    const a = analyzeCsv(csv)
    expect(a.linkProblems.map((p) => [p.row, p.column])).toEqual([
      [3, 'main_image'],
      [4, 'main_image'],
      [6, 'additional_images'],
      [7, 'size_chart'],
      [8, 'main_image'],
    ])
    expect(a.linkProblems[0]!.problem).toBe('main_image must hold https links.')
    expect(a.linkProblems[2]!.problem).toBe('At most 9 photo links per row.')
    expect(linkProblem('https://x.test/a.jpg')).toBeNull()
    expect(linkProblem(`https://x.test/${'a'.repeat(2049)}`)).toBe('longer than 2,048 characters')
  })
})

describe('analyzeCsv skuRows (client feedback 11 Nov, item 3)', () => {
  it('reads each row’s trimmed seller_sku with its record number and whether it names a style', () => {
    const a = analyzeCsv('product_name,seller_sku,category,parent_sku\nKurta, KS-1 ,tshirts,\nKurta S,KS-1-S,tshirts,KS-1\nNo sku,,tshirts,\n')
    expect(a.skuRows).toEqual([
      { row: 2, sku: 'KS-1', hasParent: false },
      { row: 3, sku: 'KS-1-S', hasParent: true },
    ])
  })

  it('has no SKU rows without a seller_sku column', () => {
    expect(analyzeCsv('product_name,category\nKurta,tshirts\n').skuRows).toEqual([])
  })
})
