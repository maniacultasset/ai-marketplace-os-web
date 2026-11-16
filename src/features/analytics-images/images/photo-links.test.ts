import { describe, expect, it } from 'vitest'
import { downloadingText, fromFileImageIds, linksFor, PHOTO_LINKS_POLL_MS, photoLinksDelay, summarizeLinks, type PhotoLink } from './photo-links'

const BLACK = '44444444-4444-4444-8444-444444444441'
const GONE = '44444444-4444-4444-8444-444444444449'
let n = 0
const link = (over: Partial<PhotoLink>): PhotoLink => ({
  link_id: `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
  position: 1,
  column: 'main_image',
  status: 'queued',
  retryable: false,
  ...over,
})

describe('product photo links (G2)', () => {
  it('files links by colour; no colour, or a colour the style no longer has, goes with the main section', () => {
    const none = link({})
    const black = link({ colourway_id: BLACK })
    const gone = link({ colourway_id: GONE })
    const ids = new Set([BLACK])
    expect(linksFor([none, black, gone], null, ids)).toEqual([none, gone])
    expect(linksFor([none, black, gone], BLACK, ids)).toEqual([black])
  })

  it('counts the waiting links and lists the failed and skipped ones in file order', () => {
    const s = summarizeLinks([
      link({ status: 'downloading' }),
      link({ status: 'queued' }),
      link({ status: 'failed', position: 3, retryable: true }),
      link({ status: 'skipped', position: 2, problem: 'removed_by_seller' }),
      link({ status: 'saved', image_id: 'i1' }),
    ])
    expect(s.waiting).toBe(2)
    expect(s.problems.map((l) => l.position)).toEqual([2, 3])
    expect(s.retryable).toBe(true)
    expect(summarizeLinks([link({ status: 'skipped', problem: 'removed_by_seller' })]).retryable).toBe(false)
  })

  it('tags only saved photos, and polls only while pending', () => {
    expect([...fromFileImageIds([link({ status: 'saved', image_id: 'i1' }), link({ status: 'failed', image_id: null })])]).toEqual(['i1'])
    expect(photoLinksDelay({ photo_links_pending: true })).toBe(PHOTO_LINKS_POLL_MS)
    expect(photoLinksDelay({ photo_links_pending: false })).toBe(false)
    expect(photoLinksDelay(null)).toBe(false)
    expect(downloadingText(1)).toBe('Downloading 1 photo from your file…')
    expect(downloadingText(3)).toBe('Downloading 3 photos from your file…')
  })
})
