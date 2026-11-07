import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

const post = vi.fn()
const patch = vi.fn()
vi.mock('@/api/client', async (orig) => ({
  ...(await orig<typeof import('@/api/client')>()),
  api: { POST: (...a: unknown[]) => post(...a), PATCH: (...a: unknown[]) => patch(...a) },
}))
vi.mock('@/lib/auth', async (orig) => ({ ...(await orig<typeof import('@/lib/auth')>()), useSession: () => ({ tenantId: 't1' }) }))

const { productQuery, useCreateProduct, useUpdateProduct } = await import('./api')
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

describe('useUpdateProduct', () => {
  const body = JSON.stringify({ id: 'p1', sku: 'A', title: 'T', status: 'draft', category: 'kurtas', created_at: 'x', updated_at: 'x', attributes: {} })
  const saved = () => ({ data: body, response: new Response(body, { status: 200, headers: { ETag: '"v2"' } }) })

  async function save(patchBody: Record<string, unknown>) {
    patch.mockResolvedValueOnce(saved())
    const qc = new QueryClient()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    const { result } = renderHook(() => useUpdateProduct('p1'), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({ body: patchBody, etag: '"v1"' })
    })
    return spy.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey)
  }

  it('refreshes the Inbox questions when attributes change, since a seller value closes their open question', async () => {
    const keys = await save({ attributes: { neckline: 'round neck' } })
    expect(keys).toContainEqual(keysFor('t1').tasks.all())
  })

  it('leaves the questions alone for other changes', async () => {
    const keys = await save({ title: 'New' })
    expect(keys).not.toContainEqual(keysFor('t1').tasks.all())
  })
})
