import { afterEach, describe, expect, it, vi } from 'vitest'
import { qualityEnabled } from './flags'

describe('qualityEnabled', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('is off when the build switch is unset, as in prod today', () => {
    vi.stubEnv('VITE_QUALITY_ENABLED', '')
    expect(qualityEnabled()).toBe(false)
  })

  it('is on only for the exact value true', () => {
    vi.stubEnv('VITE_QUALITY_ENABLED', '1')
    expect(qualityEnabled()).toBe(false)
    vi.stubEnv('VITE_QUALITY_ENABLED', 'true')
    expect(qualityEnabled()).toBe(true)
  })
})
