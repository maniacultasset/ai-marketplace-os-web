import { describe, expect, it } from 'vitest'
import { confidenceWord, formatConfidence, isCandidate, suggestView } from './category-model'
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
