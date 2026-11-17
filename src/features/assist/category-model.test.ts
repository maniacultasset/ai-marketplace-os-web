import { describe, expect, it } from 'vitest'
import { answerDoubt, confidenceWord, doubtText, isForcedPick, formatConfidence, isCandidate, suggestView } from './category-model'
import { lampsOnFrom } from './flags'

const NOW = Date.parse('2026-11-09T12:00:00Z')
const base = { category: null, category_suggest_enabled: true, parent_product_id: null, created_at: '2026-11-09T10:00:00Z', suggestions: null }
const cand = (category: string, confidence: number) => ({ category, confidence, rationale: 'r' })

describe('suggestView', () => {
  it('is hidden while the switch is off, for a product with a category, and for a variant', () => {
    expect(suggestView({ ...base, category_suggest_enabled: false }, NOW)).toEqual({ kind: 'hidden' })
    expect(suggestView({ ...base, category: 'tshirts' }, NOW)).toEqual({ kind: 'hidden' })
    expect(suggestView({ ...base, parent_product_id: 'p' }, NOW)).toEqual({ kind: 'hidden' })
  })

  it('waits for the automatic run just after a create, then offers to ask', () => {
    expect(suggestView({ ...base, created_at: '2026-11-09T11:59:30Z' }, NOW)).toEqual({ kind: 'waiting' })
    expect(suggestView(base, NOW)).toEqual({ kind: 'ask' })
  })

  it('lists candidates highest first, and says when there is no confident answer', () => {
    const v = suggestView({ ...base, suggestions: { category: { status: 'suggested', candidates: [cand('tshirts', 0.4), cand('ethnic_wear_kurta_sets', 0.9)] } } }, NOW)
    expect(v.kind === 'candidates' && v.candidates.map((c) => c.category)).toEqual(['ethnic_wear_kurta_sets', 'tshirts'])
    expect(suggestView({ ...base, suggestions: { category: { status: 'suggested', candidates: [] } } }, NOW)).toEqual({ kind: 'none', failed: false })
    expect(suggestView({ ...base, suggestions: { category: { status: 'unavailable' } } }, NOW)).toEqual({ kind: 'none', failed: false })
    expect(suggestView({ ...base, suggestions: { category: { status: 'failed' } } }, NOW)).toEqual({ kind: 'none', failed: true })
  })
})

describe('doubt (client feedback 17 Nov)', () => {
  it('says when no category fits, or the words point to another group', () => {
    const v = suggestView({ ...base, suggestions: { category: { status: 'suggested', candidates: [cand('tshirts', 0.95)], not_listed: true } } }, NOW)
    expect(v.kind === 'candidates' && v.doubt).toBe('None of our categories fit this yet. Pick the closest, or leave the category empty for now.')
    const l = suggestView({ ...base, suggestions: { category: { status: 'suggested', candidates: [cand('tshirts', 0.95)], looks_like: 'bottomwear' } } }, NOW)
    expect(l.kind === 'candidates' && l.doubt).toBe('Your title says bottomwear. Check the category.')
    const plain = suggestView({ ...base, suggestions: { category: { status: 'suggested', candidates: [cand('tshirts', 0.95)] } } }, NOW)
    expect(plain.kind === 'candidates' && plain.doubt).toBeNull()
    expect(doubtText(false, 'other')).toBeNull()
    expect(doubtText(undefined, 'ethnic')).toBe('Your title says ethnic wear. Check the category.')
  })

  it('has no doubt when the top pick is already in the group the words name, and still preselects it', () => {
    const v = suggestView({ ...base, suggestions: { category: { status: 'suggested', candidates: [cand('jeans', 0.9), cand('tshirts', 0.2)], looks_like: 'bottomwear' } } }, NOW)
    expect(v.kind === 'candidates' && v.doubt).toBeNull()
    expect(v.kind === 'candidates' && v.looksLike).toBeNull()
  })

  it('marks only the picks outside the named group as forced', () => {
    const d = answerDoubt(false, 'bottomwear', 'tshirts')
    expect(d).toEqual({ notListed: false, looksLike: 'bottomwear' })
    expect(isForcedPick('tshirts', d)).toBe(true)
    expect(isForcedPick('jeans', d)).toBe(false)
    expect(isForcedPick('jeans', answerDoubt(true, null, 'tshirts'))).toBe(true)
    expect(isForcedPick('tshirts', answerDoubt(false, null, 'tshirts'))).toBe(false)
  })
})

describe('confidence words', () => {
  it('pairs every number with a word', () => {
    expect([confidenceWord(0.92), confidenceWord(0.8), confidenceWord(0.6), confidenceWord(0.2)]).toEqual(['Likely', 'Likely', 'Possible', 'Unsure'])
    expect(formatConfidence(0.874)).toBe('87%')
    expect(isCandidate('tshirts', [cand('tshirts', 0.5)])).toBe(true)
    expect(isCandidate('home_decor_lamps', [cand('tshirts', 0.5)])).toBe(false)
  })
})

describe('lampsOnFrom', () => {
  const unknown = { amazon: ['brand_name', 'mrp'], flipkart: ['hsn_code', 'mrp'] }
  it('is off when lamps answer like an unknown category, on when the template adds keys', () => {
    expect(lampsOnFrom({ amazon: ['mrp', 'brand_name'], flipkart: ['mrp', 'hsn_code'] }, unknown)).toBe(false)
    expect(lampsOnFrom({ amazon: ['brand_name', 'mrp', 'product_dimensions'], flipkart: ['hsn_code', 'mrp'] }, unknown)).toBe(true)
  })
})
