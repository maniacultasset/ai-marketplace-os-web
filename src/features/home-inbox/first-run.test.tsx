import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'

const navigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...rest }: { to: string; children: ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
  useNavigate: () => navigate,
}))

const s = vi.hoisted(() => ({ approver: 'alone' as string, manufacturer: null as unknown, flipkart: false }))
const ok = <T,>(data: T) => ({ data, isPending: false, isError: false })
vi.mock('@/lib/permissions', () => ({ useCan: () => () => true }))
vi.mock('@/features/brand/api', () => ({ useBrandProfile: () => ok({ data: { tone: 'Warm', guidelines: [], glossary: {} } }) }))
vi.mock('@/features/products/api', () => ({ useBrandManufacturer: () => ok({ data: { default_manufacturer: s.manufacturer } }) }))
vi.mock('@/features/marketplaces/api', () => ({
  useCurrentMarketplaceAccounts: () =>
    ok({ live: { amazon: { status: 'active' }, flipkart: s.flipkart ? { status: 'active' } : null } }),
}))
vi.mock('@/features/team-account/approver', () => ({ useApproverState: () => s.approver }))
vi.mock('./api', () => ({ useHasProducts: () => ok(false) }))

const { FirstRun } = await import('./first-run')

afterEach(() => {
  cleanup()
  navigate.mockReset()
})

const view = () =>
  render(
    <TooltipProvider>
      <FirstRun brand="Loomline" />
    </TooltipProvider>,
  )

describe('FirstRun', () => {
  it('opens the V1 guided form with the connected marketplaces, never the old /products/new', () => {
    view()
    fireEvent.click(screen.getByTestId('first-run-add'))
    expect(navigate).toHaveBeenCalledWith({ to: '/add/guided', search: { on: 'amazon' } })
  })

  it('"Photos and basics" is live and opens the guided form on its photos', () => {
    view()
    const photos = screen.getByTestId('route-photos')
    expect(photos.getAttribute('aria-disabled')).toBeNull()
    expect(photos.textContent).not.toContain('Coming soon')
    fireEvent.click(photos)
    fireEvent.click(screen.getByTestId('first-run-add'))
    expect(navigate).toHaveBeenCalledWith({ to: '/add/guided', search: { on: 'amazon', start: 'photos' } })
  })

  it('the spreadsheet route opens /add/bulk, not the old /imports/new', () => {
    s.flipkart = true
    view()
    fireEvent.click(screen.getByTestId('route-bulk'))
    fireEvent.click(screen.getByTestId('first-run-add'))
    expect(navigate).toHaveBeenCalledWith({ to: '/add/bulk', search: { on: 'amazon,flipkart' } })
    s.flipkart = false
  })

  it('the checklist has a manufacturer step and a teammate-who-approves step, both from real reads', () => {
    view()
    expect(screen.getByTestId('setup-manufacturer').textContent).toContain('Next')
    expect(screen.getByRole('link', { name: 'Brand manufacturer' }).getAttribute('href')).toBe('/setup/manufacturer')
    expect(screen.getByRole('link', { name: 'Add a teammate who approves' }).getAttribute('href')).toBe('/team')
    expect(screen.queryByTestId('setup-compliance')).toBeNull()
    expect(screen.getByText('A teammate approves, then it is sent')).toBeTruthy()
  })

  it('marks both done once the manufacturer is saved and someone else can approve', () => {
    s.manufacturer = { legal_name: 'Asha Textiles' }
    s.approver = 'ok'
    view()
    expect(screen.getByTestId('setup-manufacturer').textContent).toContain('Done')
    expect(screen.getByTestId('setup-approver').textContent).toContain('Done')
    expect(screen.getByTestId('setup-product').textContent).toContain('Next')
  })
})
