import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const get = vi.fn()
const patch = vi.fn()
vi.mock('@/api/client', async (orig) => ({
  ...(await orig<typeof import('@/api/client')>()),
  api: { GET: (...a: unknown[]) => get(...a), PATCH: (...a: unknown[]) => patch(...a) },
}))
const s = vi.hoisted(() => ({ role: 'owner' as 'owner' | 'admin' | 'operator' }))
vi.mock('@/lib/auth', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth')>()),
  useSession: () => ({ tenantId: 't1' }),
  useMe: () => ({ data: { user_id: 'me', role: s.role }, isError: false }),
}))
const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
const toastError = vi.hoisted(() => vi.fn())
vi.mock('@/lib/toast', () => ({ toast: toasts, toastError }))

const { AutoFixSetting } = await import('./auto-fix-setting')
const { AUTO_FIX_SETTING, modeWith } = await import('./model')

const tenant = (auto_fix_enabled: boolean) => ({
  id: 't1',
  name: 'Loomline',
  slug: 'loomline',
  status: 'active',
  tone: null,
  guidelines: [],
  glossary: {},
  owner_self_approval: false,
  auto_fix_enabled,
})
const versioned = (body: unknown, etag: string) => ({ data: body, response: new Response(null, { status: 200, headers: { ETag: etag } }) })

function setup(on = true) {
  get.mockResolvedValue(versioned(tenant(on), '"v1"'))
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <AutoFixSetting />
    </QueryClientProvider>,
  )
  return qc
}
const toggle = () => screen.findByRole('switch', { name: AUTO_FIX_SETTING.label })
const modes = () => [...screen.getByTestId('autonomy-auto-fix').querySelectorAll('li')].map((li) => li.getAttribute('data-mode'))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  s.role = 'owner'
})

describe('AutoFixSetting', () => {
  it('is on by default and says what runs on its own', async () => {
    setup()
    expect((await toggle()).getAttribute('aria-checked')).toBe('true')
    expect(modes()).toEqual(['auto', 'auto', 'planned', 'planned', 'approval'])
    expect(screen.getByTestId('autonomy-auto-fix').textContent).toContain('On its own')
    expect(screen.getByTestId('autonomy-auto-fix').id).toBe('auto-fix')
  })

  it('off: every fix waits for you, and the card says so', async () => {
    setup(false)
    expect((await toggle()).getAttribute('aria-checked')).toBe('false')
    expect(modes()).toEqual(['approval', 'approval', 'planned', 'planned', 'approval'])
    const text = screen.getByTestId('autonomy-auto-fix').textContent ?? ''
    expect(text).toContain(AUTO_FIX_SETTING.offHelp)
    expect(text).not.toContain('On its own')
  })

  it('lets an owner turn it off: PATCH with If-Match, then the server’s value', async () => {
    setup()
    let answer!: (v: unknown) => void
    patch.mockReturnValue(new Promise((r) => (answer = r)))
    fireEvent.click(await toggle())
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith('/tenants/me', { params: { header: { 'If-Match': '"v1"' } }, body: { auto_fix_enabled: false } }),
    )
    expect((await toggle()).getAttribute('aria-checked')).toBe('true') // nothing moves before the server says so
    answer(versioned(tenant(false), '"v2"'))
    await waitFor(async () => expect((await toggle()).getAttribute('aria-checked')).toBe('false'))
    expect(toasts.success).toHaveBeenCalledWith('Automatic fixes are off', expect.anything())
  })

  it('is read-only for anyone but an owner', async () => {
    s.role = 'admin'
    setup()
    expect((await toggle()).hasAttribute('disabled')).toBe(true)
    expect(screen.getByTestId('auto-fix-readonly').textContent).toContain('Only an owner can change this. It is on.')
    fireEvent.click(await toggle())
    expect(patch).not.toHaveBeenCalled()
  })

  it('maps each fix mode under the setting', () => {
    expect(modeWith('auto', true)).toBe('auto')
    expect(modeWith('auto', false)).toBe('approval')
    expect(modeWith('planned', false)).toBe('planned')
  })
})
