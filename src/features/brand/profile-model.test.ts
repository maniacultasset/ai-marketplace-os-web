import { describe, expect, it } from 'vitest'
import { checkDocumentFile } from './documents-model'
import { emptyGlossaryRow, emptyGuideline, fieldLength, NAME_MAX, TONE_MAX, validateDraft, type ProfileDraft } from './profile-model'

const draft = (over: Partial<ProfileDraft> = {}): ProfileDraft => ({ name: 'Loomline', tone: '', guidelines: [], glossary: [], ...over })

describe('validateDraft: brand name', () => {
  it('accepts real brand names, digits and punctuation included', () => {
    for (const name of ['boAt 2.0', '7 Seas', 'H&M', "Levi's", 'Marks & Spencer', 'फैब इंडिया', 'Zoë Studio', 'Brand™'])
      expect(validateDraft(draft({ name })).name).toBeUndefined()
  })

  it('rejects a blank name or one with no letters', () => {
    expect(validateDraft(draft({ name: '   ' })).name).toBe('Enter the brand name.')
    expect(validateDraft(draft({ name: '12345' })).name).toBe('Include at least one letter in the brand name, not only numbers or symbols.')
    expect(validateDraft(draft({ name: '!!!' })).name).toMatch(/at least one letter/)
  })

  it('rejects emoji, angle brackets and control characters', () => {
    expect(validateDraft(draft({ name: 'Loom 🙂' })).name).toMatch(/common punctuation/)
    expect(validateDraft(draft({ name: '<b>Loom</b>' })).name).toMatch(/common punctuation/)
    expect(validateDraft(draft({ name: 'Loom\u0000line' })).name).toMatch(/control character/)
  })

  it('counts length in code points, as the backend does', () => {
    expect(validateDraft(draft({ name: 'क'.repeat(NAME_MAX) })).name).toBeUndefined()
    expect(validateDraft(draft({ name: 'a'.repeat(NAME_MAX + 1) })).name).toMatch(/200 characters or fewer/)
    expect(fieldLength(' 𝒜𝒜 ')).toBe(2)
  })

  it('never blocks a name that is already saved, beyond blank and length', () => {
    const base = { name: '12345' }
    expect(validateDraft(draft({ name: '12345' }), base).name).toBeUndefined()
    expect(validateDraft(draft({ name: '123456' }), base).name).toMatch(/at least one letter/)
    expect(validateDraft(draft({ name: '' }), base).name).toBe('Enter the brand name.')
  })
})

describe('validateDraft: voice', () => {
  it('limits the tone and allows line breaks', () => {
    expect(validateDraft(draft({ tone: 'Warm.\nPlain, no hype.' })).tone).toBeUndefined()
    expect(validateDraft(draft({ tone: 'x'.repeat(TONE_MAX + 1) })).tone).toMatch(/2000 characters or fewer/)
    expect(validateDraft(draft({ tone: 'Warm\u0007' })).tone).toMatch(/control character/)
  })

  it('checks each guideline and glossary term', () => {
    const g = { ...emptyGuideline(), text: 'x'.repeat(501) }
    const r = { ...emptyGlossaryRow(), avoid: 'kurta outfit', use: '' }
    const dup = { ...emptyGlossaryRow(), avoid: 'kurta outfit', use: 'kurta set' }
    const e = validateDraft(draft({ guidelines: [g], glossary: [r, dup] }))
    expect(e[`guidelines.${g.id}`]).toMatch(/500 characters or fewer/)
    expect(e[`glossary.${r.id}.use`]).toBe('Enter the term to use instead.')
    expect(e[`glossary.${dup.id}.avoid`]).toMatch(/already in the glossary/)
    expect(validateDraft(draft({ glossary: [emptyGlossaryRow()] }))).toEqual({})
  })
})

describe('checkDocumentFile', () => {
  it('accepts .txt and .md up to 10 MiB, refuses the rest', () => {
    expect(checkDocumentFile({ name: 'voice.md', size: 10 })).toBeNull()
    expect(checkDocumentFile({ name: 'voice.pdf', size: 10 })).toBe('Choose a .txt or .md file.')
    expect(checkDocumentFile({ name: 'voice.txt', size: 0 })).toMatch(/empty/)
    expect(checkDocumentFile({ name: 'voice.txt', size: 10_485_761 })).toMatch(/10 MiB/)
    expect(checkDocumentFile({ name: `${'क'.repeat(251)}.txt`, size: 1 })).toBeNull()
  })
})
