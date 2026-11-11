import { describe, expect, it } from 'vitest'
import {
  addToList,
  cleanList,
  emptyVoiceDraft,
  isDraftEmpty,
  sameAsSaved,
  toVoiceBody,
  toVoiceDraft,
  voiceProblems,
  voiceSummary,
  type VoiceDraft,
} from './voice-model'

const full = (): VoiceDraft => ({
  description: ' Hand-block printed cotton wear from Jaipur. ',
  audience: 'women 25 to 40 who want easy office wear',
  price_segment: 'mid',
  positioning: 'everyday handloom, made to last',
  differentiators: ['Hand-block printed', 'Pre-washed cotton'],
  words_to_use: ['breathable', 'easy care'],
  words_to_avoid: ['cheap'],
  claim_limits: ['No organic claims'],
  example_copy: 'Soft cotton that keeps its shape.',
})

describe('voice model', () => {
  it('builds the PATCH body: trimmed text, cleaned lists, nothing answered is no voice', () => {
    const body = toVoiceBody({ ...full(), words_to_use: [' soft ', 'Soft', '', 'airy'] })
    expect(body.brand_description).toBe('Hand-block printed cotton wear from Jaipur.')
    expect(body.brand_voice?.words_to_use).toEqual(['soft', 'airy'])
    expect(body.brand_voice?.price_segment).toBe('mid')
    expect(toVoiceBody(emptyVoiceDraft())).toEqual({ brand_description: null, brand_voice: null })
    expect(toVoiceBody({ ...emptyVoiceDraft(), audience: '   ' }).brand_voice).toBeNull()
  })

  it('reads a saved profile back into a draft and round-trips', () => {
    const saved = toVoiceBody(full())
    const draft = toVoiceDraft(saved)
    expect(toVoiceBody(draft)).toEqual(saved)
    expect(toVoiceDraft(undefined)).toEqual(emptyVoiceDraft())
    expect(isDraftEmpty(toVoiceDraft({ brand_description: null, brand_voice: null }))).toBe(true)
    expect(isDraftEmpty({ ...emptyVoiceDraft(), description: 'Cotton' })).toBe(false)
    expect(sameAsSaved({ ...draft, audience: `${draft.audience}  ` }, draft)).toBe(true)
    expect(sameAsSaved({ ...draft, audience: 'students' }, draft)).toBe(false)
  })

  it('adds list items once, in any case, and never a blank one', () => {
    expect(addToList(['Soft'], 'soft')).toEqual(['Soft'])
    expect(addToList(['Soft'], '  ')).toEqual(['Soft'])
    expect(addToList(['Soft'], ' airy ')).toEqual(['Soft', 'airy'])
    expect(cleanList(['a', 'A', ' b'])).toEqual(['a', 'b'])
  })

  it('flags what the backend would refuse', () => {
    expect(voiceProblems(full())).toEqual({})
    const bad = voiceProblems({
      ...full(),
      audience: 'x'.repeat(301),
      words_to_avoid: ['x'.repeat(61)],
      claim_limits: Array.from({ length: 16 }, (_, i) => `claim ${i}`),
    })
    expect(Object.keys(bad).sort()).toEqual(['audience', 'claim_limits', 'words_to_avoid'])
  })

  it('reads back one short line per answer, in step order, skipping the unanswered', () => {
    const lines = voiceSummary(full())
    expect(lines.map((l) => l.label)).toEqual([
      'Your brand',
      'Writes for',
      'Price',
      'Presents it as',
      'Brings out',
      'Uses words like',
      'Never uses',
      'Never claims',
      'Sounds like',
    ])
    expect(lines.find((l) => l.label === 'Brings out')?.text).toBe('Hand-block printed and Pre-washed cotton')
    expect(lines.find((l) => l.label === 'Uses words like')?.text).toBe('“breathable” and “easy care”')
    expect(lines.find((l) => l.label === 'Price')?.text).toBe('Mid: fair price, everyday quality')
    expect(voiceSummary({ ...emptyVoiceDraft(), words_to_avoid: ['cheap'] })).toEqual([
      { step: 'words', label: 'Never uses', text: '“cheap”' },
    ])
    expect(voiceSummary(emptyVoiceDraft())).toEqual([])
  })
})
