import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/errors'
import type { ProductDetail } from '@/features/products/api'

const patchProduct = vi.fn()
const fetchProduct = vi.fn()
let allowed = true
vi.mock('@/features/products/api', async (orig) => ({
  ...(await orig<typeof import('@/features/products/api')>()),
  patchProduct: (...a: unknown[]) => patchProduct(...a),
  fetchProduct: (...a: unknown[]) => fetchProduct(...a),
}))
vi.mock('@/lib/auth', async (orig) => ({ ...(await orig<typeof import('@/lib/auth')>()), useSession: () => ({ tenantId: 't1' }) }))
vi.mock('@/lib/permissions', async (orig) => ({ ...(await orig<typeof import('@/lib/permissions')>()), useCan: () => () => allowed }))

const { productQuery } = await import('@/features/products/api')
const { keysFor } = await import('@/lib/query-keys')
const { ProductDetailsCard } = await import('@/features/products-add/product-details')

const IMG = '00000000-0000-4000-8000-000000000501'
const base: ProductDetail = {
  id: 'p1',
  sku: 'KS-1',
  title: 'Cotton kurta',
  status: 'active',
  category: 'kurtas',
  created_at: 'x',
  identifier_exemption: false,
  brand_name_inherited: false, size_chart_read_enabled: false, category_suggest_enabled: false, photo_reading: false,
  updated_at: 'x',
  attributes: { neckline: 'v-neck', fit: 'slim fit', pattern: 'solid' },
  attribute_literals: {},
  photo_facts: [
    { key: 'neckline', value: 'v-neck', confidence: 0.8, image_id: IMG, confirmed: false },
    { key: 'fit', value: 'slim fit', confidence: 0.95, image_id: IMG, confirmed: false },
  ],
  image_details: [{ image_id: IMG, slot: 'main', position: 0, status: 'ready', origin: 'seller' as const, compliance_status: 'passed' }],
  etag: '"v1"',
}

const key = productQuery(keysFor('t1'), 'p1').queryKey

function Harness() {
  const { data } = useQuery({ queryKey: key, queryFn: () => base, staleTime: Infinity })
  return data ? <ProductDetailsCard product={data} isVariant={false} source="none" /> : null
}

function setup(product: ProductDetail = base) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  qc.setQueryData(key, product)
  render(
    <QueryClientProvider client={qc}>
      <Harness />
    </QueryClientProvider>,
  )
  return qc
}

const row = (k: string) => document.querySelector<HTMLElement>(`[data-fact-key="${k}"]`)

/** A promise the test resolves by hand, so it can look at the screen while the save is in flight. */
function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  allowed = true
  patchProduct.mockReset()
  fetchProduct.mockReset()
})
afterEach(cleanup)

