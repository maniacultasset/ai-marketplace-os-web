import { describe, expect, it } from 'vitest'
import {
  attributeKind,
  attributeLabel,
  attributeText,
  bulletIndex,
  factLabel,
  fullyLocked,
  allowedText,
  attributeRows,
  fieldKey,
  keywordWhy,
  lengthText,
  limitsFrom,
  outsideSections,
  sectionRules,
  type ListingRequirements,
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

const AMAZON: ListingRequirements = {
  listing_id: 'l1',
  marketplace: 'amazon',
  category: 'ethnic_wear_kurta_sets',
  rules_version: 3,
  has_template: true,
  fields: [
    { path: 'content.title', max_chars: 200, min_chars: 5, banned_terms: ['best', 'guaranteed'], banned_count: 2, rules: [] },
    { path: 'content.bullets', max_items: 5, banned_count: 0 },
    { path: 'content.bullets[*]', max_chars: 500, banned_count: 0 },
    { path: 'content.description', max_chars: 2000, banned_count: 0 },
    { path: 'keywords.hidden_terms', max_bytes: 250, banned_count: 0 },
    { path: '*', banned_terms: ['best seller'], banned_count: 40, rules: ['No links, web addresses, emails or phone numbers.'] },
  ],
  attributes: [
    { key: 'color', level: 'required', allowed_count: 0 },
    { key: 'fabric_type', level: 'required', value_type: 'enum', allowed_values: ['Cotton', 'Silk', 'Rayon'], allowed_count: 3 },
    { key: 'fit', level: 'recommended', allowed_count: 0 },
    { key: 'sleeve', level: 'optional', allowed_count: 0 },
  ],
}
const FLIPKART: ListingRequirements = { ...AMAZON, marketplace: 'flipkart', fields: [{ path: 'content.title', max_chars: 150, banned_count: 0 }], attributes: [] }

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

  it('takes the marketplace limits from the requirements read, none without it', () => {
    expect(limitsFrom(AMAZON)).toEqual({ title: 200, bullets: 5, bullet: 500, description: 2000, hiddenBytes: 250 })
    expect(limitsFrom(FLIPKART)).toEqual({ title: 150, bullets: null, bullet: null, description: null, hiddenBytes: null })
    expect(limitsFrom(null)).toEqual({ title: null, bullets: null, bullet: null, description: null, hiddenBytes: null })
    expect(overLimit(201, 200, 'Amazon', 'characters')).toContain('Amazon allows 200 characters')
    expect(overLimit(200, 200, 'Amazon', 'characters')).toBeNull()
    expect(overLimit(9_999, null, 'Flipkart', 'characters')).toBeNull()
  })

  it('says each section’s rules in plain lines', () => {
    expect(lengthText({ path: 'content.title', max_chars: 200, min_chars: 5, banned_count: 0 })).toBe('up to 200 characters, at least 5 characters')
    const title = sectionRules('title', AMAZON)
    expect(title.lines).toEqual(['Up to 200 characters, at least 5 characters.', 'No links, web addresses, emails or phone numbers.'])
    expect(title.banned).toEqual([
      { label: 'Not allowed here', terms: ['best', 'guaranteed'], count: 2 },
      { label: 'Not allowed anywhere in the text', terms: ['best seller'], count: 40 },
    ])
    expect(sectionRules('bullets', AMAZON).lines).toEqual(['Up to 5 key features, each up to 500 characters.'])
    expect(sectionRules('description', AMAZON).lines).toEqual(['Up to 2,000 characters.'])
    expect(sectionRules('keywords', AMAZON).lines).toEqual(['Backend keywords: up to 250 bytes in all, counted with one space between terms.'])
    expect(sectionRules('bullets', FLIPKART)).toEqual({ lines: [], banned: [] })
    expect(sectionRules('title', null)).toEqual({ lines: [], banned: [] })
  })

  it('places a finding or a 422 path on its field', () => {
    expect(fieldKey('content.bullets.2')).toBe('content.bullets[2]')
    expect(fieldKey('content.bullets[2]')).toBe('content.bullets[2]')
    expect(fieldKey('keywords.hidden_terms[3]')).toBe('keywords.hidden_terms')
    expect(fieldKey('keywords.search_terms.0')).toBe('keywords.search_terms')
    expect(fieldKey('attributes.color.0')).toBe('attributes.color')
    expect(fieldKey('content.title')).toBe('content.title')
    expect(fieldKey(null)).toBeNull()
  })

  it('lists the attributes, then the required and recommended ones the listing lacks', () => {
    const rows = attributeRows({ pattern: 'solid', color: 'Blue' }, AMAZON, ['attributes.neckline'])
    expect(rows.map((r) => [r.key, r.value ?? null, r.requirement?.level ?? null])).toEqual([
      ['color', 'Blue', 'required'],
      ['pattern', 'solid', null],
      ['fabric_type', null, 'required'],
      ['fit', null, 'recommended'],
      ['neckline', null, null],
    ])
    expect(allowedText(AMAZON.attributes!.find((a) => a.key === 'fabric_type'), 2)).toBe('Cotton, Silk and 1 more')
    expect(allowedText(undefined)).toBe('')
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

  it('outsideSections keeps only the findings no section card shows, so none is listed twice', () => {
    const f = (field: string | null) => ({ field })
    const all = [
      f('content.title'),
      f('content.bullets[1]'),
      f('content.description'),
      f('keywords.hidden_terms'),
      f('attributes.color'),
      f('images[0]'),
      f('identity.gtin'),
      f(null),
    ]
    expect(outsideSections(all).map((x) => x.field)).toEqual(['images[0]', 'identity.gtin', null])
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
