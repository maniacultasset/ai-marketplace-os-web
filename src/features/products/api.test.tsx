import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

const post = vi.fn()
vi.mock('@/api/client', async (orig) => ({ ...(await orig<typeof import('@/api/client')>()), api: { POST: (...a: unknown[]) => post(...a) } }))
vi.mock('@/lib/auth', async (orig) => ({ ...(await orig<typeof import('@/lib/auth')>()), useSession: () => ({ tenantId: 't1' }) }))

const { productQuery, useCreateProduct } = await import('./api')
const { keysFor } = await import('@/lib/query-keys')

describe('useCreateProduct', () => {
  it('keeps the 201 ETag with the cached product, so Edit can PATCH at once', async () => {
    const body = JSON.stringify({ id: 'p1', sku: 'A', title: 'T', status: 'draft', category: 'kurtas', created_at: 'x', updated_at: 'x', attributes: {} })
    post.mockResolvedValueOnce({ data: body, response: new Response(body, { status: 201, headers: { ETag: '"v1"' } }) })
    const qc = new QueryClient()
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    const { result } = renderHook(() => useCreateProduct(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({ sku: 'A', title: 'T', category: 'kurtas', attributes: [] })
    })
    const cached = qc.getQueryData(productQuery(keysFor('t1'), 'p1').queryKey)
    expect(cached?.etag).toBe('"v1"')
  })
})
