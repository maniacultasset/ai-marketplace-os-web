import { describe, expect, it } from 'vitest'
import { isAmazonPublishingPaused } from '@/features/brand/api'
import { accessText } from './format'

describe('connection access (prod QA 9 Nov, item 19)', () => {
  it('never shows the 1-hour token expiry: an active account renews automatically', () => {
    expect(accessText('active')).toBe('Renews automatically')
    expect(accessText('needs_reconnect')).toBe('Reconnect needed')
    expect(accessText('revoked')).toBe('Revoked')
  })
})

describe('isAmazonPublishingPaused (prod QA 9 Nov, item 20)', () => {
  const caps = (amazon_publishing_enabled: boolean) => ({ capabilities: { amazon_publishing_enabled } as never })

  it('reads the tenant capabilities', () => {
    expect(isAmazonPublishingPaused(caps(false))).toBe(true)
    expect(isAmazonPublishingPaused(caps(true))).toBe(false)
    expect(isAmazonPublishingPaused({})).toBe(false) // field absent: not a pause
    expect(isAmazonPublishingPaused(undefined)).toBe(false)
  })

  it('reads the Amazon account switch when the tenant read has not landed', () => {
    expect(isAmazonPublishingPaused(undefined, { marketplace: 'amazon', publishing_enabled: false })).toBe(true)
    expect(isAmazonPublishingPaused(undefined, { marketplace: 'amazon', publishing_enabled: true })).toBe(false)
    expect(isAmazonPublishingPaused(undefined, { marketplace: 'flipkart', publishing_enabled: false })).toBe(false)
    expect(isAmazonPublishingPaused(caps(false), { marketplace: 'amazon', publishing_enabled: true })).toBe(true)
  })
})
