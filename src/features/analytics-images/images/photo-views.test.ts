import { describe, expect, it } from 'vitest'
import {
  extraViews,
  fromChecklist,
  moreSubtitle,
  neededForApproval,
  newProductGaps,
  recommendedGaps,
  requirementFor,
  sizeFlags,
  sizeList,
  tilesFor,
  variantSizes,
  viewGaps,
  type PhotoViewRule,
  type PhotoViewState,
} from './photo-views'
import { PHOTO_SLOTS } from './report'

const rule = (view: PhotoViewRule['view'], requirement: PhotoViewRule['requirement'], over: Partial<PhotoViewRule> = {}): PhotoViewRule => ({
  view,
  label: { front: 'Front', back: 'Back', close_up: 'Close-up', size_chart: 'Size chart', lifestyle: 'Lifestyle', packaging_label: 'Packaging label' }[view],
  slot: ({ front: 'main', back: 'secondary', close_up: 'secondary', size_chart: 'size_chart', lifestyle: 'lifestyle', packaging_label: 'packaging_label' } as const)[view],
  role: view === 'back' || view === 'close_up' ? view : null,
  requirement,
  why: `${view} why`,
  amazon: requirement,
  flipkart: requirement,
  ...over,
})

const KURTA: PhotoViewRule[] = [
  rule('front', 'required'),
  rule('back', 'recommended'),
  rule('close_up', 'recommended'),
  rule('size_chart', 'required'),
  rule('lifestyle', 'optional'),
  rule('packaging_label', 'optional'),
]
const LAMP: PhotoViewRule[] = [rule('front', 'required'), rule('close_up', 'recommended'), rule('lifestyle', 'recommended'), rule('back', 'optional')]

const state = (r: PhotoViewRule, status: PhotoViewState['status']): PhotoViewState => ({ ...r, status, image_ids: [] })

describe('tilesFor', () => {
  it('keeps the four fixed tiles while the checklist is off', () => {
    expect(tilesFor([], { isVariant: false })).toEqual(PHOTO_SLOTS)
    expect(tilesFor(undefined, { isVariant: true }).map((t) => t.id)).toEqual(['front', 'back', 'close_up'])
    expect(fromChecklist([])).toBe(false)
  })

  it('drives the tiles, their levels and hints from the checklist', () => {
    const tiles = tilesFor(KURTA, { isVariant: false })
    expect(tiles.map((t) => [t.id, t.requirement, t.required])).toEqual([
      ['front', 'required', true],
      ['back', 'recommended', false],
      ['close_up', 'recommended', false],
      ['size_chart', 'required', true],
    ])
    expect(tiles[1]).toMatchObject({ slot: 'secondary', role: 'back', hint: 'back why' })
    expect(fromChecklist(KURTA)).toBe(true)
  })

  it('shows no size chart tile on a variant, and only the views a lamp has', () => {
    expect(tilesFor(KURTA, { isVariant: true }).map((t) => t.id)).toEqual(['front', 'back', 'close_up'])
    expect(tilesFor(LAMP, { isVariant: false }).map((t) => [t.id, t.requirement])).toEqual([
      ['front', 'required'],
      ['close_up', 'recommended'],
      ['back', 'optional'],
    ])
  })
})

describe('requirementFor', () => {
  const back = rule('back', 'required', { amazon: 'required', flipkart: 'optional' })
  it('takes the strictest of the ticked marketplaces', () => {
    expect(requirementFor(back)).toBe('required')
    expect(requirementFor(back, ['flipkart'])).toBe('optional')
    expect(requirementFor(back, ['flipkart', 'amazon'])).toBe('required')
  })
  it('is optional for a marketplace whose list leaves the view out', () => {
    expect(requirementFor(rule('lifestyle', 'recommended', { amazon: null, flipkart: 'recommended' }), ['amazon'])).toBe('optional')
  })
})

