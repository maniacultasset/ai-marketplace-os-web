import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
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

  it('keeps Flipkart chosen once it is connected', () => {
    s.flipkart = { status: 'active' }
    view()
    expect(screen.getByTestId('start-generate').textContent).toBe('Start 1 draft')
    s.flipkart = null
  })
})
