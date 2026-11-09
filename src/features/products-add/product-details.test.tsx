import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render as rtlRender, renderHook, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProductDetail } from '@/features/products/api'

vi.mock('@/features/products/api', () => ({
  fetchProduct: vi.fn(),
  useUpdateProduct: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/lib/toast', () => ({ toast: { success: vi.fn(), info: vi.fn() } }))
vi.mock('@/lib/auth', async (orig) => ({ ...(await orig<typeof import('@/lib/auth')>()), useMe: () => ({ data: undefined }) }))

const { useProductEditSession } = await import('./product-edit-session')
const { ProductDetailsEditor } = await import('./product-details')

afterEach(cleanup)

// The editor reads what each marketplace needs (GET /catalog/requirements): give it a client.
const qc = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } })
const wrap = (ui: ReactElement) => <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
const render = (ui: ReactElement) => {
  const view = rtlRender(wrap(ui))
  return { ...view, rerender: (next: ReactElement) => view.rerender(wrap(next)) }
}

// Radix Switch measures itself; jsdom has no ResizeObserver.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver

const product: ProductDetail = {
  id: 'p1',
  sku: 'KS-1',
  title: 'Cotton kurta',
  status: 'active',
  category: 'kurtas',
  created_at: 'x',
  identifier_exemption: false, brand_name_inherited: false, size_chart_read_enabled: false,
  updated_at: 'x',
  attributes: {},
  attribute_literals: {},
  etag: '"v1"',
}

describe('ProductDetailsEditor', () => {
  it('Save changes is disabled until something changed', () => {
    const { result } = renderHook(() => useProductEditSession(product, false, 'none'))
    act(() => result.current.start())
    const view = render(<ProductDetailsEditor session={result.current} />)
    expect((screen.getByTestId('product-save') as HTMLButtonElement).disabled).toBe(true)
    act(() => result.current.patch({ title: 'New title' }))
    view.rerender(<ProductDetailsEditor session={result.current} />)
    expect((screen.getByTestId('product-save') as HTMLButtonElement).disabled).toBe(false)
  })

  it('offers the category only while the product has no listing, and never on a variant', () => {
    const { result } = renderHook(() => useProductEditSession(product, false, 'none'))
    act(() => result.current.start())
    const view = render(<ProductDetailsEditor session={result.current} categoryLock="open" />)
    const trigger = () => screen.getByTestId('e-category') as HTMLButtonElement
    expect(trigger().disabled).toBe(false)
    expect(screen.getByText('Kurta sets and T-shirts can be listed for now.')).toBeTruthy()
    view.rerender(<ProductDetailsEditor session={result.current} categoryLock="locked" />)
    expect(trigger().disabled).toBe(true)
    expect(screen.getByText('Fixed once the product has a listing.')).toBeTruthy()
    view.rerender(<ProductDetailsEditor session={result.current} categoryLock="pending" />)
    expect(trigger().disabled).toBe(true)
    // A failed listings read keeps it fixed (the safe side) and offers a retry.
    const retry = vi.fn()
    view.rerender(<ProductDetailsEditor session={result.current} categoryLock="unknown" onRetryCategoryLock={retry} />)
    expect(trigger().disabled).toBe(true)
    expect(screen.getByText('Couldn’t check for listings, so it stays as it is.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }))
    expect(retry).toHaveBeenCalledOnce()
    cleanup()
    const variant = renderHook(() => useProductEditSession({ ...product, parent_product_id: 'p0' }, true, 'none'))
    act(() => variant.result.current.start())
    render(<ProductDetailsEditor session={variant.result.current} categoryLock="open" />)
    expect(screen.queryByTestId('e-category')).toBeNull()
  })
})

describe('a style’s barcode exemption follows its variants', () => {
  const variant = (id: string, over: Partial<ProductDetail>) => ({ ...product, id, parent_product_id: 'p1', ...over })
  const variants = [
    variant('v1', { identifier_exemption: true }),
    variant('v2', { product_identifier: { type: 'ean', value: '4006381333931' } }),
    variant('v3', { identifier_exemption: false }),
  ]

  it('the card counts the exempt variants', async () => {
    const { ProductDetailsCard } = await import('./product-details')
    const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query')
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ProductDetailsCard product={product} isVariant={false} isStyle variants={variants} source="brand" />
      </QueryClientProvider>,
    )
    expect(screen.getByTestId('product-barcode').textContent).toBe('1 of 3 variants exempt')
  })

  it('the switch reads on when every variant without a barcode is exempt, and a re-chosen value is still sent', () => {
    const all = [variants[0]!, variants[1]!]
    const { result } = renderHook(() => useProductEditSession(product, false, 'brand', true, all))
    act(() => result.current.start())
    expect(result.current.d.barcode.exempt).toBe(true)
    act(() => result.current.patch({ barcode: { ...result.current.d.barcode, exempt: true, touched: true } }))
    expect(result.current.dirty).toBe(true)
  })
})

describe('SI8 and SI9 rows on the card', () => {
  const card = async (p: ProductDetail, isVariant = false) => {
    const { ProductDetailsCard } = await import('./product-details')
    const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query')
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ProductDetailsCard product={p} isVariant={isVariant} source="brand" />
      </QueryClientProvider>,
    )
  }

  it('shows brand, audience and photo read when the backend sends them', async () => {
    await card({
      ...product,
      brand_name: 'Rang Store',
      brand_name_inherited: true,
      gender: 'women',
      photo_read: { status: 'read', at: '2026-11-08T10:00:00Z', written: 2, asked: 0 },
    })
    expect(screen.getByTestId('product-brand').textContent).toBe('Rang Store')
    expect(screen.getByTestId('product-gender').textContent).toBe('Women')
    expect(screen.getByTestId('photo-read').textContent).toContain('2 details filled.')
  })

  it('hides those rows on an older backend', async () => {
    await card(product)
    expect(screen.queryByTestId('product-brand')).toBeNull()
    expect(screen.queryByTestId('product-gender')).toBeNull()
    expect(screen.queryByTestId('photo-read')).toBeNull()
  })

  it('shows a variant’s own colour and size', async () => {
    await card({ ...product, parent_product_id: 'p0', variant_attributes: { color: 'Navy', size: 'M' } }, true)
    expect(screen.getByTestId('variant-axis-color').textContent).toBe('Navy')
    expect(screen.getByTestId('variant-axis-size').textContent).toBe('M')
  })
})
