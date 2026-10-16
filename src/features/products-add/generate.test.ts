import { describe, expect, it } from 'vitest'
import { ApiError } from '@/api/errors'
import { generateErrorMessage, generateMany, planGenerate, type GenerateItem } from './generate'

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
})
