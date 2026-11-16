import { describe, expect, it } from 'vitest'
import { redraftMany, redraftOutcome } from './api'
import {
  answerable,
  answerSummary,
  brandListings,
  chunks,
  countsAgree,
  distinctListings,
  distinctProducts,
  groupMeta,
  groupTitle,
  groupsTotal,
  memberIndex,
  memberItems,
  mergeAnswers,
  normalizeGroups,
  recheckSummary,
  heldReason,
  aRole,
  brandRole,
  canRedraftItem,
  checkOnlyPlan,
  fullPlan,
  redraftPlan,
  redraftSummary,
  redraftTargets,
  singleItem,
  viewCount,
  type GroupMember,
  type InboxGroup,
} from './model'
import { ApiError } from '@/api/errors'

const AT = '2026-11-15T09:30:00Z'
const U = (n: number) => `0b1c2d3e-0000-4000-8000-${String(n).padStart(12, '0')}`

const member = (i: number, over: Partial<GroupMember> = {}): GroupMember => ({
  task_id: U(1000 + i),
  product_id: U(100 + i),
  sku: `KTEST-${String(i).padStart(3, '0')}`,
  title: `Kurta ${i}`,
  listing_ids: [U(200 + i)],
  has_value: false,
  at: AT,
  issue_ids: [],
  items: 1,
  ...over,
})

const group = (over: Partial<InboxGroup> = {}): InboxGroup => ({
  key: 't|missing_fact|facts.gender|503f4d45ede0',
  item_kind: 'task',
  scope: 'product_fact',
  count: 3,
  products: 3,
  listings: 3,
  blocking: true,
  at: AT,
  field: 'gender',
  task_kind: 'missing_fact',
  answer: { kind: 'enum', allowed_values: ['women', 'men', 'unisex'] },
  categories: ['kurta_sets'],
  brand_value_set: false,
  members: [member(1), member(2), member(3)],
  members_more: false,
  ...over,
})

const inbox = { open_items: 46, questions: 40, blocking_questions: 30, issues: 9, issues_without_question: 6 }

describe('card copy', () => {
  it('titles each kind the seller way', () => {
    expect(groupTitle(group({ scope: 'brand', field: 'manufacturer', products: 34 }))).toBe('34 products need a manufacturer')
    expect(groupTitle(group({ scope: 'exemption', field: 'identifier', products: 34 }))).toBe('34 products need a barcode')
    expect(groupTitle(group({ products: 12 }))).toBe('12 products need the gender')
    expect(groupTitle(group({ field: 'hsn_code', products: 2 }))).toBe('2 products need the HSN code')
    expect(groupTitle(group({ field: 'color', products: 1 }))).toBe('1 product needs the colour')
    expect(groupTitle(group({ scope: 'per_item', task_kind: 'image_replacement', field: 'images[]', count: 34 }))).toBe('34 photos need replacing')
    expect(groupTitle(group({ item_kind: 'issue', scope: 'per_item', error_code: 'VALUE_NOT_ALLOWED', listings: 5, field: 'facts.color' }))).toBe(
      '5 listings: Value not allowed',
    )
  })
  it('says whether a group blocks or improves listings, and the marketplace for issues', () => {
    expect(groupMeta(group({ listings: 68 }))).toBe('Blocks 68 listings')
    expect(groupMeta(group({ blocking: false, listings: 12 }))).toBe('Improves 12 listings')
    expect(groupMeta(group({ item_kind: 'issue', listings: 1, marketplace: 'amazon', field: null }))).toBe('Blocks 1 listing · Amazon')
    expect(groupMeta(group({ listings: 0 }))).toBe('')
  })
})

describe('counts (B16: one definition)', () => {
  it('Σ count is total_items and total_items is the summary count for the view', () => {
    const groups = [group({ count: 34 }), group({ key: 'b', count: 12 })]
    expect(groupsTotal(groups)).toBe(46)
    expect(viewCount(inbox, 'all')).toBe(46)
    expect(viewCount(inbox, 'questions')).toBe(40)
    expect(viewCount(inbox, 'issues')).toBe(9)
    expect(countsAgree({ groups, total_items: 46, more: false }, inbox, 'all')).toBe(true)
    expect(countsAgree({ groups, total_items: 47, more: false }, inbox, 'all')).toBe(false)
    // A cut list adds up to less; total_items still matches the summary.
    expect(countsAgree({ groups: groups.slice(0, 1), total_items: 46, more: true }, inbox, 'all')).toBe(true)
    expect(countsAgree({ groups, total_items: 46, more: false }, inbox, 'questions')).toBe(false)
    expect(countsAgree({ groups, total_items: 46, more: false }, undefined, 'all')).toBe(true)
  })
})

