import { describe, expect, it } from 'vitest'
import { archivedRows } from './archived-model'
import type { Product } from './catalog-model'

const p = (id: string, over: Partial<Product> = {}) =>
  ({ id, sku: id.toUpperCase(), title: `Tee ${id}`, parent_product_id: null, archived_at: '2026-11-13T09:00:00Z', ...over }) as Product

describe('archivedRows (the Products Archived view)', () => {
  it('lists each archived style once, with its archived sizes counted on it', () => {
    const style = p('ktest')
    const sizes = Array.from({ length: 8 }, (_, i) => p(`ktest-${i}`, { parent_product_id: 'ktest' }))
    const rows = archivedRows([style, ...sizes, p('solo')])
    expect(rows.map((r) => [r.product.id, r.variants])).toEqual([
      ['ktest', 8],
      ['solo', 0],
    ])
  })

  it('keeps a size whose style is not in the archived list as its own row', () => {
    expect(archivedRows([p('v1', { parent_product_id: 'live-style' })]).map((r) => r.product.id)).toEqual(['v1'])
  })

  it('matches the search on name or SKU', () => {
    const rows = [p('ktest', { title: 'Grey hoodie' }), p('other', { title: 'Blue tee' })]
    expect(archivedRows(rows, 'hood').map((r) => r.product.id)).toEqual(['ktest'])
    expect(archivedRows(rows, 'OTHER').map((r) => r.product.id)).toEqual(['other'])
    expect(archivedRows(rows, '  ')).toHaveLength(2)
  })
})
