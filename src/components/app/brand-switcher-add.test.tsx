/**
 * Prod Chrome pass 12 Nov (B9): "Add another brand" opened with "Enter the brand name." already
 * in red. The menu closing gave focus back to its trigger after the dialog had focused the name
 * field, so the field was "touched" by a blur nobody made. The real dialog, opened from the menu.
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'

const s = vi.hoisted(() => ({ navigate: vi.fn(), switchTenant: vi.fn() }))
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => s.navigate }))
vi.mock('@/lib/auth', () => ({
  useMe: () => ({ data: { tenant_id: 'a', role: 'owner', memberships: [{ tenant_id: 'a', tenant_name: 'Staff', role: 'owner' }] } }),
  switchTenant: s.switchTenant,
}))
vi.mock('@/features/brand/api', () => ({
  useBrandName: () => 'Staff',
  useBrandProfile: () => ({ data: { data: { capabilities: { tenant_create_enabled: true } } } }),
}))

const { BrandSwitcher } = await import('./brand-switcher')

afterEach(cleanup)

describe('Add another brand, from the brand menu', () => {
  it('opens with no error and the name field focused', async () => {
    render(
      <TooltipProvider>
        <BrandSwitcher />
      </TooltipProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Switch brand' }))
    await userEvent.click(await screen.findByTestId('add-brand'))
    const name = await screen.findByTestId('add-brand-name')
    await waitFor(() => expect(document.activeElement).toBe(name))
    // let every close/focus handler of the menu run
    await new Promise((r) => setTimeout(r, 50))
    expect(document.activeElement).toBe(name)
    expect(screen.queryByText('Enter the brand name.')).toBeNull()
    expect(name.getAttribute('aria-invalid')).toBe('false')
  })

  it('still says what is missing after a real blur', async () => {
    render(
      <TooltipProvider>
        <BrandSwitcher />
      </TooltipProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Switch brand' }))
    await userEvent.click(await screen.findByTestId('add-brand'))
    await screen.findByTestId('add-brand-name')
    await userEvent.tab()
    expect(await screen.findByText('Enter the brand name.')).toBeTruthy()
  })
})