describe('members', () => {
  it('a group of one is its item; members index by item key', () => {
    const task = { id: U(1001), created_at: AT } as InboxGroup['sample_task']
    expect(singleItem(group({ count: 1, sample_task: task }))).toMatchObject({ kind: 'task', id: U(1001) })
    expect(singleItem(group({ count: 2, sample_task: task }))).toBeNull()
    const issue = { id: U(9), last_seen_at: AT } as InboxGroup['sample_issue']
    expect(singleItem(group({ count: 1, item_kind: 'issue', sample_issue: issue }))).toMatchObject({ kind: 'issue', id: U(9) })
    const idx = memberIndex([group()])
    expect(idx.get(`task:${U(1002)}`)?.member.sku).toBe('KTEST-002')
    expect(idx.size).toBe(3)
  })
  it('a listing row of an issue group indexes every issue it stands for, and says how many', () => {
    const row = member(1, { task_id: null, issue_id: U(11), issue_ids: [U(11), U(12)], items: 2 })
    const g = group({ item_kind: 'issue', scope: 'per_item', field: 'listing', count: 2, listings: 1, members: [row] })
    const idx = memberIndex([g])
    expect(idx.get(`issue:${U(11)}`)?.member).toBe(row)
    expect(idx.get(`issue:${U(12)}`)?.member).toBe(row)
    expect(memberItems(g, row)).toBe('2 issues')
    expect(memberItems({ ...g, field: 'images[]' }, row)).toBe('2 photos needed')
    // Prod 16 Nov: the front and the size chart missing are IMAGE_NON_COMPLIANT at `listing`.
    expect(memberItems({ ...g, field: 'listing', error_code: 'IMAGE_NON_COMPLIANT' }, row)).toBe('2 photos needed')
    expect(memberItems({ ...g, field: 'listing', error_code: 'VALUE_NOT_ALLOWED' }, row)).toBe('2 issues')
    expect(memberItems(g, member(2))).toBeNull()
    expect(memberItems(group(), { items: 2 })).toBeNull()
  })
  it('answers only open questions without their own value, never a kept one', () => {
    const g = group({ members: [member(1), member(2, { has_value: true }), member(3, { task_id: null, issue_id: U(5) })] })
    expect(answerable(g.members).map((m) => m.sku)).toEqual(['KTEST-001'])
    expect(distinctProducts(g.members)).toBe(3)
    expect(distinctListings([member(1, { listing_ids: [U(1), U(2)] }), member(2, { listing_ids: [U(2)] })])).toBe(2)
    expect(brandListings(g.members)).toEqual([U(201), U(203)])
  })
  it('fills the lists the contract defaults', () => {
    const old = { ...member(2, { task_id: null, issue_id: U(7) }), issue_ids: undefined, items: undefined }
    const raw = { enabled: true, as_of: AT, view: 'all', total_items: 1, more: false, groups: [{ ...group(), members: [{ ...member(1), listing_ids: undefined, issue_ids: undefined, items: undefined }, old], categories: undefined }] }
    const g = normalizeGroups(raw as never).groups[0]!
    expect(g.categories).toEqual([])
    expect(g.members[0]!.listing_ids).toEqual([])
    expect([g.members[0]!.issue_ids, g.members[0]!.items]).toEqual([[], 1])
    expect([g.members[1]!.issue_ids, g.members[1]!.items]).toEqual([[U(7)], 1])
    expect(normalizeGroups({ ...raw, groups: undefined } as never).groups).toEqual([])
  })
})

