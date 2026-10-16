import { describe, expect, it } from 'vitest'
import { keysFor } from './query-keys'

const k = keysFor('t1')
const isPrefix = (prefix: readonly unknown[], key: readonly unknown[]) =>
  prefix.every((p, i) => JSON.stringify(p) === JSON.stringify(key[i]))

describe('query keys', () => {
  it('scopes every key to the tenant', () => {
    expect(isPrefix(k.all(), k.listings.list({ status: 'approved' }))).toBe(true)
    expect(isPrefix(k.all(), k.signups.list('pending'))).toBe(true)
  })
  it('listing detail prefixes its sub-resources; lists() prefixes every filtered list', () => {
    const d = k.listings.detail('L')
    for (const sub of [k.listings.history('L'), k.listings.preview('L'), k.listings.status('L'), k.listings.submissions('L')])
      expect(isPrefix(d, sub)).toBe(true)
    expect(isPrefix(k.listings.lists(), k.listings.list({ marketplace: 'amazon' }))).toBe(true)
    expect(isPrefix(k.listings.lists(), d)).toBe(false)
  })
  it('normalizes filter defaults so equal filters share one cache entry', () => {
    expect(k.issues.list()).toEqual(k.issues.list({ status: 'open' }))
    expect(k.tasks.list()).toEqual(k.tasks.list('open'))
    expect(k.analytics.summary()).toEqual(k.analytics.summary({ from: null, to: null }))
  })
  it('brand profile and documents share the brand prefix', () => {
    expect(isPrefix(k.brand.all(), k.brand.profile())).toBe(true)
    expect(isPrefix(k.brand.all(), k.brand.documents())).toBe(true)
  })
})
