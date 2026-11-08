import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/errors'
import type { ProductDetail } from '@/features/products/api'

const mutateAsync = vi.fn()
const fetchProduct = vi.fn()
const toast = { success: vi.fn(), info: vi.fn() }

vi.mock('@/features/products/api', () => ({
  fetchProduct: (...a: unknown[]) => fetchProduct(...a),
  useUpdateProduct: () => ({ mutateAsync, isPending: false }),
}))
vi.mock('@/lib/toast', () => ({ toast }))

const { useProductEditSession } = await import('./product-edit-session')

const product = (over: Partial<ProductDetail> = {}): ProductDetail => ({
  id: 'p1',
  sku: 'KS-1',
  title: 'Cotton kurta',
  status: 'active',
  category: 'kurtas',
  created_at: '2026-11-07T10:00:00Z',
  identifier_exemption: false, brand_name_inherited: false,
  updated_at: '2026-11-07T10:00:00Z',
  attributes: {},
  mrp: '1299.00',
  attribute_literals: {},
  etag: '"v1"',
  ...over,
})

const stale = () => new ApiError({ type: 'STALE_VERSION', status: 409, message: 'stale' })

beforeEach(() => {
  mutateAsync.mockReset()
  fetchProduct.mockReset()
  toast.success.mockReset()
  toast.info.mockReset()
})

function setup(p = product()) {
  const r = renderHook(() => useProductEditSession(p, false, 'none'))
  act(() => r.result.current.start())
  return r
}

describe('product edit session', () => {
  it('409: keeps my change on top of theirs; the retry never reverts their MRP', async () => {
    const r = setup()
    act(() => r.result.current.patch({ title: 'My title' }))
    mutateAsync.mockRejectedValueOnce(stale())
    fetchProduct.mockResolvedValueOnce(product({ mrp: '999.00', updated_at: '2026-11-07T11:00:00Z', etag: '"v2"' }))
    let out: string | undefined
    await act(async () => {
      out = await r.result.current.save()
    })
    expect(out).toBe('stale')
    expect(r.result.current.stale).toBe(true)
    expect(r.result.current.d.mrp).toBe('999.00')
    expect(r.result.current.d.title).toBe('My title')
    mutateAsync.mockResolvedValueOnce(product({ title: 'My title', mrp: '999.00', etag: '"v3"' }))
    await act(async () => {
      await r.result.current.save()
    })
    expect(mutateAsync).toHaveBeenLastCalledWith({ body: { title: 'My title' }, etag: '"v2"' })
  })

  it('409 and the re-read fails: shows that error, no loop', async () => {
    const r = setup()
    act(() => r.result.current.patch({ title: 'My title' }))
    mutateAsync.mockRejectedValueOnce(stale())
    const readErr = new ApiError({ type: 'INTERNAL_ERROR', status: 500, message: 'down' })
    fetchProduct.mockRejectedValueOnce(readErr)
    let out: string | undefined
    await act(async () => {
      out = await r.result.current.save()
    })
    expect(out).toBe('failed')
    expect(r.result.current.error).toBe(readErr)
    expect(mutateAsync).toHaveBeenCalledTimes(1)
  })

  it('a product cached without an ETag is read before the PATCH', async () => {
    const r = setup(product({ etag: undefined }))
    act(() => r.result.current.patch({ title: 'My title' }))
    fetchProduct.mockResolvedValueOnce(product({ etag: '"v9"' }))
    mutateAsync.mockResolvedValueOnce(product({ title: 'My title', etag: '"v10"' }))
    await act(async () => {
      await r.result.current.save()
    })
    expect(mutateAsync).toHaveBeenCalledWith({ body: { title: 'My title' }, etag: '"v9"' })
    expect(toast.success).toHaveBeenCalled()
  })

  it('a save the server applied as a no-op is not reported as saved', async () => {
    const r = setup()
    act(() => r.result.current.patch({ title: 'My title' }))
    mutateAsync.mockResolvedValueOnce(product())
    await act(async () => {
      await r.result.current.save()
    })
    expect(toast.success).not.toHaveBeenCalled()
    expect(toast.info).toHaveBeenCalled()
  })

  it('cancel with unsaved changes asks first', () => {
    const r = setup()
    act(() => r.result.current.patch({ title: 'My title' }))
    act(() => r.result.current.cancel())
    expect(r.result.current.editing).toBe(true)
    expect(r.result.current.confirmCancel).toBe(true)
    act(() => r.result.current.discard())
    expect(r.result.current.editing).toBe(false)
  })
})
