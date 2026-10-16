import { describe, expect, it } from 'vitest'
import { parseListOn, serializeListOn } from './list-on'

describe('list on param', () => {
  it('keeps only API marketplaces, in a stable order', () => {
    expect(parseListOn('flipkart,myntra,amazon')).toEqual(['amazon', 'flipkart'])
    expect(parseListOn(undefined)).toEqual([])
    expect(serializeListOn(['flipkart', 'amazon'])).toBe('amazon,flipkart')
    expect(serializeListOn([])).toBeUndefined()
  })
})
