import { act, cleanup, render, renderHook, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProductDetail } from '@/features/products/api'

vi.mock('@/features/products/api', () => ({
  fetchProduct: vi.fn(),
  useUpdateProduct: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/lib/toast', () => ({ toast: { success: vi.fn(), info: vi.fn() } }))

const { useProductEditSession } = await import('./product-edit-session')
const { ProductDetailsEditor } = await import('./product-details')

afterEach(cleanup)

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
})
