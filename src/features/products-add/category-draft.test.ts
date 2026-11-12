import { describe, expect, it } from 'vitest'
import { draftBody, draftView } from './category-draft'

describe('category suggestion before save (client feedback 11 Nov)', () => {
  it('sends the name, the brand and the filled attributes only', () => {
    expect(draftBody('  Cotton kurta  ', ' Acme ', { color: 'Red', fabric_type: ' ', 'Bad Key': 'x', z_note: 'y'.repeat(300) })).toEqual({
      title: 'Cotton kurta',
      brand: 'Acme',
      attributes: { color: 'Red', z_note: 'y'.repeat(200) },
    })
    expect(draftBody('Tee', '', {})).toEqual({ title: 'Tee', attributes: {} })
  })

  it('maps each answer to what the form shows', () => {
    expect(draftView(null, false)).toEqual({ kind: 'idle' })
    expect(draftView(null, true)).toEqual({ kind: 'asking' })
    expect(draftView({ suggestion_id: 's', status: 'queued', candidates: [] }, false)).toEqual({ kind: 'asking' })
    expect(draftView({ suggestion_id: null, status: 'unavailable', candidates: [] }, false)).toEqual({ kind: 'unavailable' })
    expect(draftView({ suggestion_id: 's', status: 'suggested', candidates: [] }, false)).toEqual({ kind: 'none' })
    expect(draftView({ suggestion_id: 's', status: 'failed', candidates: [] }, false).kind).toBe('failed')
    const ranked = draftView(
      {
        suggestion_id: 's',
        status: 'suggested',
        candidates: [
          { category: 'tshirts', label: 'T-shirts', confidence: 0.4, rationale: 'Maybe.', unsure: true },
          { category: 'ethnic_wear_kurta_sets', label: 'Kurta sets', confidence: 0.9, rationale: 'Kurta.', unsure: false },
        ],
      },
      false,
    )
    expect(ranked.kind === 'chips' && ranked.candidates.map((c) => c.category)).toEqual(['ethnic_wear_kurta_sets', 'tshirts'])
  })
})
