import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'

const del = vi.fn()
const post = vi.fn()
vi.mock('@/api/client', async (orig) => ({
  ...(await orig<typeof import('@/api/client')>()),
  api: { DELETE: (...a: unknown[]) => del(...a), POST: (...a: unknown[]) => post(...a) },
}))
vi.mock('@/lib/auth', async (orig) => ({ ...(await orig<typeof import('@/lib/auth')>()), useSession: () => ({ tenantId: 't1' }) }))
const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('@/lib/toast', () => ({ toast: toasts, toastError: vi.fn() }))

const { deleteBlock, refusalText, useDeleteProducts } = await import('./delete')
const { DeleteProductsDialog } = await import('./delete-dialog')
const { keysFor } = await import('@/lib/query-keys')

const keys = keysFor('t1')
const ALL = [...keys.products.list(), 'all']
const product = (id: string, parent: string | null = null) => ({ id, sku: id.toUpperCase(), title: `Title ${id}`, parent_product_id: parent })
const listing = (over: Record<string, unknown> = {}) => ({ status: 'validated', marketplace_state: 'not_submitted', external_id: null, ...over })
const ok = (data: unknown) => ({ data, response: new Response(null, { status: 200 }) })
const failed = (status: number, type: string) => ({
  error: { error: { type, message: 'm', status } },
  response: new Response(null, { status }),
})

function seeded() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  qc.setQueryData(ALL, { rows: [product('a'), product('a1', 'a'), product('b'), product('c')], truncated: false })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>
      <TooltipProvider>{children}</TooltipProvider>
    </QueryClientProvider>
  )
  const ids = () => (qc.getQueryData(ALL) as { rows: { id: string }[] }).rows.map((r) => r.id)
  return { qc, wrapper, ids }
}

beforeEach(() => {
  del.mockReset()
  post.mockReset()
  toasts.success.mockReset()
  toasts.error.mockReset()
})
afterEach(cleanup)

describe('deleteBlock', () => {
  it('allows a product whose listings never left Kuinn', () => {
    expect(deleteBlock([])).toBeNull()
    expect(deleteBlock([listing(), listing({ status: 'approved' }), undefined] as never)).toBeNull()
  })

  it('says why while a listing is with a marketplace', () => {
    expect(deleteBlock([listing({ status: 'publishing' })] as never)).toMatch(/being sent/)
    expect(deleteBlock([listing({ status: 'published' })] as never)).toMatch(/sent to a marketplace/)
    expect(deleteBlock([listing({ status: 'failed', marketplace_state: 'rejected' })] as never)).toMatch(/sent to a marketplace/)
    expect(deleteBlock([listing({ external_id: 'ASIN1' })] as never)).toMatch(/sent to a marketplace/)
  })

  it('names each server refusal in plain words', () => {
    expect(refusalText('LISTING_BUSY')).toMatch(/drafting/)
    expect(refusalText('NOT_FOUND')).toMatch(/already deleted/)
    expect(refusalText(undefined)).toMatch(/couldn’t be deleted/)
  })
})

