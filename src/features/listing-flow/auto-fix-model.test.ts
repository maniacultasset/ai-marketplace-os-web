import { describe, expect, it } from 'vitest'
import type { Issue } from '@/features/inbox/model'
import { autoFixedChipText, autoFixedOn, autoFixTrail, autoFixView, fixedSummary, NO_TRAIL_TEXT, onVersion, siblingFixes, versionRef } from './auto-fix-model'

const V1 = '0b1c2d3e-0000-4000-8000-000000000301'
/** A fix row closed on version 1, before version 2 was written. */
const OLD = { listing_version_id: V1, resolved_at: '2026-11-07T08:00:01Z' }
const V2 = '0b1c2d3e-0000-4000-8000-000000000302'
/** Version 2 was written at 09:00; version 1 an hour earlier. */
const ON_V2 = { id: V2, createdAt: '2026-11-07T09:00:00Z' }

function issue(n: number, over: Partial<Issue> = {}): Issue {
  return {
    id: `0b1c2d3e-0000-4000-8000-${String(n).padStart(12, '0')}`,
    listing_id: '0b1c2d3e-0000-4000-8000-000000000201',
    listing_version_id: V2,
    status: 'auto_fixed',
    resolution: 'deterministic_fix',
    action_taken: 'Shortened the title at a word boundary from 212 to 198 characters to fit the 200-character limit.',
    auto_fixable: true,
    error_class: 'content_error',
    error_code: 'FIELD_TOO_LONG',
    field_path: 'content.title',
    message: 'Title is 212 characters; the limit is 200.',
    marketplace: 'amazon',
    occurrences: 1,
    retry_class: 'ai_correct',
    severity: 'error',
    source: 'rules_engine',
    created_at: '2026-11-07T09:00:00Z',
    first_seen_at: '2026-11-07T09:00:00Z',
    last_seen_at: '2026-11-07T09:00:00Z',
    resolved_at: '2026-11-07T09:00:01Z',
    updated_at: '2026-11-07T09:00:01Z',
    ...over,
  }
}

describe('autoFixedOn', () => {
  it('keeps only auto-fixed rows of the version under review', () => {
    const rows = [issue(1), issue(2, OLD), issue(3, { status: 'open' }), issue(4, { status: 'resolved' })]
    expect(autoFixedOn(rows, ON_V2).map((i) => i.id)).toEqual([rows[0]!.id])
  })

  it('counts an AI rewrite (resolved with ai_correction) as a fix, and no other resolved row', () => {
    const rows = [
      issue(1, { status: 'resolved', resolution: 'ai_correction' }),
      issue(2, { status: 'resolved', resolution: 'human_edit' }),
      issue(3, { status: 'resolved', resolution: 'regenerated' }),
      issue(4, { status: 'dismissed', resolution: 'accepted_warning' }),
    ]
    expect(autoFixedOn(rows, ON_V2).map((i) => i.id)).toEqual([rows[0]!.id])
  })

  it('keeps a row with no version (it cannot be placed, so it is not hidden)', () => {
    const rows = [issue(1, { listing_version_id: null }), issue(2, OLD)]
    expect(autoFixedOn(rows, ON_V2)).toHaveLength(1)
  })

  it('keeps every auto-fixed row when the listing has no version yet', () => {
    expect(autoFixedOn([issue(1), issue(2, { listing_version_id: V1 })], { id: null })).toHaveLength(2)
  })
})

describe('onVersion', () => {
  it('keeps a reused row with an older version id when it was closed during this version’s pass', () => {
    expect(onVersion({ listing_version_id: V1, resolved_at: '2026-11-07T09:00:00Z' }, ON_V2)).toBe(true)
    expect(onVersion({ listing_version_id: V1, resolved_at: '2026-11-07T09:00:02Z' }, ON_V2)).toBe(true)
  })

  it('leaves out a fix of an earlier version', () => {
    expect(onVersion({ listing_version_id: V1, resolved_at: '2026-11-07T08:00:01Z' }, ON_V2)).toBe(false)
  })

  it('needs both times to place a row by time', () => {
    expect(onVersion({ listing_version_id: V1, resolved_at: null }, ON_V2)).toBe(false)
    expect(onVersion({ listing_version_id: V1, resolved_at: '2026-11-07T09:00:02Z' }, { id: V2 })).toBe(false)
  })

  it('reads the version from a listing detail', () => {
    expect(versionRef({ current_version_id: V2, content: { created_at: '2026-11-07T09:00:00Z' } })).toEqual(ON_V2)
    expect(versionRef({ current_version_id: V2 })).toEqual({ id: V2, createdAt: null })
  })
})

describe('autoFixView', () => {
  it('says what was wrong, what changed, where and when', () => {
    expect(autoFixView(issue(1))).toEqual({
      id: issue(1).id,
      problem: 'Title is 212 characters; the limit is 200.',
      change: 'Shortened the title at a word boundary from 212 to 198 characters to fit the 200-character limit.',
      field: 'Title',
      fieldPath: 'content.title',
      at: '2026-11-07T09:00:01Z',
      rewritten: false,
    })
  })

  it('prefers the plain-language message and the bullet number', () => {
    const v = autoFixView(issue(1, { plain_message: ' Bullet 2 was too long. ', field_path: 'content.bullets[1]' }))
    expect(v.problem).toBe('Bullet 2 was too long.')
    expect(v.field).toBe('Bullet 2')
  })

  it('never invents a change when the trail sentence is missing', () => {
    expect(autoFixView(issue(1, { action_taken: null })).change).toBe(NO_TRAIL_TEXT)
    expect(autoFixView(issue(1, { action_taken: '   ' })).change).toBe(NO_TRAIL_TEXT)
  })

  it('marks an AI rewrite of the field, and falls back to last seen for the time', () => {
    const v = autoFixView(issue(1, { resolution: 'ai_correction', resolved_at: null }))
    expect(v.rewritten).toBe(true)
    expect(v.at).toBe('2026-11-07T09:00:00Z')
  })
})

describe('autoFixTrail', () => {
  it('lists the version’s fixes newest first', () => {
    const rows = [
      issue(1, { resolved_at: '2026-11-07T09:00:01Z' }),
      issue(2, { resolved_at: '2026-11-07T10:00:00Z', field_path: 'keywords.search_terms' }),
      issue(3, OLD),
    ]
    expect(autoFixTrail(rows, ON_V2).map((f) => f.field)).toEqual(['Search terms', 'Title'])
  })

  it('is empty when nothing was fixed', () => {
    expect(autoFixTrail([], ON_V2)).toEqual([])
  })
})

describe('siblingFixes', () => {
  it('lists the other batch listings that carry fixes, by marketplace', () => {
    const t = [
      { id: 'a', marketplace: 'amazon' },
      { id: 'f', marketplace: 'flipkart' },
      { id: 'm', marketplace: 'meesho' },
    ]
    const counts = new Map([
      ['a', 1],
      ['f', 2],
      ['m', 0],
    ])
    expect(siblingFixes(t, counts, 'a')).toEqual([{ listing: t[1], count: 2 }])
  })
})

describe('copy', () => {
  it('counts in plain words', () => {
    expect(fixedSummary(1)).toBe('1 issue fixed for you')
    expect(fixedSummary(2)).toBe('2 issues fixed for you')
    expect(autoFixedChipText(3)).toBe('3 auto-fixed')
  })
})
