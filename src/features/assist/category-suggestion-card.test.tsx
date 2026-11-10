import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProductDetail } from '@/features/products/api'

const post = vi.fn()
vi.mock('@/api/client', async (orig) => ({ ...(await orig<typeof import('@/api/client')>()), api: { POST: (...a: unknown[]) => post(...a) } }))
const mutate = vi.fn()
vi.mock('@/features/products/api', async (orig) => ({ ...(await orig<object>()), useUpdateProduct: () => ({ mutate, isPending: false }) }))
vi.mock('@/lib/auth', async (orig) => ({ ...(await orig<typeof import('@/lib/auth')>()), useSession: () => ({ tenantId: 't1' }) }))
vi.mock('@/lib/permissions', async (orig) => ({ ...(await orig<typeof import('@/lib/permissions')>()), useCan: () => () => true }))
vi.mock('./flags', async (orig) => ({ ...(await orig<object>()), useLampsEnabled: () => ({ enabled: false, pending: false }) }))

const { CategorySuggestionCard } = await import('./category-suggestion-card')

const product = (over: Partial<ProductDetail> = {}): ProductDetail => ({
  id: 'p1',
  sku: 'KS-1',
  title: 'Cotton kurta set',
  category: null,
  status: 'draft',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  identifier_exemption: false,
  brand_name_inherited: false,
  size_chart_read_enabled: false,
  category_suggest_enabled: true, photo_reading: false,
  attribute_literals: {},
  etag: '"e1"',
  ...over,
})

const suggested = {
  category: {
    status: 'suggested' as const,
    candidates: [
      { category: 'tshirts', confidence: 0.31, rationale: 'Short sleeves in one photo.' },
      { category: 'ethnic_wear_kurta_sets', confidence: 0.64, rationale: 'The title says kurta set and the photo shows a dupatta.' },
    ],
  },
}

function setup(p: ProductDetail) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <CategorySuggestionCard product={p} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  post.mockReset()
  mutate.mockReset()
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})
afterEach(cleanup)

describe('CategorySuggestionCard (SI14)', () => {
  it('renders nothing while the switch is off', () => {
    const { container } = setup(product({ category_suggest_enabled: false, photo_reading: false, suggestions: suggested }))
    expect(container.innerHTML).toBe('')
  })

  it('renders nothing for a product that already has a category', () => {
    const { container } = setup(product({ category: 'tshirts', suggestions: suggested }))
    expect(container.innerHTML).toBe('')
  })

  it('shows the candidates with confidence and reason, highest first, and saves only the seller’s pick', async () => {
    setup(product({ suggestions: suggested }))
    const rows = screen.getAllByTestId('category-candidate')
    expect(rows.map((r) => r.dataset.category)).toEqual(['ethnic_wear_kurta_sets', 'tshirts'])
    expect(rows[0]!.textContent).toContain('Possible · 64%')
    expect(rows[0]!.textContent).toContain('The title says kurta set')
    expect(mutate).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('radio', { name: /T-shirts/ }))
    await userEvent.click(screen.getByTestId('category-choose'))
    expect(screen.getByTestId('category-choose').textContent).toBe('Use T-shirts')
    expect(mutate.mock.calls[0]![0]).toEqual({ body: { category: 'tshirts' }, etag: '"e1"' })
  })

  it('asks Kuinn on request and follows the product while it reads', async () => {
    post.mockResolvedValue({ data: { product_id: 'p1', status: 'queued', job_id: 'j1' }, error: undefined, response: new Response('{}', { status: 202 }) })
    setup(product())
    await userEvent.click(screen.getByTestId('category-ask'))
    expect(post.mock.calls[0]![0]).toBe('/products/{product_id}/category-suggestion')
    expect(post.mock.calls[0]![1].params.header['Idempotency-Key']).toBeTruthy()
    await waitFor(() => expect(screen.getByTestId('category-suggestion-waiting')).toBeTruthy())
  })

  it('says so when Kuinn has no confident answer, and offers a retry only after a failure', () => {
    setup(product({ suggestions: { category: { status: 'failed' } } }))
    expect(screen.getByTestId('category-suggestion').dataset.view).toBe('none')
    expect(screen.getByTestId('category-ask').textContent).toBe('Try again')
    cleanup()
    setup(product({ suggestions: { category: { status: 'unavailable' } } }))
    expect(screen.queryByTestId('category-ask')).toBeNull()
  })
})
