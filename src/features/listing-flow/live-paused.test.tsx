import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const PAUSED = 'Publishing to Amazon is paused for now. Approving keeps the listing ready.'
const s = vi.hoisted(() => ({
  tenant: undefined as undefined | { capabilities?: { amazon_publishing_enabled: boolean } },
}))

const listing = {
  id: 'l1',
  product_id: 'p1',
  marketplace: 'amazon',
  status: 'approved',
  status_reason: null,
  marketplace_state: 'not_submitted',
  current_version_id: 'v1',
  approved_version_id: 'v1',
  live_url: null,
  validation: null,
  content: null,
  status_changed_at: '2026-11-09T10:00:00Z',
  updated_at: '2026-11-09T10:00:00Z',
}
const empty = { rows: [], isPending: false, error: null, hasNextPage: false, refetch: vi.fn() }

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...p }: { children: ReactNode; 'data-testid'?: string }) => <a data-testid={p['data-testid']}>{children}</a>,
}))
vi.mock('@/lib/permissions', () => ({ useCan: () => () => true }))
vi.mock('@/features/brand/api', async (orig) => {
  const real = await orig<typeof import('@/features/brand/api')>()
  // The shared hook, on the real helper: the tenant read is the only input.
  return { ...real, useAmazonPublishing: () => ({ paused: real.isAmazonPublishingPaused(s.tenant as Parameters<typeof real.isAmazonPublishingPaused>[0]), known: !!s.tenant }) }
})
vi.mock('@/features/listings/api', () => ({
  useListing: () => ({ isPending: false, error: null, data: { data: listing } }),
  useListingHistory: () => empty,
  useListingSubmissions: () => empty,
  useRefreshStatus: () => ({ mutate: vi.fn(), isPending: false }),
}))
// Item 17: owner approval off (the brand read is mocked above without a QueryClient).
vi.mock('@/features/team-account/approver', async (orig) => ({ ...(await orig<object>()), useOwnerMayApproveOwn: () => false }))
vi.mock('./list-on', () => ({ ListOnButton: () => null }))
vi.mock('@/features/listings/job-memory', () => ({ recallJob: () => 'job-1' }))
vi.mock('@/features/products/api', () => ({ useProduct: () => ({ isPending: false, data: { title: 'Kurta set', sku: 'K1' } }) }))
vi.mock('./api', () => ({
  useListingResolution: () => ({ isPending: false, data: null }),
  useIssueHistory: () => ({ isPending: false, data: null }),
  useListingStatus: () => ({ isPending: false, data: { status: 'approved', marketplace_state: 'not_submitted' } }),
  useProductListings: () => ({ ...empty, rows: [listing] }),
}))

const { LiveScreen } = await import('./live')

afterEach(() => {
  cleanup()
  s.tenant = undefined
})

const hero = () => screen.getByTestId('live-hero').textContent ?? ''

describe('Live screen (tenant capabilities)', () => {
  it('while Amazon publishing is off: an approved listing reads Approved · publishing paused, with nothing to publish', () => {
    s.tenant = { capabilities: { amazon_publishing_enabled: false } }
    render(<LiveScreen listingId="l1" />)
    expect(hero()).toContain('Approved · publishing paused')
    expect(hero()).toContain(PAUSED)
    expect(hero()).not.toMatch(/goes out|Review and approve/)
    expect(screen.getByTestId('live-open-review').textContent).toBe('Open the listing')
    expect(screen.queryByRole('button', { name: /publish|resend/i })).toBeNull()
    expect(screen.queryByText('Watch the publish run')).toBeNull()
  })

  it('publishing on: the listing goes out once published, as before', () => {
    s.tenant = { capabilities: { amazon_publishing_enabled: true } }
    render(<LiveScreen listingId="l1" />)
    expect(hero()).toContain('It goes out after a person approves it and it is published.')
    expect(screen.getByText('Watch the publish run')).toBeTruthy()
  })
})
