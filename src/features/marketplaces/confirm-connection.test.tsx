import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const PAUSED = 'Publishing to Amazon is paused for now. Approving keeps the listing ready.'
const s = vi.hoisted(() => ({
  tenant: undefined as undefined | { capabilities?: { amazon_publishing_enabled: boolean } },
  account: { publishing_enabled: true as boolean },
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
  useNavigate: () => vi.fn(),
}))
vi.mock('@/lib/permissions', () => ({ useCan: () => () => true }))
vi.mock('@/features/marketplaces-settings/use-start-connect', () => ({
  clearConnectOrigin: vi.fn(),
  readConnectOrigin: () => ({}),
}))
vi.mock('@/features/brand/api', async (orig) => ({
  ...(await orig<typeof import('@/features/brand/api')>()),
  useBrandProfile: () => ({ data: s.tenant ? { data: s.tenant, etag: null } : undefined, isPending: !s.tenant }),
}))
vi.mock('./api', () => ({
  PENDING_HANDLE_RE: /^.+$/,
  useConfirmConnection: () => ({
    mutate: vi.fn(),
    isSuccess: true,
    isError: false,
    error: null,
    data: {
      id: 'a1',
      marketplace: 'amazon',
      seller_id: 'A1SELLER',
      status: 'active',
      created_at: '2026-11-09T10:00:00Z',
      ...s.account,
    },
  }),
}))

const { ConfirmConnection } = await import('./confirm-connection')

afterEach(() => {
  cleanup()
  s.tenant = undefined
  s.account = { publishing_enabled: true }
})

const success = () => screen.getByTestId('connect-success').textContent ?? ''

describe('connect success (tenant capabilities)', () => {
  it('says publishing is paused while Amazon publishing is off, and never that it will publish', () => {
    s.tenant = { capabilities: { amazon_publishing_enabled: false } }
    render(<ConfirmConnection urlPending="h1" />)
    expect(success()).toContain(PAUSED)
    expect(success()).not.toMatch(/can now be published/)
  })

  it('reads the account switch too, before the tenant read lands', () => {
    s.account = { publishing_enabled: false }
    render(<ConfirmConnection urlPending="h1" />)
    expect(success()).toContain(PAUSED)
  })

  it('keeps the publish line while Amazon publishing is on', () => {
    s.tenant = { capabilities: { amazon_publishing_enabled: true } }
    render(<ConfirmConnection urlPending="h1" />)
    expect(success()).toContain('Approved listings can now be published to Amazon.')
  })
})
