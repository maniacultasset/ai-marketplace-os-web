import { describe, expect, it } from 'vitest'
import { skuState, takenMessage } from './sku-check'

const free = { sku: 'KS-1', available: true, is_variant: false, deleted: false }
const taken = { sku: 'KS-1', available: false, product_id: 'p1', title: 'Kurta set', is_variant: false, deleted: false }

describe('SKU check states (client feedback 11 Nov)', () => {
  it('waits for typing to stop and for the answer', () => {
    expect(skuState('', '', undefined)).toEqual({ kind: 'idle' })
    expect(skuState('KS 1', 'KS 1', undefined)).toEqual({ kind: 'invalid' })
    expect(skuState('KS-1', 'KS-', free)).toEqual({ kind: 'checking' })
    expect(skuState('KS-1', 'KS-1', undefined)).toEqual({ kind: 'checking' })
  })

  it('says free, taken or unknown for the settled SKU', () => {
    expect(skuState(' KS-1 ', 'KS-1', free)).toEqual({ kind: 'free' })
    expect(skuState('KS-1', 'KS-1', taken)).toEqual({ kind: 'taken', productId: 'p1', title: 'Kurta set', isVariant: false, deleted: false })
    expect(skuState('KS-1', 'KS-1', null)).toEqual({ kind: 'unknown' })
    // an answer for another SKU never counts
    expect(skuState('KS-1', 'KS-1', { ...free, sku: 'KS-2' })).toEqual({ kind: 'unknown' })
  })

  it('explains a taken SKU in plain words', () => {
    expect(takenMessage('KS-1', taken)).toBe('KS-1 is already used by “Kurta set”. Use another, or let Kuinn make one.')
    expect(takenMessage('KS-1-S', { ...taken, is_variant: true })).toBe('KS-1-S is already used by a size or colour of “Kurta set”. Use another, or let Kuinn make one.')
    expect(takenMessage('OLD', { title: null, is_variant: false, deleted: true })).toMatch(/deleted product/)
  })
})
