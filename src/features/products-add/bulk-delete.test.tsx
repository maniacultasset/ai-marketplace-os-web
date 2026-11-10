import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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

const { BulkDelete } = await import('./products-page')

afterEach(cleanup)

const row = (sku: string, listing?: Record<string, unknown>) =>
  ({
    product: { id: sku, sku, title: sku },
    variants: [],
    listings: listing ? { amazon: { status: 'validated', marketplace_state: 'not_submitted', external_id: null, ...listing } } : {},
  }) as never

const view = (rows: never[], canDelete = true, onDelete = vi.fn()) => {
  render(
    <TooltipProvider>
      <BulkDelete rows={rows} canDelete={canDelete} onDelete={onDelete} />
    </TooltipProvider>,
  )
  return onDelete
}

describe('BulkDelete', () => {
  it('opens the confirm for products never sent to a marketplace', () => {
    const onDelete = view([row('A'), row('B', {})])
    const button = screen.getByTestId('bulk-delete')
    expect(button.getAttribute('aria-disabled')).toBeNull()
    fireEvent.click(button)
    expect(onDelete).toHaveBeenCalled()
  })

  it('is off, with the reason, when a selected listing was sent', () => {
    const onDelete = view([row('A'), row('LIVE-1', { status: 'published', marketplace_state: 'live' })])
    const button = screen.getByTestId('bulk-delete')
    expect(button.getAttribute('aria-disabled')).toBe('true')
    expect(document.body.textContent).toMatch(/LIVE-1 has a listing that was sent to a marketplace/)
    fireEvent.click(button)
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('is off for a role that cannot delete', () => {
    view([row('A')], false)
    expect(screen.getByTestId('bulk-delete').getAttribute('aria-disabled')).toBe('true')
    expect(document.body.textContent).toMatch(/Only an owner or admin/)
  })
})
