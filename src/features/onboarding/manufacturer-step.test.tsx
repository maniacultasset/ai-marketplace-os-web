import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'

const navigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }))
vi.mock('@/lib/permissions', async (orig) => ({ ...(await orig<typeof import('@/lib/permissions')>()), useCan: () => () => true }))
vi.mock('@/features/brand/api', () => ({ useBrandProfile: () => ({ data: undefined }) }))
const query = { data: { data: { default_manufacturer: null, updated_at: null }, etag: '"v1"' }, isPending: false, error: null, refetch: vi.fn() }
vi.mock('@/features/products/api', () => ({
  useBrandManufacturer: () => query,
  useSaveBrandManufacturer: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/lib/toast', () => ({ toast: { success: vi.fn() } }))

const { ManufacturerStep } = await import('./manufacturer-step')

afterEach(() => {
  cleanup()
  navigate.mockReset()
})

const view = () =>
  render(
    <TooltipProvider>
      <ManufacturerStep />
    </TooltipProvider>,
  )

describe('ManufacturerStep', () => {
  it('continues to marketplaces when nothing is being edited', () => {
    view()
    fireEvent.click(screen.getByTestId('setup-continue'))
    expect(navigate).toHaveBeenCalledWith({ to: '/setup/marketplaces' })
  })

  it('never leaves with an unsaved manufacturer: Continue waits until it is saved or cancelled', () => {
    view()
    fireEvent.click(screen.getByTestId('manufacturer-edit'))
    const go = screen.getByTestId('setup-continue') as HTMLButtonElement
    expect(go.disabled).toBe(true)
    expect(screen.getByTestId('setup-footer-status').textContent).toBe('Save the manufacturer or cancel it first.')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect((screen.getByTestId('setup-continue') as HTMLButtonElement).disabled).toBe(false)
  })
})
