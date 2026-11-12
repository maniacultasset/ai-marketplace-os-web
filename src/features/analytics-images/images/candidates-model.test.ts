import { describe, expect, it } from 'vitest'
import { ApiError } from '@/api/errors'
import {
  aiLimitHit,
  anyQueued,
  candidateErrorCopy,
  FAILURE_COPY,
  isAiOff,
  isCacheHit,
  keptOriginals,
  noFixCopy,
  openCandidates,
  candidatesUnsupported,
  originBadge,
  supportsCandidates,
  AI_OFF_COPY,
  APPLIED_COPY,
  appliedFrom,
  canStart,
  fixState,
  type Candidate,
} from './candidates-model'

const MAIN = '0b1c2d3e-0000-4000-8000-000000000001'
const OTHER = '0b1c2d3e-0000-4000-8000-000000000002'
let n = 0
const cand = (over: Partial<Candidate> = {}): Candidate => ({
  id: `c${++n}`,
  kind: 'white_background',
  status: 'ready',
  source_image_id: MAIN,
  created_at: '2026-11-08T09:00:00Z',
  cost_usd: '0',
  ...over,
})
const err422 = (field: string) =>
  new ApiError({ type: 'VALIDATION_FAILED', status: 422, message: 'm', details: [{ loc: ['body', field], msg: 'm' }] })

describe('originBadge', () => {
  it('names AI, framed and size-chart images, and nothing for the seller photo', () => {
    expect(originBadge({ origin: 'generated', slot: 'main' })).toBe('AI white background')
    expect(originBadge({ origin: 'rendered', slot: 'main' })).toBe('Framed')
    expect(originBadge({ origin: 'rendered', slot: 'size_chart' })).toBe('Made from your size chart')
    expect(originBadge({ origin: 'seller', slot: 'main' })).toBeNull()
    expect(originBadge(undefined)).toBeNull()
  })
})

describe('keptOriginals', () => {
  it('marks a live image that a used candidate was made from', () => {
    const details = [
      { image_id: 'new', slot: 'main' as const, position: 0, status: 'ready', compliance_status: 'pending' as const, origin: 'generated' as const, parent_image_id: 'old' },
      { image_id: 'old', slot: 'secondary' as const, position: 3, status: 'ready', compliance_status: 'passed' as const, origin: 'seller' as const },
      { image_id: 'x', slot: 'main' as const, position: 0, status: 'ready', compliance_status: 'passed' as const, origin: 'rendered' as const, parent_image_id: 'gone' },
    ]
    expect([...keptOriginals(details)]).toEqual(['old'])
  })
})

describe('supportsCandidates', () => {
  it('is true only when the product read carries the SI7 fields', () => {
    expect(supportsCandidates([{ image_id: 'a', slot: 'main', position: 0, status: 'ready', compliance_status: 'passed', origin: 'seller' }])).toBe(true)
    expect(supportsCandidates([{ image_id: 'a', slot: 'main', position: 0, status: 'ready', compliance_status: 'passed' } as never])).toBe(false)
    expect(supportsCandidates(undefined)).toBe(false)
  })
})

describe('openCandidates', () => {
  it('keeps the newest per kind for the source, and drops used, discarded and closed ones', () => {
    const newestWb = cand({ status: 'queued' })
    const olderWb = cand({ status: 'ready' })
    const fix = cand({ kind: 'fix', status: 'failed', failure_reason: 'too_small' })
    const other = cand({ source_image_id: OTHER })
    const chart = cand({ kind: 'size_chart', source_image_id: null })
    const list = [newestWb, olderWb, fix, other, chart]
    expect(openCandidates(list, MAIN).map((c) => c.id)).toEqual([newestWb.id, fix.id])
    expect(openCandidates(list, MAIN, new Set([fix.id])).map((c) => c.id)).toEqual([newestWb.id])
    expect(openCandidates(list, null).map((c) => c.id)).toEqual([chart.id])
    // A newer accepted one hides the older ready one: it is done.
    expect(openCandidates([cand({ status: 'accepted' }), olderWb], MAIN)).toEqual([])
    expect(anyQueued(list)).toBe(true)
    expect(anyQueued([olderWb])).toBe(false)
  })
})

describe('aiLimitHit', () => {
  const now = new Date('2026-11-08T12:00:00Z')
  it('is hit when today’s newest AI candidate was refused for budget', () => {
    expect(aiLimitHit([cand({ status: 'failed', failure_reason: 'budget' })], now)).toBe(true)
  })
  it('resets the next day and after a later success', () => {
    expect(aiLimitHit([cand({ status: 'failed', failure_reason: 'budget', created_at: '2026-11-07T23:00:00Z' })], now)).toBe(false)
    expect(aiLimitHit([cand({ status: 'ready' }), cand({ status: 'failed', failure_reason: 'budget' })], now)).toBe(false)
    expect(aiLimitHit([cand({ kind: 'fix', status: 'failed', failure_reason: 'budget' })], now)).toBe(false)
  })
})

