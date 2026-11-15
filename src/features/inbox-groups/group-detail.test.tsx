import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { Action } from '@/lib/permissions'
import type { GroupMember, InboxGroup } from './model'

const post = vi.fn()
const can = vi.hoisted(() => ({ actions: new Set<string>() }))
const ai = vi.hoisted(() => ({ paused: false }))
vi.mock('@/api/client', async (orig) => ({ ...(await orig<typeof import('@/api/client')>()), api: { POST: (...a: unknown[]) => post(...a) } }))
vi.mock('@/lib/auth', async (orig) => ({ ...(await orig<typeof import('@/lib/auth')>()), useSession: () => ({ tenantId: 't1' }) }))
vi.mock('@/lib/permissions', async (orig) => ({ ...(await orig<typeof import('@/lib/permissions')>()), useCan: () => (a: string) => can.actions.has(a) }))
vi.mock('@/features/ai-credit/use-ai-paused', () => ({ useAiPaused: () => ai.paused }))
vi.mock('@/features/brand/manufacturer-card', () => ({
  ManufacturerCard: ({ canEdit, onSaved }: { canEdit: boolean; onSaved?: (set: boolean) => void }) => (
    <div data-testid="manufacturer-card" data-can-edit={canEdit}>
      <button type="button" onClick={() => onSaved?.(true)} data-testid="manufacturer-save">
        Save manufacturer
      </button>
    </div>
  ),
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, search, ...rest }: { to: string; children: ReactNode; search?: { item?: string } }) => (
    <a href={`${to}?item=${search?.item ?? ''}`} {...rest}>
      {children}
    </a>
  ),
}))

const { GroupDetail } = await import('./group-detail')

const AT = '2026-11-15T09:30:00Z'
const U = (n: number) => `0b1c2d3e-0000-4000-8000-${String(n).padStart(12, '0')}`
const OWNER: Action[] = ['tenant:read', 'product:import', 'listing:regenerate', 'listing:edit', 'settings:manage']

const member = (i: number, over: Partial<GroupMember> = {}): GroupMember => ({
  task_id: U(1000 + i),
  product_id: U(100 + i),
  sku: `KTEST-${String(i).padStart(3, '0')}`,
  title: `Kurta ${i}`,
  listing_ids: [U(200 + i)],
  has_value: false,
  at: AT,
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
  members: [member(1), member(2), member(3, { has_value: true })],
  members_more: false,
  ...over,
})

const ok = (body: unknown, status = 200) => Promise.resolve({ data: body, error: undefined, response: new Response(JSON.stringify(body), { status }) })
const refuse = (status: number, type: string, details: unknown[] | null = null) => {
  const error = { error: { type, message: 'm', status, correlation_id: 'req-1', details, error_report: null } }
  return Promise.resolve({ data: undefined, error, response: new Response(JSON.stringify(error), { status }) })
}
const listing = (i: number, redraft = true) => ({ listing_id: U(200 + i), product_id: U(100 + i), marketplace: 'amazon', status: 'approved', redraft })
const job = (waiting: boolean) => ({ job_id: U(9000), status: waiting ? 'queued' : 'running', waiting_for_slot: waiting, listing_id: U(200) })

type Init = { params?: { path?: { listing_id?: string }; header?: Record<string, string> }; body?: Record<string, unknown> }
const calls = (path: string) => post.mock.calls.filter((c) => c[0] === path).map((c) => c[1] as Init)

function setup(g: InboxGroup, onDone = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        <GroupDetail group={g} search={{}} onDone={onDone} />
      </TooltipProvider>
    </QueryClientProvider>,
  )
  return { onDone }
}

const chip = (name: RegExp) => screen.getAllByTestId('answer-chip').find((c) => name.test(c.textContent ?? ''))!

beforeEach(() => {
  // The Radix checkbox measures itself; jsdom has no ResizeObserver.
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  post.mockReset()
  can.actions = new Set(OWNER)
  ai.paused = false
})
afterEach(cleanup)

