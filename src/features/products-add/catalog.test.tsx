import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

type Query = Record<string, unknown>
const get = vi.fn<(path: string, init: { params: { query: Query } }) => unknown>()
vi.mock('@/api/client', async (orig) => ({
  ...(await orig<typeof import('@/api/client')>()),
  api: { GET: (path: string, init: { params: { query: Query } }) => get(path, init) },
}))
vi.mock('@/lib/auth', async (orig) => ({ ...(await orig<typeof import('@/lib/auth')>()), useSession: () => ({ tenantId: 't1' }) }))

const { useListingFilter } = await import('./catalog')

const page = (data: unknown[], next: string | null = null) => ({
  data: { data, page: { has_more: !!next, next_cursor: next, limit: 200 } },
  error: undefined,
  response: new Response(null, { status: 200 }),
})

const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>

describe('useListingFilter (client feedback item 6)', () => {
  it('reads the filter on the server: the bucket and marketplace on both lists, every page', async () => {
    get.mockReset()
    get.mockImplementation((path, { params }) => {
      if (path === '/listings') return Promise.resolve(params.query.cursor ? page([{ id: 'l2', product_id: 'p2' }]) : page([{ id: 'l1', product_id: 'p1' }], 'c1'))
      return Promise.resolve(page([{ id: 'p1' }, { id: 'p2' }]))
    })
    const { result } = renderHook(() => useListingFilter('fully_live', 'amazon'), { wrapper })
    await waitFor(() => expect(result.current.state).toBe('ready'))
    expect(result.current.listings.map((l) => l.id)).toEqual(['l1', 'l2'])
    expect(result.current.products.map((p) => p.id)).toEqual(['p1', 'p2'])
    const listings = get.mock.calls.filter(([p]) => p === '/listings').map(([, init]) => init.params.query)
    expect(listings).toEqual([
      { bucket: 'live', marketplace: 'amazon', limit: 200, cursor: undefined },
      { bucket: 'live', marketplace: 'amazon', limit: 200, cursor: 'c1' },
    ])
    const products = get.mock.calls.filter(([p]) => p === '/products').map(([, init]) => init.params.query)
    expect(products).toEqual([{ listing: 'live', marketplace: 'amazon', limit: 200, cursor: undefined }])
  })

  it('asks nothing without a filter', () => {
    get.mockReset()
    const { result } = renderHook(() => useListingFilter(null, null), { wrapper })
    expect(result.current.state).toBe('ready')
    expect(get).not.toHaveBeenCalled()
  })

  it('reports a failed read as an error, never as an empty list', async () => {
    get.mockReset()
    get.mockImplementation(() => Promise.resolve({ data: undefined, error: { error: { type: 'INTERNAL_ERROR', message: 'm', status: 500 } }, response: new Response(null, { status: 500 }) }))
    const { result } = renderHook(() => useListingFilter('problem', null), { wrapper })
    await waitFor(() => expect(result.current.state).toBe('error'))
  })
})