describe('create answers and errors', () => {
  it('reads a cache hit: ready with no job', () => {
    expect(isCacheHit({ candidate_id: 'c', status: 'ready', job_id: null })).toBe(true)
    expect(isCacheHit({ candidate_id: 'c', status: 'queued', job_id: 'j', poll_url: '/api/v1/jobs/j' })).toBe(false)
  })
  it('reads the switch being off from a 422 at kind on an AI create only', () => {
    expect(isAiOff(err422('kind'), 'white_background')).toBe(true)
    expect(isAiOff(err422('kind'), 'size_chart')).toBe(false)
    expect(isAiOff(err422('source_image_id'), 'white_background')).toBe(false)
    expect(candidateErrorCopy(err422('kind'), 'white_background', 'create')).toBe(AI_OFF_COPY)
  })
  const err = (status: number) => new ApiError({ type: status === 404 ? 'NOT_FOUND' : 'INVALID_STATUS_TRANSITION', status, message: 'm' })
  it('says what to do for the other create refusals', () => {
    expect(candidateErrorCopy(err422('source_image_id'), 'fix', 'create')).toMatch(/still being checked/)
    expect(candidateErrorCopy(err422('kind'), 'size_chart', 'create')).toMatch(/size chart cannot be drawn/)
    expect(candidateErrorCopy(err(404), 'fix', 'create')).toBe('This photo is no longer the main image.')
    expect(candidateErrorCopy(new Error('x'), 'fix', 'create')).toBeNull()
  })
  it('has its own words for a refused use or discard', () => {
    expect(candidateErrorCopy(err(404), 'fix', 'accept')).toBe('This suggestion is gone.')
    expect(candidateErrorCopy(err(404), 'fix', 'discard')).toBe('This suggestion is gone.')
    expect(candidateErrorCopy(err(409), 'white_background', 'accept')).toBe('Already used or the photo changed. Showing the latest.')
    expect(candidateErrorCopy(err(409), 'white_background', 'discard')).toBe('Already used or discarded. Showing the latest.')
    // An accept is never read as the AI switch.
    expect(candidateErrorCopy(err422('kind'), 'white_background', 'accept')).toBeNull()
  })
  it('reads a backend without image candidates from the list call', () => {
    expect(candidatesUnsupported(err(404))).toBe(true)
    expect(candidatesUnsupported(new ApiError({ type: 'VALIDATION_FAILED', status: 405, message: 'm' }))).toBe(true)
    expect(candidatesUnsupported(new ApiError({ type: 'INTERNAL_ERROR', status: 500, message: 'm' }))).toBe(false)
    expect(candidatesUnsupported(null)).toBe(false)
  })
  it('has plain copy for every failure reason', () => {
    expect(FAILURE_COPY.budget).toBe('Daily AI image limit reached. Try tomorrow.')
    expect(FAILURE_COPY.too_small).toBe('Photo too small. Upload at least 800 px.')
    expect(Object.keys(FAILURE_COPY)).toHaveLength(9)
    expect(FAILURE_COPY.source_changed).toBe('The photo changed since this was made. Try again.')
  })
})

describe('fix state', () => {
  const base = { open: [] as Candidate[], starting: null, blocked: false }

  it('maps each case to one plain state', () => {
    expect(fixState('white_background', base)).toBe('available')
    expect(fixState('white_background', { ...base, starting: 'white_background' })).toBe('starting')
    expect(fixState('white_background', { ...base, starting: 'fix' })).toBe('working')
    expect(fixState('white_background', { ...base, open: [cand({ status: 'queued' })] })).toBe('working')
    expect(fixState('fix', { ...base, open: [cand({ status: 'queued' })] })).toBe('working')
    expect(fixState('white_background', { ...base, open: [cand({ status: 'ready' })] })).toBe('ready')
    expect(fixState('fix', { ...base, open: [cand({ status: 'ready' })] })).toBe('available')
    expect(fixState('white_background', { ...base, open: [cand({ status: 'failed', failure_reason: 'model_failed' })] })).toBe('failed')
    expect(fixState('white_background', { ...base, blocked: true })).toBe('blocked')
  })

  it('lets the button start only when nothing is open, or to retry a failure', () => {
    expect(canStart('available')).toBe(true)
    expect(canStart('failed')).toBe(true)
    for (const s of ['blocked', 'starting', 'working', 'ready'] as const) expect(canStart(s)).toBe(false)
  })
})

describe('applied', () => {
  it('finds the newest used candidate made from this photo, never another photo or a size chart', () => {
    const used = cand({ status: 'accepted', accepted_image_id: OTHER })
    const live = (id: string) => id === OTHER
    expect(appliedFrom([cand({ status: 'ready' }), used], MAIN, live)).toBe(used)
    expect(appliedFrom([used], OTHER, live)).toBeUndefined()
    expect(appliedFrom([cand({ kind: 'size_chart', source_image_id: null, status: 'accepted' })], null, live)).toBeUndefined()
    expect(appliedFrom([cand({ status: 'rejected' })], MAIN, live)).toBeUndefined()
  })

  it('is history only once the result is no longer a live main (deleted, or the old photo is main again)', () => {
    const used = cand({ status: 'accepted', accepted_image_id: OTHER })
    expect(appliedFrom([used], MAIN, () => false)).toBeUndefined()
    expect(appliedFrom([cand({ status: 'accepted', accepted_image_id: null })], MAIN, () => true)).toBeUndefined()
  })

  it('says it is done in short calm words, with no "already in use"', () => {
    expect(APPLIED_COPY.white_background).toBe("This photo is already on a white background. It's your main photo now.")
    for (const copy of Object.values(APPLIED_COPY)) {
      expect(copy).not.toMatch(/in use|!|AI/)
      expect(copy.length).toBeLessThan(80)
    }
  })
})

describe('noFixCopy (B2)', () => {
  it('always gives a reason and a next step', () => {
    for (const r of ['ai_off', 'not_fixable', null, undefined] as const) {
      const c = noFixCopy(r)
      expect(c.reason.length).toBeGreaterThan(0)
      expect(c.next.length).toBeGreaterThan(0)
    }
    expect(noFixCopy('ai_off').reason).toContain('switched off')
    expect(noFixCopy('not_fixable').reason).toContain('failed a check')
  })
})

