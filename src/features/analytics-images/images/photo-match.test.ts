import { describe, expect, it } from 'vitest'
import { PHOTO_MATCH_POLL_MS, photoMatchDelay } from '@/features/products/photo-reading'
import { matchNote, matchTile, openQuestions, type PhotoMatch } from './photo-match'

const m = (status: PhotoMatch['status'], extra: Partial<PhotoMatch> = {}): PhotoMatch => ({
  status,
  colour: 'Green',
  product_match: 0.9,
  colour_match: 0.1,
  seen_colour: null,
  reason: null,
  question: null,
  checked_at: null,
  kept: false,
  kept_at: null,
  kept_by_user_id: null,
  ...extra,
})

describe('photo match words (client feedback item 9)', () => {
  it('says each state in plain words', () => {
    expect(matchNote(m('checking'))).toEqual({ tone: 'busy', text: 'Checking it shows Green…', ask: null })
    expect(matchNote(m('checking', { colour: null }))?.text).toBe('Checking it shows this product…')
    expect(matchNote(m('match'))?.text).toBe('Shows Green')
    expect(matchNote(m('match', { colour: null }))?.text).toBe('Shows this product')
    expect(matchNote(m('failed'))?.text).toBe('Not checked for colour')
    expect(matchNote(null)).toBeNull()
    expect(matchNote(undefined)).toBeNull()
  })

  it('asks on a mismatch (blocking) and an unsure photo (not blocking)', () => {
    const mismatch = matchNote(m('mismatch', { question: 'Is this photo the Green Kurta?', reason: 'A red kurta.', seen_colour: 'red' }))
    expect(mismatch?.tone).toBe('warn')
    expect(mismatch?.ask).toEqual({ question: 'Is this photo the Green Kurta?', detail: 'A red kurta. It looks red.', blocks: true })
    const unsure = matchNote(m('unsure'))
    expect(unsure?.ask).toEqual({ question: 'Is this photo Green?', detail: null, blocks: false })
  })

  it('stops asking once the seller kept the photo', () => {
    expect(matchNote(m('mismatch', { kept: true }))).toEqual({ tone: 'muted', text: 'You kept this photo', ask: null })
    expect(matchTile(m('mismatch', { kept: true }))).toBeNull()
  })

  it('gives a tile line only while checking or asking', () => {
    expect(matchTile(m('checking'))).toEqual({ status: 'Checking colour…', tone: 'busy' })
    expect(matchTile(m('unsure'))).toEqual({ status: 'Check this photo below', tone: 'warn' })
    expect(matchTile(m('match'))).toBeNull()
    expect(matchTile(m('failed'))).toBeNull()
    expect(matchTile(null)).toBeNull()
  })

  it('counts the open questions', () => {
    expect(openQuestions([m('mismatch'), m('unsure'), m('unsure', { kept: true }), m('match'), null, undefined])).toBe(2)
  })

  it('polls the product while a check runs', () => {
    const d = (photo_match: PhotoMatch | null) => ({ photo_match }) as never
    expect(photoMatchDelay({ image_details: [d(m('checking'))] })).toBe(PHOTO_MATCH_POLL_MS)
    expect(photoMatchDelay({ image_details: [d(m('match')), d(null)] })).toBe(false)
    expect(photoMatchDelay(undefined)).toBe(false)
  })
})
