import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
const { ReviewPhotoValues } = await import('./review-photo-values')
const { reviewPhotoRows, rejectedKeys } = await import('./model')

const IMG = '00000000-0000-4000-8000-000000000501'
const base: ProductDetail = {
  id: 'p1',
  sku: 'KS-1',
  title: 'Cotton kurta',
  status: 'active',
  category: 'kurtas',
  created_at: 'x',
  identifier_exemption: false, brand_name_inherited: false, size_chart_read_enabled: false, category_suggest_enabled: false,
  updated_at: 'x',
  attributes: { neckline: 'v-neck', fit: 'slim fit', pattern: 'solid' },
  attribute_literals: {},
  photo_facts: [
    { key: 'neckline', value: 'v-neck', confidence: 0.8, image_id: IMG, confirmed: false },
    { key: 'fit', value: 'slim fit', confidence: 0.95, image_id: IMG, confirmed: false },
    { key: 'pattern', value: 'solid', confidence: 0.9, image_id: IMG, confirmed: true },
  ],
  image_details: [{ image_id: IMG, slot: 'main', position: 0, status: 'ready', origin: 'seller' as const, compliance_status: 'passed' }],
  etag: '"v1"',
}

const key = productQuery(keysFor('t1'), 'p1').queryKey

function Harness() {
  const { data } = useQuery({ queryKey: key, queryFn: () => base, staleTime: Infinity })
  return data ? <ReviewPhotoValues product={data} afterReject={<button type="button">Generate again</button>} /> : null
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

beforeEach(() => {
  allowed = true
  patchProduct.mockReset()
  fetchProduct.mockReset()
})
afterEach(cleanup)

describe('ReviewPhotoValues', () => {
  it('lists only the values nobody confirmed, each marked From photo, not confirmed', () => {
    setup()
    expect(row('neckline')).not.toBeNull()
    expect(row('fit')).not.toBeNull()
    // Confirmed before: the product page lists it, the review does not.
    expect(row('pattern')).toBeNull()
    expect(within(row('neckline')!).getByText('From photo, not confirmed')).toBeTruthy()
    expect(within(row('fit')!).getByTestId('photo-fact-value').textContent).toBe('Clearly Slim fit')
    expect(screen.getByText(/2 values not confirmed/)).toBeTruthy()
  })

  it('confirms inline and keeps the row as Confirmed', async () => {
    patchProduct.mockResolvedValueOnce({
      ...base,
      photo_facts: base.photo_facts!.map((f) => (f.key === 'neckline' ? { ...f, confirmed: true } : f)),
      etag: '"v2"',
    })
    setup()
    fireEvent.click(within(row('neckline')!).getByTestId('photo-fact-confirm'))
    await waitFor(() => expect(row('neckline')!.dataset.factStatus).toBe('confirmed'))
    expect(patchProduct).toHaveBeenCalledWith('p1', { confirm_attributes: ['neckline'] }, '"v1"')
    expect(within(row('neckline')!).getByText('Confirmed')).toBeTruthy()
    expect(screen.getByText(/1 value not confirmed/)).toBeTruthy()
  })

  it('after a reject lands, says the listing may still use it and offers the next step', async () => {
    let resolve!: (p: ProductDetail) => void
    patchProduct.mockReturnValueOnce(new Promise<ProductDetail>((r) => (resolve = r)))
    setup()
    fireEvent.click(within(row('fit')!).getByTestId('photo-fact-reject'))
    await waitFor(() => expect(row('fit')).toBeNull())
    expect(patchProduct).toHaveBeenCalledWith('p1', { attributes: { fit: null } }, '"v1"')
    // Not shown until the server has removed it.
    expect(screen.queryByTestId('photo-reject-next')).toBeNull()
    await act(async () => resolve({ ...base, attributes: { neckline: 'v-neck', pattern: 'solid' }, photo_facts: base.photo_facts!.filter((f) => f.key !== 'fit'), etag: '"v2"' }))
    const next = await screen.findByTestId('photo-reject-next')
    expect(next.textContent).toContain('Removed fit')
    expect(within(next).getByRole('button', { name: 'Generate again' })).toBeTruthy()
  })

  it('keeps the badges but hides Confirm and Reject without permission', () => {
    allowed = false
    setup()
    expect(screen.queryAllByTestId('photo-fact-confirm')).toHaveLength(0)
    expect(within(row('neckline')!).getByText('From photo, not confirmed')).toBeTruthy()
  })

  it('shows nothing when every photo value is confirmed', () => {
    setup({ ...base, photo_facts: base.photo_facts!.map((f) => ({ ...f, confirmed: true })) })
    expect(screen.queryByTestId('review-photo-values')).toBeNull()
  })
})

describe('review photo rows', () => {
  it('keeps unconfirmed rows and rows acted on here', () => {
    const rows = [
      { key: 'a', label: 'A', value: 'x', status: 'photo' as const },
      { key: 'b', label: 'B', value: 'x', status: 'confirmed' as const },
      { key: 'c', label: 'C', value: 'x', status: 'confirmed' as const },
      { key: 'd', label: 'D', value: 'x', status: 'you' as const },
    ]
    expect(reviewPhotoRows(rows, new Set(['c', 'd'])).map((r) => r.key)).toEqual(['a', 'c'])
    expect(rejectedKeys(new Set(['a', 'b']), [{ key: 'a' }])).toEqual(['b'])
  })
})
