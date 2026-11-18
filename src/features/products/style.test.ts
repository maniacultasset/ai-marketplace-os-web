import { describe, expect, it } from 'vitest'
import { formAttrFields, toProductCreate, emptyGuided } from '@/features/products-add/guided-model'
import { buildPatch, editableAttrs, toEditDraft } from './edit-model'
import { missingNeeds, productFilled, type Requirements } from './needs'
import { STYLE_CATEGORIES, styleDerivable, styleFilled, styleSuggestions } from './style'
import type { Schema } from '@/api/types'

const req = (category: string, extra: Partial<Requirements> = {}) => ({ category, amazon: [], flipkart: [], ...extra }) as Requirements

describe('Style for apparel (Amazon needs it)', () => {
  it('suggests per category and none outside apparel', () => {
    expect(styleSuggestions('tshirts')).toEqual(['Round Neck', 'Polo', 'V-Neck', 'Henley', 'Oversized', 'Graphic Print'])
    expect(styleSuggestions('ethnic_wear_kurta_sets')).toContain('Anarkali')
    expect(styleSuggestions('jeans')).toEqual(styleSuggestions('trousers'))
    expect(styleSuggestions('track_pants')).toEqual(['Jogger', 'Straight', 'Cargo'])
    expect(styleSuggestions('shorts')).toEqual(['Casual', 'Cargo', 'Denim', 'Sports'])
    expect(styleSuggestions('skirts')).toEqual(['A-Line', 'Pencil', 'Flared', 'Pleated'])
    expect(styleSuggestions('home_decor_lamps')).toEqual([])
  })

  it('shows on the add form and the editor for the seven apparel categories only', () => {
    for (const c of STYLE_CATEGORIES) {
      expect(formAttrFields(c, {}).map((f) => f.key)).toContain('style')
      expect(editableAttrs(false, c)).toContain('style')
    }
    expect(formAttrFields('home_decor_lamps', {}).map((f) => f.key)).not.toContain('style')
    expect(editableAttrs(false, 'home_decor_lamps')).not.toContain('style')
    // a value stays visible; a template that names it shows it
    expect(formAttrFields('home_decor_lamps', { style: 'Modern' }).map((f) => f.key)).toContain('style')
    expect(editableAttrs(false, 'home_decor_lamps', {}, { amazon: { style: 'optional' } })).toContain('style')
    // style-level only: never on a variant
    expect(editableAttrs(true, 'tshirts')).not.toContain('style')
  })

  it('sends and edits style as a plain attribute', () => {
    const v = { ...emptyGuided(), sku: 'S1', title: 'Tee', category: 'tshirts', attrs: { style: ' Polo ' } }
    expect(toProductCreate(v).attributes).toMatchObject({ style: 'Polo' })
    const base = toEditDraft({ id: 'p', sku: 'S1', title: 'Tee', category: 'tshirts', attributes: {} } as unknown as Schema<'ProductOut'>)
    expect(buildPatch(base, { ...base, attrs: { ...base.attrs, style: 'Round Neck' } }, false).attributes).toEqual({ style: 'Round Neck' })
  })

  it('counts a value Kuinn can derive from the seller’s own facts', () => {
    expect(styleDerivable('tshirts', { neckline: 'Round Neck' })).toBe(true)
    expect(styleDerivable('tshirts', { fit: 'Regular' })).toBe(true)
    expect(styleDerivable('tshirts', {})).toBe(false)
    expect(styleDerivable('ethnic_wear_kurta_sets', { fit: 'Regular' })).toBe(false)
    expect(styleDerivable('ethnic_wear_kurta_sets', { kurta_type: 'Straight' })).toBe(true)
    expect(styleDerivable('jeans', { leg_style: 'Straight' })).toBe(true)
    expect(styleFilled('skirts', { style: 'Pleated' })).toBe(true)
    expect(styleFilled('skirts', {})).toBe(false)
  })

  it('says "Required for Amazon" while empty: from the levels, else the apparel fallback', () => {
    const text = (r: Requirements, sellOn: ('amazon' | 'flipkart')[] = ['amazon']) =>
      missingNeeds(r, sellOn, { style: false }).map((n) => [n.field.id, n.text])
    expect(text(req('tshirts', { levels: { amazon: { style: 'required' } } }))).toEqual([['style', 'Required for Amazon']])
    expect(text(req('tshirts', { amazon: ['style'] }))).toEqual([['style', 'Required for Amazon']])
    // a backend that does not name it yet: the apparel categories still need it
    expect(text(req('jeans'))).toEqual([['style', 'Required for Amazon']])
    // a template that names it at another level wins over the fallback
    expect(text(req('jeans', { levels: { amazon: { style: 'optional' } } }))).toEqual([])
    expect(text(req('home_decor_lamps'))).toEqual([])
    expect(text(req('tshirts'), ['flipkart'])).toEqual([])
    expect(missingNeeds(req('tshirts'), ['amazon'], { style: true })).toEqual([])
  })

  it('a saved product counts Style as given when it has one or Kuinn can derive one', () => {
    const p = (attributes: Record<string, string>) => ({ category: 'tshirts', attributes }) as unknown as Schema<'ProductOut'>
    expect(productFilled(p({}), { isVariant: false, isStyle: true }).style).toBe(false)
    expect(productFilled(p({ style: 'Polo' }), { isVariant: false, isStyle: true }).style).toBe(true)
    expect(productFilled(p({ neckline: 'Round Neck' }), { isVariant: false, isStyle: true }).style).toBe(true)
    expect(productFilled(p({}), { isVariant: true, isStyle: false }).style).toBe(true)
  })
})
