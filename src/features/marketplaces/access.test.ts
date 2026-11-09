import { describe, expect, it } from 'vitest'
import { isPublishingPaused } from '@/features/brand/api'
import { accessText } from './format'

describe('connection access (prod QA 9 Nov, item 19)', () => {
  it('never shows the 1-hour token expiry: an active account renews automatically', () => {
    expect(accessText('active')).toBe('Renews automatically')
    expect(accessText('needs_reconnect')).toBe('Reconnect needed')
    expect(accessText('revoked')).toBe('Revoked')
  })
})

describe('isPublishingPaused (prod QA 9 Nov, item 20)', () => {
  it('is true only when the API says publishing_enabled: false', () => {
    expect(isPublishingPaused({ name: 'Acme', publishing_enabled: false })).toBe(true)
    expect(isPublishingPaused({ name: 'Acme', publishing_enabled: true })).toBe(false)
    expect(isPublishingPaused({ name: 'Acme' })).toBe(false) // field absent: today's copy
    expect(isPublishingPaused(undefined)).toBe(false)
  })
})
