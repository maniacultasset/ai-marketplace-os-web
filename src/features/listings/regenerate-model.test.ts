import { describe, expect, it } from 'vitest'
import { regenerable, regenerateLabel } from './regenerate-model'

describe('Regenerate after an answer', () => {
  it('offers only listings with a version', () => {
    const rows = [
      { id: 'a', status: 'blocked' as const, current_version_id: 'v1' },
      { id: 'b', status: 'created' as const, current_version_id: null },
      { id: 'c', status: 'validated' as const, current_version_id: null },
    ]
    expect(regenerable(rows).map((r) => r.id)).toEqual(['a'])
  })

  it('names the marketplace only when the product has several listings', () => {
    expect(regenerateLabel('amazon', false)).toBe('Regenerate listing')
    expect(regenerateLabel('amazon', true)).toBe('Regenerate the Amazon listing')
  })
})
