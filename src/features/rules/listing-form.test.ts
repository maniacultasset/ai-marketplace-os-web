import { describe, expect, it } from 'vitest'
import { draftSchema, emptyDraft, LIMITS, signedDecimal, type DraftValues } from './listing-form'

const valid = (over: Partial<DraftValues> = {}): DraftValues => ({
  ...emptyDraft({ marketplace: 'amazon', category: 'ethnic_wear_kurta_sets' }),
  title: 'Cotton kurta',
  bullets: [{ value: 'Soft cotton' }],
  description: 'A kurta.',
  ...over,
})

const messages = (v: DraftValues) => {
  const r = draftSchema.safeParse(v)
  return r.success ? {} : Object.fromEntries(r.error.issues.map((i) => [i.path.join('.'), i.message]))
}

describe('dry-run draft schema', () => {
  it('accepts real listing text in any script, with emoji counted as one character', () => {
    expect(messages(valid({ title: 'राहुल का कुर्ता — boAt 2.0 edition', description: 'Line one\n\tLine two' }))).toEqual({})
    expect(messages(valid({ title: '\u{1F642}'.repeat(LIMITS.title) }))).toEqual({})
  })

  it('keeps the backend limits and says how to fix them', () => {
    const m = messages(
      valid({
        title: 'x'.repeat(LIMITS.title + 1),
        bullets: [{ value: 'b'.repeat(LIMITS.bullet + 1) }],
        description: 'd'.repeat(LIMITS.description + 1),
        search_terms: ['t'.repeat(LIMITS.term + 1)],
      }),
    )
    expect(m.title).toBe('Shorten the title to 500 characters or fewer.')
    expect(m['bullets.0.value']).toBe('Shorten this bullet to 1,000 characters or fewer.')
    expect(m.description).toBe('Shorten the description to 5,000 characters or fewer.')
    expect(m['search_terms.0']).toBe('Shorten each term to 256 characters or fewer.')
  })

  it('keeps the blank messages the form shows', () => {
    const m = messages(valid({ title: '  ', bullets: [{ value: '' }] }))
    expect(m.title).toBe("Title can't be blank.")
    expect(m['bullets.0.value']).toBe("Bullet can't be blank.")
  })

  it('refuses pasted control characters but keeps tabs and line breaks', () => {
    expect(messages(valid({ title: 'Kurta\u0000' })).title).toMatch(/control character/)
    expect(messages(valid({ bullets: [{ value: 'a\u0007b' }] }))['bullets.0.value']).toMatch(/control character/)
  })

  it('checks number attributes and accepts anything finite', () => {
    const attr = (value: string) => valid({ attributes: [{ key: 'weight', type: 'number', value }] })
    expect(messages(attr('abc'))['attributes.0.value']).toBe('Enter a number, like 42, -5 or 3.5.')
    expect(messages(attr(''))['attributes.0.value']).toBe('Enter a number, like 42, -5 or 3.5.')
    for (const ok of ['42', '-5', '3.5', '1e+21']) expect(messages(attr(ok))).toEqual({})
  })

  it('rejects attribute keys outside a-z, 0-9 and _', () => {
    const m = messages(valid({ attributes: [{ key: 'Fabric Type', type: 'text', value: 'cotton' }] }))
    expect(m['attributes.0.key']).toBe('Use a-z, 0-9 and _ (1 to 64).')
  })

  it('signedDecimal keeps an optional minus, digits and one dot', () => {
    expect(signedDecimal('12abc')).toBe('12')
    expect(signedDecimal('-3.5.1')).toBe('-3.51')
    expect(signedDecimal('1-2')).toBe('12')
    expect(signedDecimal('₹1,299.50')).toBe('1299.50')
  })
})