describe('answer', () => {
  it('chunks 100 ids per request, the same selection always the same chunks', () => {
    const ids = Array.from({ length: 234 }, (_, i) => U(5000 + i))
    const c = chunks([...ids].reverse())
    expect(c.map((x) => x.length)).toEqual([100, 100, 34])
    expect(c).toEqual(chunks(ids))
    expect(chunks([U(1), U(1)])).toEqual([[U(1)]])
  })
  it('merges chunk answers and keeps each listing once', () => {
    const l = { listing_id: U(201), product_id: U(101), marketplace: 'amazon' as const, status: 'approved', redraft: true, sections: ['title' as const] }
    const m = mergeAnswers([
      { applied: [{ task_id: U(1), product_id: U(101) }], skipped: [], listings: [l] },
      { applied: [], skipped: [{ task_id: U(2), product_id: U(102), reason: 'has_value' }], listings: [l, { ...l, listing_id: U(202), redraft: false }] },
    ])
    expect(m.applied).toHaveLength(1)
    expect(m.skipped).toHaveLength(1)
    expect(m.listings).toHaveLength(2)
    expect(redraftTargets(m.listings)).toEqual([U(201)])
  })
  it('says what was saved and what was kept', () => {
    const r = {
      applied: Array.from({ length: 31 }, (_, i) => ({ task_id: U(i), product_id: U(100 + i) })),
      skipped: [
        { task_id: U(90), product_id: U(190), reason: 'has_value' as const },
        { task_id: U(91), product_id: U(191), reason: 'not_allowed' as const },
      ],
      listings: [],
    }
    expect(answerSummary(r, 2)).toBe('Saved for 31 products. 3 already had a value and were kept.')
    expect(answerSummary({ ...r, skipped: [] })).toBe('Saved for 31 products.')
    expect(answerSummary({ applied: [], skipped: [], listings: [] })).toBe('Nothing was saved.')
    expect(answerSummary(r, 0, 'exemption')).toBe('Marked as exempt for 31 products. 1 has a barcode and was kept.')
  })
})

describe('redraft', () => {
  it('sums up started, waiting, busy and what to try again', () => {
    const rs = [
      ...Array.from({ length: 32 }, (_, i) => ({ listingId: `a${i}`, outcome: 'accepted' as const })),
      ...Array.from({ length: 18 }, (_, i) => ({ listingId: `w${i}`, outcome: 'waiting' as const })),
      { listingId: 'b', outcome: 'busy' as const },
      ...Array.from({ length: 5 }, (_, i) => ({ listingId: `l${i}`, outcome: i ? ('limited' as const) : ('failed' as const) })),
    ]
    const s = redraftSummary(rs)
    expect(s.started).toBe('Redrafting 50 listings. 18 are waiting for a free slot.')
    expect(s.busy).toBe('One is already being written.')
    expect(s.failed).toBe('Couldn’t start 5 redrafts. Try again in a few minutes.')
    expect(s.retry).toEqual(['l0', 'l1', 'l2', 'l3', 'l4'])
    expect(redraftSummary([{ listingId: 'a', outcome: 'accepted' }]).started).toBe('Redrafting 1 listing.')
  })
  it('a re-check says how many items closed', () => {
    expect(recheckSummary(20)).toBe('Checked again. 20 items are done. Redraft the rest to use your answer.')
    expect(recheckSummary(0)).toBe('Checked again. Nothing closed yet. Redraft the listings to use your answer.')
    expect(recheckSummary(null)).toBe('Checked again.')
  })
  it('sends one key per listing; a 429 stops the rest, busy and other failures do not', async () => {
    const err = (status: number, type: string) => new ApiError({ type: type as never, status, message: 'm' })
    const sent: string[] = []
    const send = async (id: string, key: string) => {
      sent.push(`${id}:${key}`)
      if (id === 'busy') throw err(409, 'LISTING_BUSY')
      if (id === 'bad') throw err(422, 'VALIDATION_FAILED')
      if (id === 'limit') throw err(429, 'RATE_LIMITED')
      return { status: id === 'wait' ? ('queued' as const) : ('running' as const), waiting_for_slot: id === 'wait' }
    }
    const t = (...ids: string[]) => ids.map((listingId) => ({ listingId, sections: [] }))
    const out = await redraftMany(t('ok', 'wait', 'busy', 'bad'), (id) => `k-${id}`, send)
    expect(out.map((r) => r.outcome)).toEqual(['accepted', 'waiting', 'busy', 'failed'])
    expect(sent).toEqual(['ok:k-ok', 'wait:k-wait', 'busy:k-busy', 'bad:k-bad'])
    // A 429 first: the two already in flight finish, nothing else is sent.
    sent.length = 0
    const limited = await redraftMany(t('limit', 'ok', 'wait', 'after1', 'after2'), (id) => `k-${id}`, send)
    expect(limited.map((r) => r.outcome)).toEqual(['limited', 'accepted', 'waiting', 'limited', 'limited'])
    expect(sent.some((x) => x.startsWith('after'))).toBe(false)
    expect(redraftOutcome(err(409, 'LISTING_BUSY'))).toEqual({ outcome: 'busy', stop: false })
    expect(redraftOutcome(err(402, 'AI_CREDIT_EXHAUSTED'))).toEqual({ outcome: 'failed', stop: true })
  })

  it('passes each listing its sections', async () => {
    const seen: string[] = []
    const send = async (id: string, _key: string, sections: readonly string[]) => {
      seen.push(`${id}:${sections.join(',')}`)
      return { status: 'running' as const, waiting_for_slot: false }
    }
    await redraftMany([{ listingId: 'a', sections: ['attributes', 'bullets'] }, { listingId: 'b', sections: [] }], (id) => id, send)
    expect(seen).toEqual(['a:attributes,bullets', 'b:'])
  })
})

