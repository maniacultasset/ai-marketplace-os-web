import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...rest }: { to: string; children: ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}))
vi.mock('@/lib/query-keys', () => ({ useKeys: () => ({}) }))
const s = vi.hoisted(() => ({ flipkart: null as null | { status: string } }))
vi.mock('@/features/marketplaces/api', () => ({
  useCurrentMarketplaceAccounts: () => ({ data: { live: { amazon: { status: 'active' }, flipkart: s.flipkart } }, error: null }),
}))

// B19: the first 10 drafts start, the rest are accepted and wait for a free slot (still a 202).
const sent = vi.hoisted(() => ({ n: 0 }))
vi.mock('@/api/client', async (orig) => ({
  ...(await orig<typeof import('@/api/client')>()),
  api: {
    POST: async () => {
      const n = ++sent.n
      const data = { job_id: `j${n}`, listing_id: `l${n}`, poll_url: `/api/v1/jobs/j${n}`, status: 'queued', estimated_duration_seconds: 30, waiting_for_slot: n > 10 }
      return { data, response: new Response(null, { status: 202 }) }
    },
  },
}))
vi.mock('@/features/listings/api', async (orig) => ({ ...(await orig<typeof import('@/features/listings/api')>()), invalidateListingWork: vi.fn() }))

const { AddMarketplaceDialog } = await import('./add-marketplace-dialog')

afterEach(cleanup)

const product = { id: 'p1', sku: 'KRT-1', title: 'Kurta', parent_product_id: null }
const view = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <TooltipProvider>
        <AddMarketplaceDialog open onOpenChange={vi.fn()} products={[product]} listingsOf={() => ({})} initial={['flipkart']} />
      </TooltipProvider>
    </QueryClientProvider>,
  )

describe('AddMarketplaceDialog', () => {
  it('never sends a Flipkart draft the person cannot untick while Flipkart is not connected', () => {
    view()
    expect(screen.queryByRole('checkbox', { name: /Flipkart/ })).toBeNull()
    expect((screen.getByTestId('start-generate') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('Choose at least one marketplace.')).toBeTruthy()
  })

  it('shows 34 drafts past the brand cap as drafting and waiting, never as failed (B19)', async () => {
    sent.n = 0
    const products = Array.from({ length: 34 }, (_, i) => ({ id: `p${i}`, sku: `KRT-${i}`, title: 'Kurta', parent_product_id: null }))
    render(
      <QueryClientProvider client={new QueryClient()}>
        <TooltipProvider>
          <AddMarketplaceDialog open onOpenChange={vi.fn()} products={products} listingsOf={() => ({})} initial={['amazon']} />
        </TooltipProvider>
      </QueryClientProvider>,
    )
    await userEvent.click(screen.getByTestId('start-generate'))
    const results = await waitFor(() => screen.getByTestId('generate-results'))
    expect(sent.n).toBe(34)
    expect(results.textContent).toContain('34 drafts queued')
    expect(results.textContent).toContain('10 drafting, 24 waiting for a free slot. Kuinn starts each one as a slot frees up.')
    expect(screen.getAllByText(/Waiting for a free slot/)).toHaveLength(24)
    expect(results.textContent).not.toMatch(/not started|too many requests/i)
    expect(screen.queryByRole('button', { name: /Retry/ })).toBeNull()
  })

  it('keeps Flipkart chosen once it is connected', () => {
    s.flipkart = { status: 'active' }
    view()
    expect(screen.getByTestId('start-generate').textContent).toBe('Start 1 draft')
    s.flipkart = null
  })
})