describe('GroupDetail, one answer for many products', () => {
  it('saves for all, never sends a kept product, then redrafts by default', async () => {
    post.mockImplementation((path: string, init: Init) => {
      if (path === '/inbox/groups/answer')
        return ok({
          applied: [
            { task_id: U(1001), product_id: U(101) },
            { task_id: U(1002), product_id: U(102) },
          ],
          skipped: [],
          listings: [listing(1), listing(2), listing(4, false)],
        })
      const id = init.params?.path?.listing_id
      return id === U(201) ? ok(job(false), 202) : ok(job(true), 202)
    })
    const { onDone } = setup(group())
    expect(screen.getByTestId('group-title').textContent).toBe('3 products need the gender')
    expect(screen.getByTestId('group-sub').textContent).toBe('Answer once for all of them, or pick some.')
    expect(screen.getByTestId('group-kept-note').textContent).toBe('1 has its own value and is kept as it is.')
    const kept = screen.getAllByTestId('group-member').find((r) => r.dataset.kept)!
    expect(kept.textContent).toContain('Has its own value. Kept as it is.')
    expect(screen.getByTestId('group-redraft').getAttribute('data-state')).toBe('checked')
    expect(screen.getByText('Redraft the affected listings (2)')).toBeTruthy()

    fireEvent.click(screen.getByTestId('group-submit'))
    expect(screen.getByTestId('answer-error').textContent).toBe('Pick one.')
    expect(post).not.toHaveBeenCalled()

    fireEvent.click(chip(/Women/))
    expect(screen.getByTestId('group-submit').textContent).toBe('Save for 2 products')
    fireEvent.click(screen.getByTestId('group-submit'))
    await screen.findByTestId('group-result')
    const [answer] = calls('/inbox/groups/answer')
    expect(answer!.body).toEqual({ group: 't|missing_fact|facts.gender|503f4d45ede0', task_ids: [U(1001), U(1002)], value: 'women' })
    expect(answer!.params!.header!['Idempotency-Key']).toBeTruthy()
    expect(screen.getByTestId('group-result-line').textContent).toBe('Saved for 2 products. 1 already had a value and was kept.')
    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ key: 't|missing_fact|facts.gender|503f4d45ede0' }), 'Saved for 2 products. 1 already had a value and was kept.')

    // Only the listings the backend says can be written again, one key each.
    await screen.findByTestId('group-redraft-started')
    const regens = calls('/listings/{listing_id}/regenerate')
    expect(regens.map((c) => c.params!.path!.listing_id)).toEqual([U(201), U(202)])
    expect(new Set(regens.map((c) => c.params!.header!['Idempotency-Key'])).size).toBe(2)
    expect(regens[0]!.body).toEqual({})
    expect(screen.getByTestId('group-redraft-started').textContent).toBe('Redrafting 2 listings. 1 is waiting for a free slot.')
  })

  it('a subset with redraft off sends only the ticked products, then offers redraft or a check', async () => {
    post.mockImplementation((path: string) => {
      if (path === '/inbox/groups/answer') return ok({ applied: [{ task_id: U(1002), product_id: U(102) }], skipped: [], listings: [listing(2)] })
      if (path === '/listings/validate') return ok({ passed: true })
      return ok(job(false), 202)
    })
    setup(group())
    fireEvent.click(screen.getByTestId('group-scope-pick'))
    const picks = screen.getAllByTestId('group-member-pick')
    // The kept product cannot be ticked.
    expect(picks.map((p) => p.hasAttribute('disabled'))).toEqual([false, false, true])
    expect(screen.getByTestId('group-submit').hasAttribute('disabled')).toBe(true)
    fireEvent.click(picks[1]!)
    fireEvent.click(screen.getByTestId('group-redraft'))
    fireEvent.click(chip(/Men/))
    expect(screen.getByTestId('group-submit').textContent).toBe('Save for 1 product')
    fireEvent.click(screen.getByTestId('group-submit'))
    await screen.findByTestId('group-result')
    expect(calls('/inbox/groups/answer')[0]!.body!.task_ids).toEqual([U(1002)])
    expect(screen.getByTestId('group-result-line').textContent).toBe('Saved for 1 product.')
    expect(calls('/listings/{listing_id}/regenerate')).toHaveLength(0)
    expect(screen.getByTestId('group-redraft-now').textContent).toBe('Redraft 1 listing')
    fireEvent.click(screen.getByTestId('group-recheck'))
    await screen.findByTestId('group-recheck-result')
    expect(calls('/listings/validate')[0]!.body).toEqual({ listing_id: U(202), listing_version_id: null })
  })

  it('reports busy, limited and failed redrafts, and redrafts the rest with the same keys', async () => {
    let round = 0
    post.mockImplementation((path: string, init: Init) => {
      if (path === '/inbox/groups/answer')
        return ok({ applied: [1, 2, 3, 4].map((i) => ({ task_id: U(1000 + i), product_id: U(100 + i) })), skipped: [], listings: [1, 2, 3, 4].map((i) => listing(i)) })
      const id = init.params?.path?.listing_id
      if (round > 0) return ok(job(false), 202)
      if (id === U(201)) return ok(job(false), 202)
      if (id === U(202)) return refuse(409, 'LISTING_BUSY')
      return refuse(429, 'RATE_LIMITED')
    })
    setup(group({ members: [1, 2, 3, 4].map((i) => member(i)), count: 4, products: 4, listings: 4 }))
    fireEvent.click(chip(/Unisex/))
    fireEvent.click(screen.getByTestId('group-submit'))
    await screen.findByTestId('group-redraft-failed')
    expect(screen.getByTestId('group-redraft-started').textContent).toBe('Redrafting 1 listing.')
    expect(screen.getByTestId('group-redraft-busy').textContent).toBe('One is already being written.')
    expect(screen.getByTestId('group-redraft-failed').textContent).toBe('Couldn’t start 2 redrafts. Try again in a few minutes.')
    const first = calls('/listings/{listing_id}/regenerate')
    const keyOf = (id: string, list: Init[]) => list.find((c) => c.params!.path!.listing_id === id)?.params!.header!['Idempotency-Key']
    round = 1
    fireEvent.click(screen.getByTestId('group-redraft-rest'))
    await waitFor(() => expect(screen.queryByTestId('group-redraft-failed')).toBeNull())
    const again = calls('/listings/{listing_id}/regenerate').slice(first.length)
    expect(again.map((c) => c.params!.path!.listing_id)).toEqual([U(203), U(204)])
    expect(keyOf(U(203), again)).toBe(keyOf(U(203), first))
    expect(screen.getByTestId('group-redraft-started').textContent).toBe('Redrafting 3 listings.')
  })

  it('a value no category accepts lands under the input; nothing is redrafted', async () => {
    post.mockImplementation(() => refuse(422, 'VALIDATION_FAILED', [{ loc: ['body', 'value'], msg: 'not allowed', type: 'value_error' }]))
    setup(group())
    fireEvent.click(chip(/Women/))
    fireEvent.click(screen.getByTestId('group-submit'))
    await waitFor(() => expect(screen.getByTestId('answer-error').textContent).toBe('Not accepted for this product’s category.'))
    expect(screen.queryByTestId('group-result')).toBeNull()
    expect(calls('/listings/{listing_id}/regenerate')).toHaveLength(0)
  })

  it('without product:import there is no answer form; without listing:regenerate no redraft box', () => {
    can.actions = new Set(['tenant:read', 'listing:approve'])
    setup(group())
    expect(screen.getByTestId('group-no-permission').textContent).toBe('Only people who can edit products can answer this. Ask an owner or operator.')
    expect(screen.queryByTestId('group-submit')).toBeNull()
    cleanup()
    can.actions = new Set(['tenant:read', 'product:import'])
    setup(group())
    expect(screen.getByTestId('group-submit')).toBeTruthy()
    expect(screen.queryByTestId('group-redraft')).toBeNull()
  })

  it('AI paused: the redraft box is off and says why', () => {
    ai.paused = true
    setup(group())
    expect(screen.getByTestId('group-redraft').hasAttribute('disabled')).toBe(true)
    expect(screen.getByText(/AI drafting is paused/)).toBeTruthy()
  })
})