describe('useDeleteProducts', () => {
  it('removes the row and its sizes at once, before the server answers', async () => {
    let answer: (v: unknown) => void = () => undefined
    del.mockReturnValueOnce(new Promise((r) => (answer = r)))
    const { wrapper, ids } = seeded()
    const { result } = renderHook(() => useDeleteProducts(), { wrapper })
    act(() => result.current.mutate(['a']))
    await waitFor(() => expect(ids()).toEqual(['b', 'c']))
    expect(del).toHaveBeenCalledWith('/products/{product_id}', { params: { path: { product_id: 'a' } } })
    await act(async () => answer({ data: undefined, response: new Response(null, { status: 204 }) }))
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.deleted).toEqual(['a'])
  })

  it('puts the rows back when the call fails', async () => {
    del.mockResolvedValueOnce(failed(500, 'INTERNAL_ERROR'))
    const { wrapper, ids } = seeded()
    const { result } = renderHook(() => useDeleteProducts(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync(['a']).catch(() => undefined)
    })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(ids()).toEqual(['a', 'a1', 'b', 'c'])
  })

  it('names a one-product refusal like a bulk item, and puts the rows back', async () => {
    del.mockResolvedValueOnce(failed(409, 'INVALID_STATUS_TRANSITION'))
    const { wrapper, ids } = seeded()
    const { result } = renderHook(() => useDeleteProducts(), { wrapper })
    let out: Awaited<ReturnType<typeof result.current.mutateAsync>> | undefined
    await act(async () => {
      out = await result.current.mutateAsync(['a'])
    })
    expect(out?.deleted).toEqual([])
    expect(out?.refused.get('a')).toMatch(/sent to a marketplace/)
    expect(ids()).toEqual(['a', 'a1', 'b', 'c'])
  })

  it('sends many in one bulk call with a key, and puts back only the refused ones', async () => {
    post.mockResolvedValueOnce(
      ok({
        items: [
          { product_id: 'a', http_status: 204, error: null },
          { product_id: 'b', http_status: 409, error: { error_code: 'INVALID_STATUS_TRANSITION' } },
        ],
      }),
    )
    const { wrapper, ids } = seeded()
    const { result } = renderHook(() => useDeleteProducts(), { wrapper })
    let out: Awaited<ReturnType<typeof result.current.mutateAsync>> | undefined
    await act(async () => {
      out = await result.current.mutateAsync(['a', 'b'])
    })
    const [path, init] = post.mock.calls[0] as [string, { params: { header: Record<string, string> }; body: unknown }]
    expect(path).toBe('/products/bulk-delete')
    expect(init.body).toEqual({ product_ids: ['a', 'b'] })
    expect(init.params.header['Idempotency-Key']).toBeTruthy()
    expect(out?.deleted).toEqual(['a'])
    expect(out?.refused.get('b')).toMatch(/sent to a marketplace/)
    expect(ids()).toEqual(['b', 'c'])
  })

  it('splits more than 100 into calls of 100', async () => {
    post.mockImplementation((_p: string, init: { body: { product_ids: string[] } }) =>
      Promise.resolve(ok({ items: init.body.product_ids.map((id) => ({ product_id: id, http_status: 204, error: null })) })),
    )
    const { wrapper } = seeded()
    const { result } = renderHook(() => useDeleteProducts(), { wrapper })
    const many = Array.from({ length: 150 }, (_, i) => `p${i}`)
    await act(async () => {
      await result.current.mutateAsync(many)
    })
    expect(post.mock.calls.map((c) => (c[1] as { body: { product_ids: string[] } }).body.product_ids.length)).toEqual([100, 50])
  })
})

describe('DeleteProductsDialog', () => {
  const targets = [
    { id: 'a', sku: 'KRT-1', title: 'Blue kurta', variants: 2 },
    { id: 'b', sku: 'KRT-2', title: 'Red kurta' },
  ]

  it('names the products, says questions close and that it can’t be undone, in an in-app dialog', () => {
    const confirmSpy = vi.spyOn(window, 'confirm')
    const { wrapper } = seeded()
    render(<DeleteProductsDialog open onOpenChange={vi.fn()} products={targets} />, { wrapper })
    const dialog = screen.getByTestId('delete-products-dialog')
    expect(dialog.textContent).toContain('Delete 2 products?')
    expect(screen.getByTestId('delete-products-names').textContent).toContain('KRT-1')
    expect(screen.getByTestId('delete-products-names').textContent).toContain('KRT-2')
    expect(dialog.textContent).toContain('2 sizes')
    expect(dialog.textContent).toMatch(/open questions close/)
    expect(dialog.textContent).toMatch(/can’t be undone from the app/)
    expect(confirmSpy).not.toHaveBeenCalled()
  })

  it('deletes on confirm, toasts by name and closes', async () => {
    del.mockResolvedValueOnce({ data: undefined, response: new Response(null, { status: 204 }) })
    const onOpenChange = vi.fn()
    const onDeleted = vi.fn()
    const { wrapper } = seeded()
    render(<DeleteProductsDialog open onOpenChange={onOpenChange} onDeleted={onDeleted} products={[targets[0]!]} />, { wrapper })
    expect(screen.getByTestId('delete-products-dialog').textContent).toContain('Delete KRT-1?')
    fireEvent.click(screen.getByTestId('delete-products-confirm'))
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(toasts.success).toHaveBeenCalledWith('KRT-1 deleted', expect.anything())
    expect(onDeleted).toHaveBeenCalled()
  })

  it('tells which were kept and why', async () => {
    post.mockResolvedValueOnce(
      ok({
        items: [
          { product_id: 'a', http_status: 204, error: null },
          { product_id: 'b', http_status: 409, error: { error_code: 'LISTING_BUSY' } },
        ],
      }),
    )
    const { wrapper } = seeded()
    render(<DeleteProductsDialog open onOpenChange={vi.fn()} products={targets} />, { wrapper })
    fireEvent.click(screen.getByTestId('delete-products-confirm'))
    await waitFor(() => expect(toasts.error).toHaveBeenCalled())
    const [title, opts] = toasts.error.mock.calls[0] as [string, { description: string }]
    expect(title).toBe('1 product deleted, 1 kept')
    expect(opts.description).toMatch(/KRT-2: A listing is drafting/)
  })
})
