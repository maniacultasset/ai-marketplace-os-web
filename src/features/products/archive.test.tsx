import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const post = vi.fn()
vi.mock('@/api/client', async (orig) => ({
  ...(await orig<typeof import('@/api/client')>()),
  api: { POST: (...a: unknown[]) => post(...a) },
}))
vi.mock('@/lib/auth', async (orig) => ({ ...(await orig<typeof import('@/lib/auth')>()), useSession: () => ({ tenantId: 't1' }) }))
const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), toastError: vi.fn() }))
vi.mock('@/lib/toast', () => ({ toast: { success: toasts.success, error: toasts.error }, toastError: toasts.toastError }))

const { archiveBlock, useArchiveProduct } = await import('./archive')
const { keysFor } = await import('@/lib/query-keys')
const keys = keysFor('t1')

const listing = (over: Record<string, unknown> = {}) => ({ status: 'validated', marketplace_state: 'not_submitted', external_id: null, ...over })
const ok = (data: unknown) => ({ data, response: new Response(null, { status: 200 }) })

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  qc.setQueryData(keys.products.detail('p1'), { id: 'p1', sku: 'KTEST-1', archived_at: null })
  const W = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  return { qc, W }
}

beforeEach(() => {
  post.mockReset()
  toasts.success.mockReset()
  toasts.toastError.mockReset()
})
afterEach(cleanup)

describe('archiveBlock (as delete refuses)', () => {
  it('allows a product whose listings never left Kuinn', () => {
    expect(archiveBlock([listing(), undefined] as never)).toBeNull()
  })
  it('says why while a listing is with a marketplace', () => {
    expect(archiveBlock([listing({ status: 'publishing' })] as never)).toMatch(/being sent/)
    expect(archiveBlock([listing({ status: 'published' })] as never)).toMatch(/can’t be archived/)
  })
})

describe('useArchiveProduct (Chrome pass 2: archive apart from delete)', () => {
  it('archives through POST /products/{id}/archive and keeps the product', async () => {
    post.mockResolvedValue(ok({ id: 'p1', sku: 'KTEST-1', archived_at: '2026-11-12T10:00:00Z' }))
    const { qc, W } = wrapper()
    const { result } = renderHook(() => useArchiveProduct('p1', 'KTEST-1'), { wrapper: W })
    act(() => result.current.mutate(true))
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(post).toHaveBeenCalledWith('/products/{product_id}/archive', { params: { path: { product_id: 'p1' } } })
    expect((qc.getQueryData(keys.products.detail('p1')) as { archived_at: string }).archived_at).toBe('2026-11-12T10:00:00Z')
    expect(toasts.success).toHaveBeenCalledWith('KTEST-1 archived', expect.anything())
  })

  it('unarchives through POST /products/{id}/unarchive', async () => {
    post.mockResolvedValue(ok({ id: 'p1', sku: 'KTEST-1', archived_at: null }))
    const { W } = wrapper()
    const { result } = renderHook(() => useArchiveProduct('p1', 'KTEST-1'), { wrapper: W })
    act(() => result.current.mutate(false))
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(post).toHaveBeenCalledWith('/products/{product_id}/unarchive', { params: { path: { product_id: 'p1' } } })
    expect(toasts.success).toHaveBeenCalledWith('KTEST-1 is back', expect.anything())
  })

  it('says why the server refused', async () => {
    post.mockResolvedValue({ error: { error: { type: 'INVALID_STATUS_TRANSITION', message: 'm', status: 409 } }, response: new Response(null, { status: 409 }) })
    const { W } = wrapper()
    const { result } = renderHook(() => useArchiveProduct('p1', 'KTEST-1'), { wrapper: W })
    act(() => result.current.mutate(true))
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(toasts.toastError).toHaveBeenCalledWith(expect.anything(), 'KTEST-1 wasn’t archived. A listing was sent to a marketplace.')
  })
})
