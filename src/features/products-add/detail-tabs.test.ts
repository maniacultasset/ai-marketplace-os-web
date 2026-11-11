import { describe, expect, it } from 'vitest'
import { detailSearch } from './detail-tabs'

describe('product page deep links (prod QA 9 Nov, item 13)', () => {
  it('opens every tab by ?tab=, Validation included; an unknown tab falls back to Overview', () => {
    expect(detailSearch.parse({ tab: 'validation' })).toEqual({ tab: 'validation' })
    expect(detailSearch.parse({ tab: 'activity' })).toEqual({ tab: 'activity' })
    expect(detailSearch.parse({ tab: 'nope' })).toEqual({ tab: undefined })
  })

  it('opens the editor at the barcode by ?edit=barcode; an unknown target is dropped', () => {
    expect(detailSearch.parse({ edit: 'barcode' })).toEqual({ edit: 'barcode' })
    expect(detailSearch.parse({ edit: 'price' })).toEqual({ edit: undefined })
  })
})
