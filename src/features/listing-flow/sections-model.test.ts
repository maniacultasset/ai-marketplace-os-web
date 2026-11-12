import { describe, expect, it } from 'vitest'
import {
  attributeKind,
  attributeLabel,
  attributeText,
  bulletIndex,
  factLabel,
  fullyLocked,
  keywordWhy,
  limitsFor,
  overLimit,
  parseAttribute,
  sectionList,
  sectionLocks,
  sectionOf,
  sectionPatch,
  splitTerms,
  unlockPatch,
  utf8Bytes,
  validateBullets,
  validateTerms,
  validateTitle,
} from './sections-model'

const canonical = {
  content: { title: 'T', bullets: ['A', 'B'], description: 'D' },
  keywords: { search_terms: ['s'], hidden_terms: ['h'] },
  attributes: { pattern: 'solid' },
}

describe('sections model', () => {
  it('maps findings and locks to their section', () => {
    expect(sectionOf('content.title')).toBe('title')
    expect(sectionOf('content.bullets[3]')).toBe('bullets')
    expect(sectionOf('keywords.hidden_terms')).toBe('keywords')
    expect(sectionOf('attributes.color')).toBe('attributes')
    expect(sectionOf('images[0]')).toBeNull()
    expect(bulletIndex('content.bullets[3]')).toBe(3)
    expect(bulletIndex('content.bullets')).toBeNull()
    const locked = ['content.title', 'attributes.fit', 'keywords.search_terms']
    expect(sectionLocks('title', locked)).toEqual(['content.title'])
    expect(sectionLocks('attributes', locked)).toEqual(['attributes.fit'])
    expect(sectionLocks('description', locked)).toEqual([])
  })

  it('says a section is fully locked like the backend (attributes never is)', () => {
    expect(fullyLocked('title', ['content.title'])).toBe(true)
    expect(fullyLocked('keywords', ['keywords.search_terms'])).toBe(false)
    expect(fullyLocked('keywords', ['keywords.search_terms', 'keywords.hidden_terms'])).toBe(true)
    expect(fullyLocked('attributes', ['attributes.fit'])).toBe(false)
    expect(fullyLocked('title', null)).toBe(false)
  })

  it('names the affected sections in card order', () => {
    expect(sectionList(['bullets', 'title'])).toBe('Title and Key features')
    expect(sectionList(['attributes', 'title', 'keywords'])).toBe('Title, Search terms and Attributes')
    expect(sectionList(['description'])).toBe('Description')
  })

  it('takes the marketplace limits, the hard caps elsewhere', () => {
    expect(limitsFor('amazon')).toMatchObject({ title: 200, bullets: 5, bullet: 500, description: 2000, hiddenBytes: 250 })
    expect(limitsFor('flipkart')).toMatchObject({ title: 150, bullets: 10, hiddenBytes: null })
    expect(overLimit(201, 200, 'Amazon', 'characters')).toContain('Amazon allows 200 characters')
    expect(overLimit(200, 200, 'Amazon', 'characters')).toBeNull()
  })

  it('validates text, bullets and terms', () => {
    expect(validateTitle('  ')).toBe('Write a title.')
    expect(validateTitle('ok')).toBeUndefined()
    expect(validateBullets(['', ' '])).toEqual({ list: 'Write at least one key feature.', items: {} })
    expect(validateBullets(['x'.repeat(1001), 'ok']).items).toHaveProperty('0')
    expect(validateBullets(Array.from({ length: 11 }, () => 'b')).list).toBe('Use 10 key features or fewer.')
    expect(validateTerms(Array.from({ length: 51 }, () => 't'))).toBe('Use 50 terms or fewer.')
    expect(splitTerms('a, b\n c,,')).toEqual(['a', 'b', 'c'])
    expect(utf8Bytes('कुर्ता')).toBe(18)
  })

  it('reads and parses attribute values in their own type', () => {
    expect(attributeKind(2)).toBe('number')
    expect(attributeKind(true)).toBe('boolean')
    expect(attributeKind(['a'])).toBe('list')
    expect(attributeText(['a', 'b'])).toBe('a, b')
    expect(attributeText(false)).toBe('No')
    expect(parseAttribute('number', '2.5')).toEqual({ value: 2.5 })
    expect(parseAttribute('number', 'two').error).toBe('Enter a number.')
    expect(parseAttribute('list', 'red, blue')).toEqual({ value: ['red', 'blue'] })
    expect(parseAttribute('boolean', 'Yes')).toEqual({ value: true })
    expect(parseAttribute('text', ' ').error).toBe('Enter a value.')
    expect(attributeLabel('fabric_type')).toBe('Fabric type')
  })

  it('builds a save body with only one section changed, and an unlock body with none', () => {
    expect(sectionPatch(canonical, { section: 'title', title: ' New ' })).toEqual({ content: { title: 'New', bullets: ['A', 'B'], description: 'D' } })
    expect(sectionPatch(canonical, { section: 'bullets', bullets: [' A ', '', 'C'] }).content.bullets).toEqual(['A', 'C'])
    expect(sectionPatch(canonical, { section: 'keywords', searchTerms: ['x'], hiddenTerms: [] })).toEqual({
      content: canonical.content,
      keywords: { search_terms: ['x'], hidden_terms: [] },
    })
    expect(sectionPatch(canonical, { section: 'attributes', attributes: { pattern: 'striped' } }).attributes).toEqual({ pattern: 'striped' })
    expect(unlockPatch(canonical, ['content.title'])).toEqual({ content: canonical.content, unlock: ['content.title'] })
  })
})

describe('why these search terms', () => {
  const reasons = [
    {
      term: 'cotton kurta set',
      reason: 'Names the fabric and the product type.',
      source: 'product_facts' as const,
      fact_keys: ['attributes.fabric_type', 'identity.gender'],
      used_in: ['title' as const, 'bullets' as const, 'backend' as const],
    },
    { term: 'kurta for office', reason: 'How shoppers ask for work wear.', source: 'search_intent' as const, used_in: ['backend' as const] },
    { term: 'kurta set', reason: 'The usual name.', source: 'category' as const, fact_keys: [], used_in: [] },
    { term: 'dropped term', reason: 'No longer listed.', source: 'category' as const },
  ]

  it('lists a row per listed term with a reason, in the card order', () => {
    const rows = keywordWhy(reasons, ['kurta for office', 'cotton kurta set', 'seller term', 'kurta set'])
    expect(rows.map((r) => r.term)).toEqual(['kurta for office', 'cotton kurta set', 'kurta set'])
    expect(rows[1]).toEqual({
      term: 'cotton kurta set',
      why: 'Names the fabric and the product type.',
      source: 'From your product: Fabric type and Gender',
      usedIn: 'Used in the title, key features and backend keywords',
    })
    expect(rows[0]!.source).toBe('How shoppers search')
    expect(rows[0]!.usedIn).toBe('Used in backend keywords')
    expect(rows[2]!.source).toBe('Usual for this category')
    expect(rows[2]!.usedIn).toBe('Not used yet')
  })

  it('shows nothing without reasons and never repeats a term', () => {
    expect(keywordWhy(undefined, ['kurta'])).toEqual([])
    expect(keywordWhy([], ['kurta'])).toEqual([])
    expect(keywordWhy(reasons, ['kurta set', 'kurta set'])).toHaveLength(1)
  })

  it('names product facts in plain words', () => {
    expect(factLabel('attributes.sleeve_length')).toBe('Sleeve length')
    expect(factLabel('identity.brand_name')).toBe('Brand')
    expect(factLabel('identity.gender')).toBe('Gender')
  })
})
