import { describe, expect, it } from 'vitest'
import { cleanProductsSearch, productsSearchSchema } from './products-search'

describe('Products filters in the URL', () => {
  it('reads every filter Home links with', () => {
    expect(productsSearchSchema.parse({ status: 'needs-you', marketplace: 'amazon', category: 'tshirts', q: 'kurta' })).toEqual({
      status: 'needs-you',
      marketplace: 'amazon',
      category: 'tshirts',
      q: 'kurta',
    })
  })

  it('reads the listing bucket a Home tile opens', () => {
    expect(productsSearchSchema.parse({ listing: 'ready_to_approve' })).toEqual({ listing: 'ready_to_approve' })
    expect(productsSearchSchema.parse({ listing: 'draft' })).toEqual({})
    expect(cleanProductsSearch({ listing: 'live', status: undefined })).toEqual({ listing: 'live' })
  })

  it('drops a bad value instead of failing the page', () => {
    expect(productsSearchSchema.parse({ status: 'nope', marketplace: 'myntra', category: 'Bad Slug!', q: 'x'.repeat(201) })).toEqual({})
  })

  it('keeps the URL short: empty values and "All" are left out', () => {
    expect(cleanProductsSearch({ status: undefined, marketplace: undefined, category: '', q: '  ' })).toEqual({})
    expect(cleanProductsSearch({ status: 'live', q: 'k' })).toEqual({ status: 'live', q: 'k' })
  })
})
