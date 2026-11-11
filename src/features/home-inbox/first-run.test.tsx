import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'

const navigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, search, hash, children, ...rest }: { to: string; search?: Record<string, string>; hash?: string; children: ReactNode }) => (
    <a href={`${search ? `${to}?${new URLSearchParams(search).toString()}` : to}${hash ? `#${hash}` : ''}`} {...rest}>
      {children}
    </a>
  ),
  useNavigate: () => navigate,
}))

const s = vi.hoisted(() => ({ approver: 'alone' as string, manufacturer: null as unknown, flipkart: false, selfApproval: false }))
const ok = <T,>(data: T) => ({ data, isPending: false, isError: false })
vi.mock('@/lib/permissions', () => ({ useCan: () => () => true }))
vi.mock('@/features/brand/api', () => ({ useBrandProfile: () => ok({ data: { tone: 'Warm', guidelines: [], glossary: {}, owner_self_approval: s.selfApproval } }) }))
vi.mock('@/features/products/api', () => ({ useBrandManufacturer: () => ok({ data: { default_manufacturer: s.manufacturer } }) }))
vi.mock('@/features/marketplaces/api', () => ({
  useCurrentMarketplaceAccounts: () =>
    ok({ live: { amazon: { status: 'active' }, flipkart: s.flipkart ? { status: 'active' } : null } }),
}))
vi.mock('@/features/team-account/approver', () => ({ useApproverState: () => s.approver, OWNER_APPROVAL_HASH: 'owner-approval' }))
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
    expect(screen.getByRole('link', { name: 'Add a teammate who approves' }).getAttribute('href')).toBe('/team?invite=1')
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

  it('when only the team can’t be read, just the teammate row says Unknown', () => {
    s.manufacturer = null
    s.approver = 'unknown'
    view()
    expect(screen.getByTestId('setup-approver').textContent).toContain('Unknown')
    expect(screen.getByTestId('setup-brand').textContent).toContain('Done')
    expect(screen.getByTestId('setup-manufacturer').textContent).toContain('Next')
    expect(screen.getByTestId('setup-line').textContent).toBe('Some steps could not be checked.')
    s.approver = 'alone'
  })

  it('an owner alone with owner approval off is offered the setting, with Invite as a second way', () => {
    s.approver = 'owner_alone'
    view()
    const row = screen.getByTestId('setup-approver')
    expect(row.textContent).not.toContain('Add a teammate who approves')
    expect(screen.getByRole('link', { name: 'Choose who approves' }).getAttribute('href')).toBe('/settings#owner-approval')
    expect(screen.getByRole('link', { name: 'or invite a reviewer' }).getAttribute('href')).toBe('/team?invite=1')
    expect(row.textContent).not.toContain('Done')
    expect(screen.getByText('A teammate approves, then it is sent')).toBeTruthy()
    s.approver = 'alone'
  })

  it('with owner approval on, the step is done as "Choose who approves" and the copy says an owner may approve', () => {
    s.approver = 'ok'
    s.selfApproval = true
    view()
    const row = screen.getByTestId('setup-approver')
    expect(row.textContent).toContain('Choose who approves')
    expect(row.textContent).toContain('Done')
    expect(row.textContent).not.toContain('Add a teammate who approves')
    expect(screen.getByText('A person approves, then it is sent')).toBeTruthy()
    expect(screen.queryByText('A teammate approves, then it is sent')).toBeNull()
    const rule = screen.getByTestId('after-steps-rule').textContent
    expect(rule).toContain('an owner can approve their own listings')
    expect(rule).not.toContain('can’t approve it')
    s.approver = 'alone'
    s.selfApproval = false
  })
})
