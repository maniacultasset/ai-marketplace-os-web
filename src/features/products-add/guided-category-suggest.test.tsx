import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...rest }: { to: string; children: ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
  useNavigate: () => vi.fn(),
}))
vi.mock('@/lib/auth', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth')>()),
  useSession: () => ({ tenantId: 't1', userId: 'u1' }),
  useMe: () => ({ data: undefined }),
}))
vi.mock('@/lib/permissions', async (orig) => ({ ...(await orig<typeof import('@/lib/permissions')>()), useCan: () => () => true }))
vi.mock('@/features/ai-credit/use-ai-paused', () => ({ useAiPaused: () => false }))
let suggestOn = false
let lampsOn = false
vi.mock('@/features/assist/flags', async (orig) => ({
  ...(await orig<object>()),
  useCategorySuggestEnabled: () => suggestOn,
  useLampsEnabled: () => ({ enabled: lampsOn, pending: false }),
}))
const get = vi.fn((_path: string, _init?: unknown): Promise<unknown> => new Promise(() => {}))
vi.mock('@/api/client', async (orig) => ({
  ...(await orig<typeof import('@/api/client')>()),
  api: { GET: (path: string, init?: unknown) => get(path, init), POST: () => new Promise(() => {}) },
}))

/** The backend's answer for a category nobody chose yet: facts and extras, no template levels. */
const UNCATEGORIZED = {
  category: 'uncategorized',
  amazon: ['brand_name', 'country_of_origin', 'identifier', 'manufacturer', 'mrp', 'package_dimensions', 'package_weight', 'selling_price'],
  flipkart: ['country_of_origin', 'hsn_code', 'manufacturer', 'mrp', 'package_dimensions', 'package_weight', 'selling_price'],
  photo_views: [],
  levels: { amazon: {}, flipkart: {} },
}
const ok = (data: unknown) => Promise.resolve({ data, error: undefined, response: new Response(null, { status: 200 }) })
const requirementsAsked = () =>
  get.mock.calls.filter(([path]) => path === '/catalog/requirements').map(([, init]) => (init as { params: { query: { category: string } } }).params.query.category)

const { GuidedForm } = await import('./guided-form')

function setup(listOn: ('amazon' | 'flipkart')[] = []) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        <GuidedForm listOn={listOn} startAt="category" />
      </TooltipProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  suggestOn = false
  lampsOn = false
  get.mockReset()
  get.mockImplementation(() => new Promise(() => {}))
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})
afterEach(cleanup)

describe('Guided form category (SI14)', () => {
  it('offers no "Let Kuinn suggest" and no lamps while both switches are off', async () => {
    setup()
    expect(screen.queryByTestId('g-kuinn-suggests')).toBeNull()
    await userEvent.click(screen.getByTestId('g-category-trigger'))
    expect(screen.queryByRole('option', { name: 'Lamps' })).toBeNull()
    expect(screen.getByRole('option', { name: 'T-shirts' })).toBeTruthy()
  })

  it('lets the seller skip the category for Kuinn while the classifier is on, and offers lamps when their switch is on', async () => {
    suggestOn = true
    lampsOn = true
    setup()
    const toggle = screen.getByTestId('g-kuinn-suggests')
    await userEvent.click(screen.getByRole('switch'))
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true')
    expect((screen.getByTestId('g-category-trigger') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByTestId('guided-category-summary').textContent).toBe('Kuinn suggests after saving')
    expect(toggle.textContent).toContain('Let Kuinn suggest')
    await userEvent.click(screen.getByRole('switch'))
    await userEvent.click(screen.getByTestId('g-category-trigger'))
    expect(screen.getByRole('option', { name: 'Lamps' })).toBeTruthy()
  })

  it('client item 4: with "Let Kuinn suggest" on, shows the needs known without a category before save', async () => {
    suggestOn = true
    get.mockImplementation((path: string) => (path === '/catalog/requirements' ? ok(UNCATEGORIZED) : new Promise(() => {})))
    setup(['amazon', 'flipkart'])
    expect(requirementsAsked()).toEqual([])
    await userEvent.click(screen.getByRole('switch'))
    expect(requirementsAsked()).toEqual(['uncategorized'])
    expect(await screen.findByText(/missing for Amazon and Flipkart/)).toBeTruthy()
    expect(document.body.textContent).toContain('The Needed marks show what every category asks for')
    // choosing a category asks again, for that category's own needs
    await userEvent.click(screen.getByRole('switch'))
    await userEvent.click(screen.getByTestId('g-category-trigger'))
    await userEvent.click(screen.getByRole('option', { name: 'T-shirts' }))
    expect(requirementsAsked()).toEqual(['uncategorized', 'tshirts'])
  })
})
