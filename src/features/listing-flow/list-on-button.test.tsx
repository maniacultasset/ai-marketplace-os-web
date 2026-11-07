import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'

const s = vi.hoisted(() => ({ flipkart: null as null | { status: string } }))
vi.mock('@/lib/permissions', () => ({ useCan: () => () => true }))
vi.mock('./api', () => ({ useListOn: () => ({ start: vi.fn(), isPending: false }) }))
vi.mock('@/features/marketplaces/api', () => ({
  useCurrentMarketplaceAccounts: () => ({ data: { live: { amazon: null, flipkart: s.flipkart } }, isError: false }),
}))

const { ListOnButton } = await import('./list-on')

afterEach(cleanup)

const view = (marketplace: 'amazon' | 'flipkart') =>
  render(
    <TooltipProvider>
      <ListOnButton productId="p1" marketplace={marketplace} />
    </TooltipProvider>,
  )

describe('ListOnButton', () => {
  it('Flipkart is an honest Coming soon until it is connected', () => {
    view('flipkart')
    const b = screen.getByTestId('list-on-flipkart')
    expect(b.getAttribute('aria-disabled')).toBe('true')
    expect(screen.getByText('Connecting Flipkart is coming soon. Flipkart drafts open once it is connected.')).toBeTruthy()
  })

  it('a connected Flipkart can be listed', () => {
    s.flipkart = { status: 'active' }
    view('flipkart')
    const b = screen.getByTestId('list-on-flipkart') as HTMLButtonElement
    expect(b.getAttribute('aria-disabled')).toBeNull()
    expect(b.disabled).toBe(false)
    s.flipkart = null
  })

  it('Amazon can start a draft before it is connected', () => {
    view('amazon')
    expect((screen.getByTestId('list-on-amazon') as HTMLButtonElement).disabled).toBe(false)
  })
})