describe('redraft plan', () => {
  const base = { product_id: U(101), marketplace: 'amazon' as const, status: 'approved' }
  it('redrafts only ready ones with sections, holds busy, paused and open questions, leaves the rest out', () => {
    const plan = redraftPlan([
      { ...base, listing_id: U(201), redraft: true, sections: ['attributes'] },
      { ...base, listing_id: U(202), redraft: false, redraft_blocked: 'other_questions_open', open_questions: 3, sections: ['bullets'] },
      { ...base, listing_id: U(203), redraft: false, redraft_blocked: 'busy' },
      { ...base, listing_id: U(204), redraft: false, redraft_blocked: 'paused' },
      { ...base, listing_id: U(205), redraft: false, redraft_blocked: 'not_written', status: 'created' },
      { ...base, listing_id: U(206), redraft: false, redraft_blocked: 'nothing_to_redraft', sections: [] },
      // Never auto-redrafted without sections, whatever the flag says.
      { ...base, listing_id: U(207), redraft: true, sections: [] },
      { ...base, listing_id: U(208), redraft: false },
    ])
    expect(plan.map((p) => [p.listingId, p.redraft, p.blocked, p.openQuestions, p.sections])).toEqual([
      [U(201), true, null, null, ['attributes']],
      [U(202), false, 'other_questions_open', 3, ['bullets']],
      [U(203), false, 'busy', null, []],
      [U(204), false, 'paused', null, []],
    ])
    expect(plan.map((p) => (p.redraft ? null : heldReason(p)))).toEqual([
      null,
      'Still has 3 questions open. Kuinn redrafts it when they’re answered.',
      'Already drafting.',
      'AI drafting is paused.',
    ])
    expect(heldReason({ blocked: 'other_questions_open', openQuestions: 1 })).toBe('Still has 1 question open. Kuinn redrafts it when they’re answered.')
    expect(redraftTargets([{ ...base, listing_id: U(201), redraft: true, sections: ['title'] }, { ...base, listing_id: U(207), redraft: true, sections: [] }])).toEqual([U(201)])
  })

  it('a full regenerate only from the manual plan; a check-only plan redrafts nothing', () => {
    const full = fullPlan([U(201), U(201), U(202)])
    expect(full.map((p) => [p.listingId, p.full, canRedraftItem(p)])).toEqual([
      [U(201), true, true],
      [U(202), true, true],
    ])
    expect(checkOnlyPlan([U(201)]).map(canRedraftItem)).toEqual([false])
    expect(canRedraftItem({ redraft: true, sections: [], full: false })).toBe(false)
  })

  it('brand parties from the group field', () => {
    expect(['manufacturer', 'marketer', 'packer', 'importer', 'facts.packer', null, 'gender'].map((f) => brandRole(f))).toEqual([
      'manufacturer',
      'marketer',
      'packer',
      'importer',
      'packer',
      'manufacturer',
      'manufacturer',
    ])
    expect(aRole('importer')).toBe('an importer')
    expect(groupTitle({ item_kind: 'task', scope: 'brand', field: 'importer', task_kind: 'missing_fact', error_code: null, products: 4, listings: 4, count: 4 })).toBe('4 products need an importer')
    expect(groupTitle({ item_kind: 'task', scope: 'brand', field: 'marketer', task_kind: 'missing_fact', error_code: null, products: 1, listings: 1, count: 1 })).toBe('1 product needs a marketer')
  })
})