describe('viewGaps', () => {
  it('names what approval needs and what is recommended', () => {
    const views = [state(KURTA[0]!, 'invalid'), state(KURTA[1]!, 'missing'), state(KURTA[2]!, 'present'), state(KURTA[3]!, 'missing'), state(KURTA[4]!, 'missing')]
    const gaps = viewGaps(views, { required: true, saved: false })
    expect(neededForApproval(gaps)).toEqual(['Front (a new photo)', 'Size chart'])
    expect(recommendedGaps(gaps)).toEqual(['Back'])
  })

  it('asks to save the sizes when only the size chart photo is there', () => {
    const gaps = viewGaps([state(KURTA[3]!, 'present')], { required: true, saved: false })
    expect(neededForApproval(gaps)).toEqual(['Size chart (save the sizes)'])
    expect(viewGaps([state(KURTA[3]!, 'present')], { required: true, saved: true })).toEqual([])
  })

  it('is empty while the checklist is off', () => {
    expect(viewGaps(undefined, null)).toEqual([])
  })
})

describe('newProductGaps', () => {
  it('counts the chosen photos and a typed chart', () => {
    const gaps = newProductGaps(KURTA, new Set(['front', 'back']), { hasChart: false })
    expect(neededForApproval(gaps)).toEqual(['Size chart'])
    expect(recommendedGaps(gaps)).toEqual(['Close-up'])
    expect(neededForApproval(newProductGaps(KURTA, new Set(['front']), { hasChart: true }))).toEqual([])
    expect(neededForApproval(newProductGaps(KURTA, new Set(['front', 'size_chart']), { hasChart: false }))).toEqual(['Size chart (save the sizes)'])
  })
})

describe('extra views', () => {
  it('names the views beyond the tiles that are not optional', () => {
    expect(extraViews(KURTA)).toEqual([])
    expect(extraViews(LAMP)).toEqual([{ label: 'Lifestyle', requirement: 'recommended', why: 'lifestyle why' }])
    expect(moreSubtitle(extraViews(LAMP), 'fallback')).toBe('Lifestyle recommended. Other photos optional.')
    expect(moreSubtitle([], 'fallback')).toBe('fallback')
  })

  it('shows the status of a lamp lifestyle photo, from the product read or the pending photos', () => {
    const states = LAMP.map((r) => state(r, r.view === 'lifestyle' ? 'missing' : 'present'))
    expect(moreSubtitle(extraViews(states), 'fallback')).toBe('Lifestyle recommended (not added yet). Other photos optional.')
    expect(moreSubtitle(extraViews(LAMP.map((r) => state(r, 'invalid'))), 'fallback')).toBe('Lifestyle recommended (needs a new photo). Other photos optional.')
    expect(moreSubtitle(extraViews(LAMP, undefined, new Set(['front', 'lifestyle'])), 'fallback')).toBe('Lifestyle recommended (added). Other photos optional.')
  })
})

describe('size flags', () => {
  it('ignores case and spaces, keeps order and names each size once', () => {
    expect(sizeFlags(['S', 'M', 'Free  Size', 'XL'], ['m', 'free size', 'XXL', 'xxl', '3XL'])).toEqual({ missing: ['XXL', '3XL'], unused: ['S', 'XL'] })
    expect(sizeFlags(['S', ''], [])).toEqual({ missing: [], unused: ['S'] })
  })

  it('rebuilds the variant sizes from the saved chart and its check, else the size run', () => {
    const p = { size_chart: { rows: [{ size: 'S' }, { size: 'M' }, { size: 'XL' }] }, size_chart_check: { required: true, saved: true, missing_sizes: ['L'], unused_sizes: ['XL'] }, size_run: ['s'] }
    expect(variantSizes(p)).toEqual(['S', 'M', 'L'])
    expect(variantSizes({ size_run: ['s', 'm'] })).toEqual(['s', 'm'])
    expect(variantSizes({})).toEqual([])
  })

  it('lists sizes in plain words', () => {
    expect(sizeList(['L'])).toBe('L')
    expect(sizeList(['S', 'M', 'L'])).toBe('S, M and L')
    expect(sizeList(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'])).toBe('1, 2, 3, 4, 5, 6, 7, 8 and 2 more')
  })
})