describe('From photos', () => {
  it('shows each photo value with plain-words confidence and the seller’s own value as You', () => {
    setup()
    expect(within(row('neckline')!).getByTestId('photo-fact-value').textContent).toBe('Looks like V-neck')
    expect(within(row('fit')!).getByTestId('photo-fact-value').textContent).toBe('Clearly Slim fit')
    expect(within(row('neckline')!).getByText('From photo')).toBeTruthy()
    expect(within(row('neckline')!).getByText('From the front photo')).toBeTruthy()
    expect(row('pattern')!.dataset.factStatus).toBe('you')
    expect(within(row('pattern')!).getByText('You')).toBeTruthy()
    expect(within(row('pattern')!).queryByTestId('photo-fact-confirm')).toBeNull()
    expect(screen.getByTestId('photo-facts-status').textContent).toBe('2 to check')
    // Photo keys are not listed again under "More details".
    expect(document.querySelectorAll('[data-attr-key="neckline"]').length).toBe(0)
  })

  it('confirms at once, then keeps the saved product and its new ETag', async () => {
    const save = deferred<ProductDetail>()
    patchProduct.mockReturnValueOnce(save.promise)
    const qc = setup()
    fireEvent.click(within(row('neckline')!).getByTestId('photo-fact-confirm'))
    // Optimistic: Confirmed before the server answers.
    await waitFor(() => expect(row('neckline')!.dataset.factStatus).toBe('confirmed'))
    expect(within(row('neckline')!).getByText('Confirmed')).toBeTruthy()
    expect(patchProduct).toHaveBeenCalledWith('p1', { confirm_attributes: ['neckline'] }, '"v1"')
    const saved: ProductDetail = {
      ...base,
      photo_facts: base.photo_facts!.map((f) => (f.key === 'neckline' ? { ...f, confirmed: true, confirmed_at: 'now' } : f)),
      etag: '"v2"',
    }
    await act(async () => save.resolve(saved))
    expect(qc.getQueryData<ProductDetail>(key)?.etag).toBe('"v2"')
    expect(row('neckline')!.dataset.factStatus).toBe('confirmed')
    expect(screen.getByTestId('photo-facts-status').textContent).toBe('1 to check')
  })

  it('rejects at once, and brings the row back with an error when the save fails', async () => {
    const save = deferred<ProductDetail>()
    patchProduct.mockReturnValueOnce(save.promise)
    setup()
    fireEvent.click(within(row('fit')!).getByTestId('photo-fact-reject'))
    await waitFor(() => expect(row('fit')).toBeNull())
    expect(patchProduct).toHaveBeenCalledWith('p1', { attributes: { fit: null } }, '"v1"')
    await act(async () => save.reject(new ApiError({ type: 'INTERNAL_ERROR', status: 500, message: 'boom' })))
    await waitFor(() => expect(row('fit')).not.toBeNull())
    expect(row('fit')!.dataset.factStatus).toBe('photo')
    expect(within(row('fit')!).getByRole('alert').textContent).toBe('Couldn’t remove this. Try again.')
  })

  it('sends each action with the ETag it was clicked over, re-reading on a stale version', async () => {
    const first = deferred<ProductDetail>()
    const stale = new ApiError({ type: 'STALE_VERSION', status: 409, message: 'stale' })
    patchProduct.mockReturnValueOnce(first.promise).mockRejectedValueOnce(stale).mockResolvedValueOnce({ ...base, etag: '"v4"' })
    fetchProduct.mockResolvedValueOnce({ ...base, etag: '"v3"' })
    setup()
    fireEvent.click(within(row('neckline')!).getByTestId('photo-fact-confirm'))
    fireEvent.click(within(row('fit')!).getByTestId('photo-fact-confirm'))
    await waitFor(() => expect(patchProduct).toHaveBeenCalledTimes(1))
    await act(async () => first.resolve({ ...base, etag: '"v2"' }))
    await waitFor(() => expect(patchProduct).toHaveBeenCalledTimes(3))
    // The second click was made over v1; after the 409 it re-reads (v3), checks, and sends once more.
    expect(patchProduct.mock.calls[1]).toEqual(['p1', { confirm_attributes: ['fit'] }, '"v1"'])
    expect(fetchProduct).toHaveBeenCalledWith('p1')
    expect(patchProduct.mock.calls[2]).toEqual(['p1', { confirm_attributes: ['fit'] }, '"v3"'])
  })

  it('drops a queued reject when a teammate set that value meanwhile, so theirs is never deleted', async () => {
    const first = deferred<ProductDetail>()
    patchProduct.mockReturnValueOnce(first.promise)
    setup()
    fireEvent.click(within(row('neckline')!).getByTestId('photo-fact-confirm'))
    fireEvent.click(within(row('fit')!).getByTestId('photo-fact-reject'))
    await waitFor(() => expect(patchProduct).toHaveBeenCalledTimes(1))
    // The first save's answer carries the teammate's own fit: no photo fit any more.
    const theirs: ProductDetail = {
      ...base,
      attributes: { ...base.attributes, fit: 'regular fit' },
      photo_facts: [{ ...base.photo_facts![0]!, confirmed: true }],
      etag: '"v2"',
    }
    await act(async () => first.resolve(theirs))
    await waitFor(() => expect(row('fit')!.dataset.factStatus).toBe('you'))
    expect(patchProduct).toHaveBeenCalledTimes(1)
    expect(within(row('fit')!).getByTestId('photo-fact-value').textContent).toBe('Regular fit')
  })

  it('hides Confirm and Reject without permission to edit products', () => {
    allowed = false
    setup()
    expect(screen.queryAllByTestId('photo-fact-confirm')).toHaveLength(0)
    expect(screen.queryAllByTestId('photo-fact-reject')).toHaveLength(0)
    expect(within(row('neckline')!).getByText('From photo')).toBeTruthy()
  })

  it('shows no group when the photos gave nothing', () => {
    setup({ ...base, photo_facts: [] })
    expect(screen.queryByTestId('photo-facts')).toBeNull()
  })
})

describe('From photos: keyboard', () => {
  it('after Confirm, focus moves to the next fact to check, not the page body', async () => {
    patchProduct.mockReturnValueOnce(new Promise(() => {}))
    setup()
    const confirm = within(row('neckline')!).getByTestId('photo-fact-confirm')
    confirm.focus()
    fireEvent.click(confirm)
    await waitFor(() => expect(row('neckline')!.dataset.factStatus).toBe('confirmed'))
    await waitFor(() => expect(document.activeElement).toBe(within(row('fit')!).getByTestId('photo-fact-confirm')))
  })
})
