import { describe, expect, it } from 'vitest'
import { ApiError } from '@/api/errors'
import { acceptedSummary, generateErrorMessage, generateMany, isWaitingForSlot, planGenerate, type GenerateItem } from './generate'

const p = (id: string, parent: string | null = null) => ({ id, sku: `S-${id}`, title: id, parent_product_id: parent })

describe('planGenerate', () => {
  it('skips variants and marketplaces that already have a listing past created', () => {
    let k = 0
    const plan = planGenerate(
      [p('a'), p('b'), p('v', 'a')],
      ['amazon', 'flipkart'],
      (id) => (id === 'a' ? { amazon: { status: 'needs_review' } } : id === 'b' ? { flipkart: { status: 'created' } } : {}),
      () => `k${++k}`,
    )
    expect(plan.send.map((i) => `${i.product.id}:${i.marketplace}`)).toEqual(['a:flipkart', 'b:amazon', 'b:flipkart'])
    expect(plan.skipped.map((s) => `${s.product.id}:${s.marketplace}:${s.reason}`)).toEqual([
      'a:amazon:already-listed',
      'v:amazon:variant',
      'v:flipkart:variant',
    ])
    // one key per item
    expect(new Set(plan.send.map((i) => i.key)).size).toBe(3)
  })
})

const item = (id: string): GenerateItem => ({ product: { id, sku: id, title: id }, marketplace: 'amazon', key: `key-${id}` })
const err = (status: number, type: string, loc?: string[]) =>
  new ApiError({ status, type: type as never, message: type, details: loc ? [{ loc, msg: 'x', type: 'x' } as never] : [] })

describe('generateMany', () => {
  it('reports each item, and stops sending after a 429', async () => {
    const sent: string[] = []
    const out = await generateMany(
      [item('a'), item('b'), item('c'), item('d')],
      undefined,
      async (i) => {
        sent.push(i.product.id)
        if (i.product.id === 'b') throw err(429, 'RATE_LIMITED')
        return { job_id: 'j', listing_id: 'l', poll_url: '/x', status: 'queued' } as never
      },
      1,
    )
    expect(sent).toEqual(['a', 'b'])
    expect(out.map((o) => o.kind)).toEqual(['accepted', 'failed', 'failed', 'failed'])
  })

  it('maps refusals to sentences', () => {
    expect(generateErrorMessage(err(422, 'VALIDATION_FAILED', ['body', 'category']))).toMatch(/template/)
    expect(generateErrorMessage(err(409, 'INVALID_STATUS_TRANSITION'))).toBe('Already has a listing there.')
  })

  it('treats 34 sends past the brand cap as 10 drafting and 24 waiting, with no failures (B19)', async () => {
    const items = Array.from({ length: 34 }, (_, i) => item(`p${i}`))
    let n = 0
    const out = await generateMany(items, undefined, async (i) => ({
      job_id: `j-${i.product.id}`,
      listing_id: `l-${i.product.id}`,
      poll_url: '/x',
      status: 'queued',
      estimated_duration_seconds: 30,
      waiting_for_slot: ++n > 10,
    }))
    expect(out).toHaveLength(34)
    expect(out.filter((o) => o.kind === 'failed')).toEqual([])
    expect(out.filter((o) => o.kind === 'accepted' && isWaitingForSlot(o.accepted))).toHaveLength(24)
    expect(acceptedSummary(out)).toBe('10 drafting, 24 waiting for a free slot. Kuinn starts each one as a slot frees up.')
  })

  it('keeps its own text when nothing waits, and leaves out "0 drafting"', () => {
    const accepted = (waiting: boolean) => ({
      kind: 'accepted' as const,
      item: item('a'),
      accepted: { job_id: 'j', poll_url: '/x', status: 'queued' as const, estimated_duration_seconds: 30, waiting_for_slot: waiting },
    })
    expect(acceptedSummary([accepted(false), accepted(false)])).toBeNull()
    expect(acceptedSummary([accepted(true), accepted(true)])).toBe('2 waiting for a free slot. Kuinn starts each one as a slot frees up.')
    // A job that has been promoted (running) no longer waits, whatever the flag said.
    expect(isWaitingForSlot({ status: 'running', waiting_for_slot: true })).toBe(false)
  })

  it('says a 429 is the request limit or the daily AI budget, never the brand cap', () => {
    const limited = new ApiError({ status: 429, type: 'RATE_LIMITED' as never, message: 'x', details: [], retryAfter: 12 })
    expect(generateErrorMessage(limited)).toBe('The request limit was reached. Try again in 12 s.')
    expect(generateErrorMessage(err(429, 'RATE_LIMITED'))).toBe('The request limit was reached. Try again in a minute.')
    expect(generateErrorMessage(err(429, 'BUDGET_EXCEEDED'))).toBe('Today’s AI budget is used up. Drafts can start again after 5:30 am IST.')
    for (const e of [limited, err(429, 'RATE_LIMITED'), err(429, 'BUDGET_EXCEEDED')]) expect(generateErrorMessage(e)).not.toMatch(/too many requests|brand/i)
  })
})
