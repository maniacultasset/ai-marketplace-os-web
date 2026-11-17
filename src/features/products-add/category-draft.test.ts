import { describe, expect, it } from 'vitest'
import { draftBody, draftView, extraDescription, looksLikeText, NOT_LISTED_TEXT } from './category-draft'

describe('category suggestion before save (client feedback 11 Nov)', () => {
  it('sends the name, the brand and the filled attributes only', () => {
    expect(draftBody('  Cotton kurta  ', ' Acme ', { color: 'Red', fabric_type: ' ', 'Bad Key': 'x', z_note: 'y'.repeat(300) })).toEqual({
      title: 'Cotton kurta',
      brand: 'Acme',
      attributes: { color: 'Red', z_note: 'y'.repeat(200) },
    })
    expect(draftBody('Tee', '', {})).toEqual({ title: 'Tee', attributes: {} })
    // Client feedback 17 Nov: the description goes too, when there is one.
    expect(draftBody('Blue denim', '', {}, '  Type: Jeans  ')).toEqual({ title: 'Blue denim', description: 'Type: Jeans', attributes: {} })
    expect(draftBody('Blue denim', '', {}, 'x'.repeat(6000)).description).toHaveLength(5000)
    expect(extraDescription([{ key: 'Type', value: 'Jeans' }, { key: ' ', value: 'x' }, { key: 'Rise', value: ' Mid ' }])).toBe('Type: Jeans; Rise: Mid')
  })

  it('maps each answer to what the form shows', () => {
    expect(draftView(null, false)).toEqual({ kind: 'idle' })
    expect(draftView(null, true)).toEqual({ kind: 'asking' })
    expect(draftView({ suggestion_id: 's', status: 'queued', candidates: [] }, false)).toEqual({ kind: 'asking' })
    expect(draftView({ suggestion_id: null, status: 'unavailable', candidates: [] }, false)).toEqual({ kind: 'unavailable' })
    expect(draftView({ suggestion_id: 's', status: 'suggested', candidates: [] }, false)).toEqual({ kind: 'none', notListed: false, looksLike: null })
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

describe('not listed and looks like (client feedback 17 Nov)', () => {
  const tee = { category: 'tshirts', label: 'T-shirts', confidence: 0.95, rationale: 'Closest.', unsure: false }
  it('never shows a forced pick as confident', () => {
    const v = draftView({ suggestion_id: 's', status: 'suggested', candidates: [tee], not_listed: true }, false)
    expect(v).toEqual({ kind: 'chips', candidates: [{ ...tee, unsure: true }], notListed: true, looksLike: null })
    const l = draftView({ suggestion_id: 's', status: 'suggested', candidates: [tee], looks_like: 'bottomwear' }, false)
    expect(l.kind === 'chips' && l.candidates[0]!.unsure).toBe(true)
    expect(l.kind === 'chips' && l.looksLike).toBe('bottomwear')
  })

  it('keeps a plain answer as it was, and ignores an unknown group', () => {
    const v = draftView({ suggestion_id: 's', status: 'suggested', candidates: [tee], not_listed: false, looks_like: null }, false)
    expect(v).toEqual({ kind: 'chips', candidates: [tee], notListed: false, looksLike: null })
    const odd = draftView({ suggestion_id: 's', status: 'suggested', candidates: [tee], looks_like: 'other' }, false)
    expect(odd.kind === 'chips' && odd.looksLike).toBeNull()
    expect(draftView({ suggestion_id: 's', status: 'suggested', candidates: [], not_listed: true }, false)).toEqual({ kind: 'none', notListed: true, looksLike: null })
  })

  it('says it in plain words', () => {
    expect(looksLikeText('bottomwear')).toBe('Your title says bottomwear. Check the category.')
    expect(NOT_LISTED_TEXT).toBe('None of our categories fit this yet. Pick the closest or tell us what it is.')
  })
})
