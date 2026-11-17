import { describe, expect, it } from 'vitest'
import { matchCategory } from './category-select'

describe('matchCategory', () => {
  it('finds a category by its label or keywords', () => {
    expect(matchCategory('jeans', 'jean', ['Jeans', 'Bottomwear', 'denim'])).toBe(1)
    expect(matchCategory('track_pants', 'track p', ['Track pants'])).toBe(1)
    expect(matchCategory('jeans', 'DENIM', ['Jeans', 'denim'])).toBe(1)
  })

  it('does not fuzzy-match letters scattered across a name', () => {
    expect(matchCategory('tshirts', 'saree', ['T-shirts', 'Topwear'])).toBe(0)
    expect(matchCategory('track_pants', 'saree', ['Track pants', 'Bottomwear'])).toBe(0)
  })

  it('shows everything for an empty search', () => {
    expect(matchCategory('jeans', '  ', ['Jeans'])).toBe(1)
  })
})
