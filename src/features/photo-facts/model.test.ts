import { describe, expect, it } from 'vitest'
import { confidenceWords, factLabel, factValueText, groupPhotoFacts, photoGroupKeys, photoSourceLabel, toCheckCount, withPending, type PhotoFact } from './model'

const IMG1 = '00000000-0000-4000-8000-000000000501'
const IMG2 = '00000000-0000-4000-8000-000000000502'
const IMG3 = '00000000-0000-4000-8000-000000000503'

const fact = (key: string, value: PhotoFact['value'], over: Partial<PhotoFact> = {}): PhotoFact => ({
  key,
  value,
  confidence: 0.8,
  image_id: IMG1,
  confirmed: false,
  confirmed_at: null,
  ...over,
})

const details = [
  { image_id: IMG1, slot: 'main' as const, position: 0, status: 'ready', origin: 'seller' as const, compliance_status: 'passed' as const },
  { image_id: IMG2, slot: 'secondary' as const, position: 1, status: 'ready', origin: 'seller' as const, compliance_status: 'passed' as const },
  { image_id: IMG3, slot: 'secondary' as const, position: 2, status: 'ready', origin: 'seller' as const, compliance_status: 'passed' as const },
]

describe('confidenceWords', () => {
  it('uses the backend steps: 0.90 clear, 0.70 written, below that unsure', () => {
    expect(confidenceWords(0.95)).toBe('Clearly')
    expect(confidenceWords(0.9)).toBe('Clearly')
    expect(confidenceWords(0.89)).toBe('Looks like')
    expect(confidenceWords(0.7)).toBe('Looks like')
    expect(confidenceWords(0.69)).toBe('Maybe')
  })
})

describe('labels and values', () => {
  it('names the photo keys in plain words, and any other key as words', () => {
    expect(factLabel('garment_length')).toBe('Length')
    expect(factLabel('number_of_pieces')).toBe('Pieces')
    expect(factLabel('kurta_type')).toBe('Kurta type')
  })
  it('prints values as the seller reads them', () => {
    expect(factValueText('v-neck')).toBe('V-neck')
    expect(factValueText(true)).toBe('Yes')
    expect(factValueText(3)).toBe('3')
    expect(factValueText('  ')).toBe('')
    expect(factValueText(null)).toBe('')
  })
})

describe('photoSourceLabel', () => {
  it('names the slot, with a number only when the slot has more than one photo', () => {
    expect(photoSourceLabel(IMG1, details)).toBe('Front photo')
    expect(photoSourceLabel(IMG2, details)).toBe('Secondary photo 1')
    expect(photoSourceLabel(IMG3, details)).toBe('Secondary photo 2')
  })
  it('names Back and Close-up photos by their role (SI12)', () => {
    const withRoles = [
      ...details!,
      { ...details![1]!, image_id: 'b', role: 'back' as const },
      { ...details![1]!, image_id: 'c', role: 'close_up' as const },
    ]
    expect(photoSourceLabel('b', withRoles)).toBe('Back photo')
    expect(photoSourceLabel('c', withRoles)).toBe('Close-up photo')
    // Plain secondaries still count among themselves only.
    expect(photoSourceLabel(IMG3, withRoles)).toBe('Secondary photo 2')
  })
  it('is null for a photo no longer on the product', () => {
    expect(photoSourceLabel('00000000-0000-4000-8000-000000000999', details)).toBeNull()
    expect(photoSourceLabel(IMG1, undefined)).toBeNull()
  })
})

describe('groupPhotoFacts', () => {
  it('is empty when the photos gave nothing, even with seller values for photo keys', () => {
    expect(groupPhotoFacts({ attributes: { neckline: 'round neck' }, photo_facts: [] })).toEqual([])
    expect(groupPhotoFacts({ attributes: { neckline: 'round neck' } })).toEqual([])
  })

  it('lists photo values to check first, then confirmed, then the seller’s own as You, each in key order', () => {
    const rows = groupPhotoFacts({
      attributes: { neckline: 'v-neck', fit: 'slim fit', occasion: 'festive', sleeve_length: 'full sleeve', fabric_type: 'cotton' },
      photo_facts: [fact('occasion', 'festive', { confirmed: true }), fact('neckline', 'v-neck', { confidence: 0.95 }), fact('fit', 'slim fit')],
      image_details: details,
    })
    expect(rows.map((r) => [r.key, r.status])).toEqual([
      ['neckline', 'photo'],
      ['fit', 'photo'],
      ['occasion', 'confirmed'],
      ['sleeve_length', 'you'],
    ])
    expect(rows[0]).toMatchObject({ label: 'Neckline', value: 'V-neck', confidence: 0.95, photo: 'Front photo' })
    // A non-photo key (fabric type) never joins the group.
    expect(rows.some((r) => r.key === 'fabric_type')).toBe(false)
  })

  it('never repeats the seller’s colour, which has its own row', () => {
    const rows = groupPhotoFacts({ attributes: { color: 'red', fit: 'slim fit' }, photo_facts: [fact('fit', 'slim fit')] })
    expect(rows.map((r) => r.key)).toEqual(['fit'])
  })

  it('keeps a photo colour in the group, so it can be confirmed', () => {
    const rows = groupPhotoFacts({ attributes: { color: 'maroon' }, photo_facts: [fact('color', 'maroon')] })
    expect(rows.map((r) => [r.key, r.status])).toEqual([['color', 'photo']])
    expect(photoGroupKeys(rows)).toEqual(new Set(['color']))
  })
})

describe('withPending (optimistic rows)', () => {
  const rows = groupPhotoFacts({
    attributes: { pattern: 'solid' },
    photo_facts: [fact('neckline', 'v-neck'), fact('fit', 'slim fit')],
  })

  it('shows a confirm at once and hides a reject', () => {
    const next = withPending(rows, { neckline: 'confirm', fit: 'reject' })
    expect(next.map((r) => [r.key, r.status])).toEqual([
      ['neckline', 'confirmed'],
      ['pattern', 'you'],
    ])
    expect(toCheckCount(next)).toBe(0)
  })

  it('never touches the seller’s own value', () => {
    expect(withPending(rows, { pattern: 'reject' }).some((r) => r.key === 'pattern')).toBe(true)
  })

  it('goes back to the server rows when nothing is pending (rollback)', () => {
    expect(withPending(rows, {})).toEqual(rows)
    expect(toCheckCount(rows)).toBe(2)
  })
})
