import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'

type Role = 'owner' | 'admin' | 'operator' | 'reviewer'
const s = vi.hoisted(() => ({
  me: null as null | { tenant_id: string; role: Role; memberships: { tenant_id: string; tenant_name: string; role: Role }[] },
  enabled: true,
  navigate: vi.fn(),
  switchTenant: vi.fn(),
}))
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => s.navigate }))
vi.mock('@/lib/auth', () => ({ useMe: () => ({ data: s.me }), switchTenant: s.switchTenant }))
vi.mock('@/features/brand/api', () => ({
  useBrandName: (me: { tenant_id: string; memberships: { tenant_id: string; tenant_name: string }[] } | undefined) =>
    me?.memberships.find((m) => m.tenant_id === me.tenant_id)?.tenant_name ?? '',
  useBrandProfile: () => ({ data: { data: { capabilities: { tenant_create_enabled: s.enabled } } } }),
}))
vi.mock('@/features/brand/add-brand-dialog', () => ({
  AddBrandDialog: ({ open }: { open: boolean }) => (open ? <div data-testid="add-brand-dialog" /> : null),
}))

const { BrandSwitcher } = await import('./brand-switcher')

const brand = (tenant_id: string, tenant_name: string, role: Role) => ({ tenant_id, tenant_name, role })

function show() {
  render(
    <TooltipProvider>
      <BrandSwitcher />
    </TooltipProvider>,
  )
}

beforeEach(() => {
  s.enabled = true
  s.navigate.mockReset()
  s.switchTenant.mockReset()
})
afterEach(cleanup)

describe('BrandSwitcher', () => {
  it('lets a sole-brand owner add another brand', async () => {
    s.me = { tenant_id: 'a', role: 'owner', memberships: [brand('a', 'Kalakar', 'owner')] }
    show()
    await userEvent.click(screen.getByRole('button', { name: 'Switch brand' }))
    await userEvent.click(await screen.findByTestId('add-brand'))
    expect(await screen.findByTestId('add-brand-dialog')).toBeTruthy()
  })

  it('stays a static box with one brand when adding is off', () => {
    s.enabled = false
    s.me = { tenant_id: 'a', role: 'owner', memberships: [brand('a', 'Kalakar', 'owner')] }
    show()
    expect(screen.queryByRole('button', { name: 'Switch brand' })).toBeNull()
    expect(screen.getByTestId('tenant-name').textContent).toBe('Kalakar')
  })

  it('lists every brand with its role and switches into another one', async () => {
    s.switchTenant.mockResolvedValue({})
    s.me = {
      tenant_id: 'a',
      role: 'owner',
      memberships: [brand('a', 'Kalakar', 'owner'), brand('b', 'Bharat Weaves', 'operator'), brand('c', 'Desi Tees', 'owner')],
    }
    show()
    await userEvent.click(screen.getByRole('button', { name: 'Switch brand' }))
    expect((await screen.findByTestId('brand-count')).textContent).toBe('3')
    const item = await screen.findByRole('menuitem', { name: /Bharat Weaves/ })
    expect(item.textContent).toContain('operator')
    await userEvent.click(item)
    await waitFor(() => expect(s.switchTenant).toHaveBeenCalledWith('b'))
    await waitFor(() => expect(s.navigate).toHaveBeenCalledWith({ to: '/home' }))
  })

  it('tells a non-owner who owns another brand where to add one', async () => {
    s.me = { tenant_id: 'b', role: 'operator', memberships: [brand('a', 'Kalakar', 'owner'), brand('b', 'Bharat Weaves', 'operator')] }
    show()
    await userEvent.click(screen.getByRole('button', { name: 'Switch brand' }))
    expect(await screen.findByTestId('add-brand-hint')).toBeTruthy()
    expect(screen.queryByTestId('add-brand')).toBeNull()
  })

  it('offers nothing to add to someone who owns no brand', async () => {
    s.me = { tenant_id: 'b', role: 'admin', memberships: [brand('a', 'Kalakar', 'reviewer'), brand('b', 'Bharat Weaves', 'admin')] }
    show()
    await userEvent.click(screen.getByRole('button', { name: 'Switch brand' }))
    await screen.findByRole('menuitem', { name: /Kalakar/ })
    expect(screen.queryByTestId('add-brand')).toBeNull()
    expect(screen.queryByTestId('add-brand-hint')).toBeNull()
  })
})
