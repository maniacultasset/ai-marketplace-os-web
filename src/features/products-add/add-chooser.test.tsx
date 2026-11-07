import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'

const navigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }))
vi.mock('@/features/marketplaces/api', () => ({
  useCurrentMarketplaceAccounts: () => ({ data: { live: { amazon: { status: 'active' }, flipkart: null } }, error: null }),
}))

const { AddChooser } = await import('./add-chooser')

afterEach(() => {
  cleanup()
  navigate.mockReset()
})

const view = () =>
  render(
    <TooltipProvider>
      <AddChooser />
    </TooltipProvider>,
  )

describe('AddChooser', () => {
  it('shows only routes that work, with no Coming soon cards', () => {
    view()
    expect(screen.getAllByRole('radio').map((r) => r.getAttribute('data-testid'))).toEqual(['route-guided', 'route-bulk', 'route-photos'])
    for (const gone of ['Catalog export', 'Product page URL', 'PIM or ERP']) expect(screen.queryByText(gone)).toBeNull()
    expect(screen.getByRole('radiogroup').textContent).not.toContain('Coming soon')
  })

  it('"Photos and basics" opens the guided form on its photos', () => {
    view()
    fireEvent.click(screen.getByTestId('route-photos'))
    fireEvent.click(screen.getByTestId('add-continue'))
    expect(navigate).toHaveBeenCalledWith({ to: '/add/guided', search: { on: 'amazon', start: 'photos' } })
  })

  it('arrow keys move both ways through the routes', () => {
    view()
    const group = screen.getByRole('radiogroup')
    fireEvent.keyDown(group, { key: 'ArrowLeft' })
    expect(screen.getByTestId('route-photos').getAttribute('aria-checked')).toBe('true')
    fireEvent.keyDown(group, { key: 'ArrowRight' })
    expect(screen.getByTestId('route-guided').getAttribute('aria-checked')).toBe('true')
  })
})
