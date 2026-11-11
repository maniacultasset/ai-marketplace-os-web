import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/errors'

const get = vi.fn()
const patch = vi.fn()
vi.mock('@/api/client', async (orig) => ({
  ...(await orig<typeof import('@/api/client')>()),
  api: { GET: (...a: unknown[]) => get(...a), PATCH: (...a: unknown[]) => patch(...a) },
}))
const s = vi.hoisted(() => ({ role: 'owner' as 'owner' | 'admin' | 'reviewer' }))
vi.mock('@/lib/auth', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth')>()),
  useSession: () => ({ tenantId: 't1' }),
  useMe: () => ({ data: { user_id: 'me', role: s.role }, isError: false }),
}))
const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
const toastError = vi.hoisted(() => vi.fn())
vi.mock('@/lib/toast', () => ({ toast: toasts, toastError }))

const { OwnerApprovalSetting } = await import('./owner-approval-setting')
const { keysFor } = await import('@/lib/query-keys')

const tenant = (owner_self_approval: boolean) => ({
  id: 't1',
  name: 'Loomline',
  slug: 'loomline',
  status: 'active',
  tone: null,
  guidelines: [],
  glossary: {},
  owner_self_approval,
})
const versioned = (body: unknown, etag: string) => ({ data: body, response: new Response(null, { status: 200, headers: { ETag: etag } }) })
const apiError = (status: number, type: string) => new ApiError({ type: type as never, status, message: 'm', correlationId: 'req-1' })

function setup(on = false) {
  get.mockResolvedValue(versioned(tenant(on), '"v1"'))
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <OwnerApprovalSetting />
    </QueryClientProvider>,
  )
  return qc
}
const toggle = () => screen.findByRole('switch', { name: 'Owners may approve their own listings' })

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  s.role = 'owner'
})

describe('OwnerApprovalSetting', () => {
  it('shows the label, the help and the stable anchor', async () => {
    setup()
    const sw = await toggle()
    expect(sw.getAttribute('aria-checked')).toBe('false')
    expect(screen.getByText('Turn this on if you work alone. Every approval of your own work is recorded in the listing history.')).toBeTruthy()
    expect(screen.getByTestId('owner-approval').id).toBe('owner-approval')
  })

  it('lets an owner turn it on: PATCH with If-Match and owner_self_approval, then the server’s value', async () => {
    const qc = setup()
    const invalidate = vi.spyOn(qc, 'invalidateQueries')
    let answer!: (v: unknown) => void
    patch.mockReturnValue(new Promise((r) => (answer = r)))
    fireEvent.click(await toggle())
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith('/tenants/me', { params: { header: { 'If-Match': '"v1"' } }, body: { owner_self_approval: true } }),
    )
    // Nothing claims "on" before the server says so.
    expect((await toggle()).getAttribute('aria-checked')).toBe('false')
    expect((await toggle()).hasAttribute('disabled')).toBe(true)
    answer(versioned(tenant(true), '"v2"'))
    await waitFor(async () => expect((await toggle()).getAttribute('aria-checked')).toBe('true'))
    expect(toasts.success).toHaveBeenCalledWith('Owner approval is on', expect.anything())
    const cached = qc.getQueryData(keysFor('t1').brand.profile()) as { etag: string }
    expect(cached.etag).toBe('"v2"')
    // Review's approve_hint and self_approval change with it.
    expect(invalidate).toHaveBeenCalledWith({ queryKey: keysFor('t1').listings.all() })
  })

  it('lets an owner turn it off again', async () => {
    setup(true)
    patch.mockResolvedValue(versioned(tenant(false), '"v2"'))
    fireEvent.click(await toggle())
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith('/tenants/me', { params: { header: { 'If-Match': '"v1"' } }, body: { owner_self_approval: false } }),
    )
    await waitFor(async () => expect((await toggle()).getAttribute('aria-checked')).toBe('false'))
  })

  it('is read-only for anyone but an owner, with the current state', async () => {
    for (const role of ['admin', 'reviewer'] as const) {
      s.role = role
      setup(true)
      const sw = await toggle()
      expect(sw.getAttribute('aria-checked')).toBe('true')
      expect(sw.hasAttribute('disabled')).toBe(true)
      expect(screen.getByTestId('owner-approval-readonly').textContent).toBe('Only an owner can change this. It is on.')
      fireEvent.click(sw)
      expect(patch).not.toHaveBeenCalled()
      cleanup()
    }
  })

  it('never states on or off to a non-owner while the brand is still loading', async () => {
    s.role = 'reviewer'
    get.mockReturnValue(new Promise(() => {}))
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <OwnerApprovalSetting />
      </QueryClientProvider>,
    )
    expect((await screen.findByTestId('owner-approval-readonly')).textContent).toBe('Only an owner can change this.')
    expect(screen.getByLabelText('Loading')).toBeTruthy()
  })

  it('changes nothing when the login code is not given (step-up dismissed)', async () => {
    setup()
    patch.mockRejectedValue(apiError(403, 'MFA_STEP_UP_REQUIRED'))
    fireEvent.click(await toggle())
    await waitFor(() => expect(toastError).toHaveBeenCalledWith(expect.objectContaining({ type: 'MFA_STEP_UP_REQUIRED' }), 'Owner approval wasn’t changed'))
    expect((await toggle()).getAttribute('aria-checked')).toBe('false')
    expect(toasts.success).not.toHaveBeenCalled()
  })

  it('on 409 STALE_VERSION reads the latest and asks to try again', async () => {
    setup()
    patch.mockRejectedValue(apiError(409, 'STALE_VERSION'))
    get.mockResolvedValue(versioned(tenant(true), '"v3"'))
    fireEvent.click(await toggle())
    await waitFor(() => expect(toasts.error).toHaveBeenCalledWith('Someone saved a newer version', expect.anything()))
    await waitFor(async () => expect((await toggle()).getAttribute('aria-checked')).toBe('true'))
    expect(toastError).not.toHaveBeenCalled()
  })
})
