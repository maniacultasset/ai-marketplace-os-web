import { beforeEach, describe, expect, it, vi } from 'vitest'

const post = vi.fn()
vi.mock('@/api/client', async (orig) => ({
  ...(await orig<typeof import('@/api/client')>()),
  api: { POST: (...a: unknown[]) => post(...a) },
}))

const { SKU_BATCH_MAX, checkable, chunks, csvSkuFindings, fetchTakenSkus, repeatedSkus, variantSkuClashes } = await import('./sku-batch')

const ok = (body: unknown) => Promise.resolve({ data: body, error: undefined, response: new Response(JSON.stringify(body), { status: 200 }) })
const taken = (sku: string, over: Record<string, unknown> = {}) => ({ sku, available: false, product_id: `id-${sku}`, title: 'Kurta set', is_variant: false, deleted: false, ...over })
const row = (key: string, sku: string) => ({ key, colour: null, size: key, sku })

beforeEach(() => {
  post.mockReset()
})

describe('the batch SKU check (client feedback 11 Nov, item 3)', () => {
  it('sends each well-formed SKU once, trimmed, in first-seen order', () => {
    expect(checkable([' KS-1 ', 'KS-2', 'KS-1', '', 'has space', 'a]b', 'x'.repeat(65), 'A\u0000B'])).toEqual(['KS-1', 'KS-2'])
  })

  it('splits a long list into calls of at most 1000', async () => {
    expect(chunks([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    post.mockImplementation((_path: string, init: { body: { skus: string[] } }) => {
      const skus = init.body.skus
      return ok({ checked: skus.length, taken: skus.includes('S-1500') ? [taken('S-1500')] : [] })
    })
    const skus = Array.from({ length: 2500 }, (_, n) => `S-${n}`)
    const out = await fetchTakenSkus(skus)
    const calls = post.mock.calls.slice()
    expect(calls).toHaveLength(3)
    expect(calls.map((c) => c[1].body.skus.length)).toEqual([SKU_BATCH_MAX, SKU_BATCH_MAX, 500])
    expect(calls[0]![0]).toBe('/skus/availability-check')
    expect([...out.keys()]).toEqual(['S-1500'])
  })

  it('sends nothing for an empty or all-invalid list', async () => {
    expect((await fetchTakenSkus(['', 'bad sku'])).size).toBe(0)
    expect(post).not.toHaveBeenCalled()
  })

  it('variants grid: another product’s SKU is a clash, this style’s own variant is not, a deleted one is a note', () => {
    const map = new Map([
      ['KS-1-S', taken('KS-1-S', { product_id: 'own-child', is_variant: true })],
      ['KS-1-M', taken('KS-1-M', { product_id: 'other', title: 'Linen shirt', is_variant: true })],
      ['KS-1-L', taken('KS-1-L', { product_id: 'solo', title: 'Scarf' })],
      ['KS-1-XL', taken('KS-1-XL', { product_id: null, title: null, deleted: true })],
    ])
    const out = variantSkuClashes([row('s', 'KS-1-S'), row('m', 'KS-1-M'), row('l', 'KS-1-L'), row('xl', 'KS-1-XL'), row('xxl', 'KS-1-XXL')], map, new Set(['style', 'own-child']))
    expect(out.errors).toEqual({
      'm.sku': 'KS-1-M is already used by a size or colour of “Linen shirt”. Give this variant another SKU.',
      'l.sku': 'KS-1-L is already used by “Scarf”. Give this variant another SKU.',
    })
    expect(Object.keys(out.notes)).toEqual(['xl.sku'])
    expect(out.notes['xl.sku']).toContain('deleted product')
  })

  it('bulk upload: repeats name every row; each SKU’s first row is judged against the brand', () => {
    const rows = [
      { row: 2, sku: 'A-1', hasParent: false },
      { row: 3, sku: 'V-1', hasParent: false },
      { row: 4, sku: 'V-2', hasParent: true },
      { row: 5, sku: 'A-1', hasParent: false },
      { row: 6, sku: 'OLD', hasParent: false },
      { row: 7, sku: 'NEW', hasParent: false },
      { row: 8, sku: 'A-1', hasParent: false },
    ]
    expect(repeatedSkus(rows)).toEqual([{ sku: 'A-1', rows: [2, 5, 8] }])
    const map = new Map([
      ['A-1', taken('A-1', { title: 'Cotton kurta' })],
      ['V-1', taken('V-1', { is_variant: true })],
      ['V-2', taken('V-2', { is_variant: true })],
      ['OLD', taken('OLD', { product_id: null, title: null, deleted: true })],
    ])
    const out = csvSkuFindings(rows, map)
    expect(out.fails).toEqual([{ row: 3, sku: 'V-1', message: 'V-1 is a size or colour of “Kurta set”. Add its style in parent_style_id, or use a new SKU.' }])
    expect(out.updates.map((u) => [u.row, u.message])).toEqual([
      [2, 'A-1 updates “Cotton kurta”.'],
      [4, 'V-2 updates a size or colour of “Kurta set”.'],
      [6, 'OLD belonged to a deleted product. This row brings it back.'],
    ])
  })
})
