import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { brands } from '@/test/home-brands'

const state = vi.hoisted(() => ({
  memberships: [] as { tenant_id: string; tenant_name: string; role: string }[],
  brands: { isPending: false, isError: false, data: undefined as unknown, error: null, refetch: vi.fn() },
  switched: [] as string[],
  navigated: [] as unknown[],
}))
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => (to: unknown) => state.navigated.push(to) }))
vi.mock('@/lib/auth', () => ({
  useMe: () => ({ data: { tenant_id: 't1', memberships: state.memberships } }),
  switchTenant: (id: string) => {
    state.switched.push(id)
    return Promise.resolve()
  },
}))
vi.mock('./api', () => ({ useHomeBrands: () => state.brands }))

const { BrandScopeSelect, BrandsOverview } = await import('./brands-overview')

afterEach(() => {
  cleanup()
  state.switched = []
  state.navigated = []
})

const two = [
  { tenant_id: 't1', tenant_name: 'Acme', role: 'owner' },
  { tenant_id: 't2', tenant_name: 'Bharat', role: 'reviewer' },
]

describe('Home brand selector (client feedback item 18)', () => {
  it('is not shown with one brand', () => {
    state.memberships = [two[0]!]
    render(<BrandScopeSelect scope={undefined} onScope={vi.fn()} />)
    expect(screen.queryByTestId('home-brand-scope')).toBeNull()
  })

  it('reads the brand, or All my brands, with two or more', () => {
    state.memberships = two
    const { rerender } = render(<BrandScopeSelect scope={undefined} onScope={vi.fn()} />)
    expect(screen.getByTestId('home-brand-scope').textContent).toContain('Acme')
    rerender(<BrandScopeSelect scope="all" onScope={vi.fn()} />)
    expect(screen.getByTestId('home-brand-scope').textContent).toContain('All my brands')
  })
})

describe('cross-brand overview', () => {
  const view = (onScope = vi.fn()) => {
    state.brands = { ...state.brands, isPending: false, isError: false, data: brands() }
    render(
      <TooltipProvider>
        <BrandsOverview onScope={onScope} />
      </TooltipProvider>,
    )
    return onScope
  }

  it('lists each brand with its own counts and what waits on the person', () => {
    view()
    const rows = screen.getAllByTestId('brand-row')
    expect(rows.map((r) => within(r).getByTestId('brand-row-name').textContent)).toEqual(['Acme', 'Bharat'])
    expect(rows[0]!.getAttribute('aria-label')).toBe('Acme, the brand you are in: 4 live, 2 in progress, 4 waiting on you, 1,284 products. Open its Home.')
    expect(rows[0]!.textContent).toContain('Current')
    expect(screen.getByTestId('brands-summary').textContent).toBe('2 brands · 1 needs you')
  })

  it('a brand row switches to that brand; the current one shows its Home', async () => {
    const onScope = view()
    const [acme, bharat] = screen.getAllByTestId('brand-row')
    fireEvent.click(acme!)
    expect(onScope).toHaveBeenCalledWith(undefined)
    expect(state.switched).toEqual([])
    fireEvent.click(bharat!)
    expect(state.switched).toEqual(['t2'])
    await vi.waitFor(() => expect(state.navigated).toEqual([{ to: '/home' }]))
  })

  it('a failed read says so and offers a retry', () => {
    state.brands = { ...state.brands, isPending: false, isError: true, data: undefined, error: new Error('x') as never }
    render(
      <TooltipProvider>
        <BrandsOverview onScope={vi.fn()} />
      </TooltipProvider>,
    )
    expect(screen.getByText("Couldn't load your brands")).toBeTruthy()
  })
})
