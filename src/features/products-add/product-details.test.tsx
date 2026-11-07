import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
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
  identifier_exemption: false,
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
