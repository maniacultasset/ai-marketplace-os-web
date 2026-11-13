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

const { archiveBlock, archivedDraftBlock, archivedFamilyNote, ARCHIVED_DRAFT_REASON, useArchiveProduct } = await import('./archive')
const { productQuery } = await import('./api')
const { keysFor } = await import('@/lib/query-keys')
const keys = keysFor('t1')

const listing = (over: Record<string, unknown> = {}) => ({ status: 'validated', marketplace_state: 'not_submitted', external_id: null, ...over })
const ok = (data: unknown) => ({ data, response: new Response(null, { status: 200 }) })

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  // The detail page reads the product under productQuery's key (`detail(id)` + 'exact').
  qc.setQueryData(productQuery(keys, 'p1').queryKey, { id: 'p1', sku: 'KTEST-1', archived_at: null, attribute_literals: {} } as never)
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
    // The page's own entry changes at once (the banner and header update without a reload).
    const cached = qc.getQueryData(productQuery(keys, 'p1').queryKey) as { archived_at: string; attribute_literals: object }
    expect(cached.archived_at).toBe('2026-11-12T10:00:00Z')
    expect(cached.attribute_literals).toEqual({})
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

describe('archive refreshes every view it changes (prod Chrome check 13 Nov)', () => {
  it.each([true, false])('archive=%s invalidates the product, its lists and variants, listings, issues, tasks and Home', async (archive) => {
    post.mockResolvedValue(ok({ id: 'p1', sku: 'KTEST-1', archived_at: archive ? '2026-11-12T10:00:00Z' : null }))
    const { qc, W } = wrapper()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useArchiveProduct('p1', 'KTEST-1'), { wrapper: W })
    act(() => result.current.mutate(archive))
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const invalidated = spy.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey))
    for (const key of [keys.products.all(), keys.listings.all(), keys.issues.all(), keys.tasks.all(), keys.analytics.all()])
      expect(invalidated).toContain(JSON.stringify(key))
    // products.all() covers the detail ('exact'), every list and the archived walk (the variants).
    for (const key of [productQuery(keys, 'p1').queryKey, [...keys.products.list(), 'all'], [...keys.products.list(), 'archived']])
      expect(key.slice(0, keys.products.all().length)).toEqual([...keys.products.all()])
  })

  it('points the toast at the Archived view', async () => {
    post.mockResolvedValue(ok({ id: 'p1', sku: 'KTEST-1', archived_at: '2026-11-12T10:00:00Z' }))
    const { W } = wrapper()
    const { result } = renderHook(() => useArchiveProduct('p1', 'KTEST-1'), { wrapper: W })
    act(() => result.current.mutate(true))
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(toasts.success).toHaveBeenCalledWith('KTEST-1 archived', { description: expect.stringMatching(/under Archived in Products/) })
  })
})

describe('archived product: draft off, variants kept', () => {
  it('blocks every draft action with the reason while archived_at is set', () => {
    expect(ARCHIVED_DRAFT_REASON).toBe('Archived. Unarchive it to draft.')
    expect(archivedDraftBlock({ archived_at: '2026-11-12T10:00:00Z' })).toBe(ARCHIVED_DRAFT_REASON)
    expect(archivedDraftBlock({ archived_at: null })).toBeNull()
    expect(archivedDraftBlock({})).toBeNull()
  })
  it('notes the variants as archived with the style, never a single item', () => {
    expect(archivedFamilyNote(8)).toBe('8 variants, archived with this product. Unarchive it to edit or draft them.')
    expect(archivedFamilyNote(1)).toMatch(/^1 variant,/)
    expect(archivedFamilyNote(8)).not.toMatch(/single item/)
  })
})