describe('GroupDetail, other scopes', () => {
  const brand = (over: Partial<InboxGroup> = {}) =>
    group({ key: 't|missing_fact|facts.manufacturer|cae91fb30742', scope: 'brand', field: 'manufacturer', answer: { kind: 'text' }, ...over })

  it('brand, not set: the brand card, then redraft of the listings without their own value', async () => {
    post.mockImplementation(() => ok(job(false), 202))
    setup(brand())
    expect(screen.getByTestId('group-title').textContent).toBe('3 products need a manufacturer')
    expect(screen.getByTestId('group-brand-unset').textContent).toBe('Set the manufacturer once for the brand. Every product uses it unless it has its own.')
    expect(screen.queryByTestId('group-redraft-now')).toBeNull()
    fireEvent.click(screen.getByTestId('manufacturer-save'))
    expect(screen.getByTestId('group-brand-set').textContent).toBe('Your brand manufacturer is set. These listings were written before that. Redraft them to use it.')
    fireEvent.click(screen.getByTestId('group-redraft-now'))
    await screen.findByTestId('group-redraft-started')
    // The kept product (its own manufacturer) is left out.
    expect(calls('/listings/{listing_id}/regenerate').map((c) => c.params!.path!.listing_id)).toEqual([U(201), U(202)])
  })

  it('brand, someone who cannot edit it: a read-only note', () => {
    can.actions = new Set(['tenant:read', 'product:import', 'listing:regenerate'])
    setup(brand())
    expect(screen.getByTestId('group-brand-no-permission').textContent).toBe('Only an owner or admin can set the brand manufacturer. You can still add it on each product.')
    expect(screen.queryByTestId('manufacturer-card')).toBeNull()
  })

  it('brand already set: offers the redraft at once', () => {
    setup(brand({ brand_value_set: true }))
    expect(screen.getByTestId('group-brand-set')).toBeTruthy()
    expect(screen.getByTestId('group-redraft-now').textContent).toBe('Redraft 2 listings')
  })

  it('exemption: needs the confirm, sends true, and keeps barcoded products', async () => {
    post.mockImplementation((path: string) =>
      path === '/inbox/groups/answer'
        ? ok({ applied: [{ task_id: U(1001), product_id: U(101) }, { task_id: U(1002), product_id: U(102) }], skipped: [], listings: [] })
        : ok(job(false), 202),
    )
    setup(group({ key: 't|missing_fact|facts.identifier|aaaaaaaaaaaa', scope: 'exemption', field: 'identifier', answer: { kind: 'text' } }))
    expect(screen.getByTestId('group-title').textContent).toBe('3 products need a barcode')
    expect(screen.getAllByTestId('group-member').find((r) => r.dataset.kept)!.textContent).toContain('Has a barcode. Kept.')
    expect(screen.getByTestId('group-submit').textContent).toBe('Mark 2 products as exempt')
    fireEvent.click(screen.getByTestId('group-submit'))
    expect(screen.getByTestId('group-field-error').textContent).toBe('Confirm the exemption first.')
    expect(post).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('group-exempt-confirm'))
    fireEvent.click(screen.getByTestId('group-submit'))
    await screen.findByTestId('group-result')
    expect(calls('/inbox/groups/answer')[0]!.body!.value).toBe(true)
    expect(screen.getByTestId('group-result-line').textContent).toBe('Marked as exempt for 2 products. 1 has a barcode and was kept.')
  })

  it('per item: the list only, each row opens its item', () => {
    setup(group({ key: 't|image_replacement|images[]|x', scope: 'per_item', task_kind: 'image_replacement', field: 'images[]', answer: null }))
    expect(screen.getByTestId('group-title').textContent).toBe('3 photos need replacing')
    expect(screen.getByTestId('group-sub').textContent).toBe('Each one needs its own fix. Open one to start.')
    expect(screen.queryByTestId('group-answer')).toBeNull()
    expect(screen.getAllByTestId('group-member-open')[0]!.getAttribute('href')).toBe(`/inbox?item=task:${U(1001)}`)
  })
})
