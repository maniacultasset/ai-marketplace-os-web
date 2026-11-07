import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...rest }: { to: string; children: ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}))
vi.mock('@/lib/auth', () => ({
  useMe: () => ({ data: { display_name: 'Meera Iyer', email: 'meera@kalakar.example' } }),
  logout: vi.fn(async () => undefined),
}))
vi.mock('@/lib/nav', () => ({ useNavItems: () => [] }))

const { UserMenu } = await import('./user-menu')

afterEach(cleanup)

describe('UserMenu', () => {
  it('offers a support contact that opens an email to support@kuinn.in', async () => {
    render(<UserMenu />)
    await userEvent.click(screen.getByTestId('user-menu'))
    const item = await screen.findByTestId('contact-support')
    expect(item.getAttribute('href')).toMatch(/^mailto:support@kuinn\.in/)
    expect(item.textContent).toContain('Contact support')
    expect(item.textContent).toContain('support@kuinn.in')
  })
})
