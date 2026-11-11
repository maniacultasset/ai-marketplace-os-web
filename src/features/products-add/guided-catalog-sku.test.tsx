import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { emptyGuided } from './guided-model'

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
vi.mock('@/features/assist/flags', async (orig) => ({
  ...(await orig<object>()),
  useCategorySuggestEnabled: () => false,
  useLampsEnabled: () => ({ enabled: false, pending: false }),
}))
const get = vi.fn()
const post = vi.fn()
vi.mock('@/api/client', async (orig) => ({
  ...(await orig<typeof import('@/api/client')>()),
  api: { GET: (...a: unknown[]) => get(...a), POST: (...a: unknown[]) => post(...a) },
}))

const { GuidedForm } = await import('./guided-form')

const answer = (body: unknown) => Promise.resolve({ data: body, error: undefined, response: new Response(JSON.stringify(body), { status: 200 }) })
const never = () => new Promise(() => {})
const CATALOG = {
  suggest_enabled: true,
  items: [
    {
      category: 'ethnic_wear_kurta_sets',
      label: 'Kurta sets',
      enabled: true,
      marketplaces: [
        { marketplace: 'amazon', product_type: 'KURTA', product_type_name: 'Kurta', external_category_id: null, template_version: 3 },
        { marketplace: 'flipkart', product_type: 'kurta', product_type_name: 'Kurta', external_category_id: null, template_version: 3 },
      ],
    },
  ],
}

function draft(values: Partial<ReturnType<typeof emptyGuided>>) {
  localStorage.setItem('la.guided-draft.t1', JSON.stringify({ values: { ...emptyGuided(), ...values }, savedAt: new Date().toISOString() }))
}

function setup(startAt: 'identity' | 'category') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        <GuidedForm listOn={['amazon', 'flipkart']} startAt={startAt} />
      </TooltipProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  get.mockReset()
  post.mockReset()
  post.mockImplementation(never)
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})
afterEach(cleanup)

describe('Guided form: backend categories and the SKU check (client feedback 11 Nov)', () => {
  it('shows what each marketplace is sent for the chosen category, and offers Suggest', async () => {
    get.mockImplementation((path: string) => (path === '/catalog/categories' ? answer(CATALOG) : never()))
    draft({ title: 'Cotton kurta set', sku: 'KS-1', category: 'ethnic_wear_kurta_sets' })
    setup('category')
    expect((await screen.findByTestId('g-category-mapping')).textContent).toBe('On Amazon: Kurta (KURTA) · On Flipkart: Kurta')
    expect(screen.getByTestId('category-suggest-ask')).toBeTruthy()
  })

  it('catches a SKU already in the brand before the save', async () => {
    get.mockImplementation((path: string, init?: { params?: { query?: { sku?: string } } }) => {
      if (path === '/catalog/categories') return answer(CATALOG)
      if (path === '/skus/availability')
        return answer({ sku: init?.params?.query?.sku, available: false, product_id: 'p9', title: 'Old kurta', is_variant: false, deleted: false })
      return never()
    })
    draft({ title: 'Cotton kurta set', sku: 'KS-1', category: 'ethnic_wear_kurta_sets' })
    setup('category')
    await screen.findByTestId('g-category-mapping')
    await userEvent.click(screen.getByTestId('guided-send'))
    await waitFor(() => expect(screen.getAllByText('KS-1 is already used by “Old kurta”. Use another, or let Kuinn make one.').length).toBeGreaterThan(0))
    expect(post.mock.calls.some(([p]) => p === '/products')).toBe(false)
  })

  it('names a ticked marketplace that has no template for the category', async () => {
    const amazonOnly = { ...CATALOG, items: [{ ...CATALOG.items[0]!, marketplaces: [CATALOG.items[0]!.marketplaces[0]!] }] }
    get.mockImplementation((path: string) => (path === '/catalog/categories' ? answer(amazonOnly) : never()))
    draft({ title: 'Cotton kurta set', sku: 'KS-1', category: 'ethnic_wear_kurta_sets' })
    setup('category')
    expect((await screen.findByTestId('g-category-mapping')).textContent).toBe('On Amazon: Kurta (KURTA)')
    expect(screen.getByTestId('g-category-unmapped').textContent).toBe('Flipkart can’t list this category yet.')
  })

  it('after a create that got no answer, the taken SKU offers "Continue with it"', async () => {
    const mine = {
      id: 'p1',
      sku: 'KS-1',
      title: 'Cotton kurta set',
      category: 'ethnic_wear_kurta_sets',
      created_at: new Date().toISOString(),
      image_details: [],
    }
    let made = false
    get.mockImplementation((path: string) => {
      if (path === '/catalog/categories') return answer(CATALOG)
      if (path === '/products') return answer({ data: made ? [mine] : [], page: { has_more: false, next_cursor: null } })
      // the check sees the product the first try made
      if (path === '/skus/availability') return answer({ sku: 'KS-1', available: !made, product_id: made ? 'p1' : null, title: made ? mine.title : null, is_variant: false, deleted: false })
      return never()
    })
    post.mockImplementation((path: string) => {
      if (path !== '/products') return never()
      if (!made) {
        made = true // it went through, but the answer is lost
        return Promise.reject(new TypeError('Failed to fetch'))
      }
      const body = { error: { type: 'SKU_CONFLICT', status: 409, message: 'SKU taken', details: [{ loc: ['body', 'sku'], msg: 'taken', type: 'conflict' }] } }
      return Promise.resolve({ data: undefined, error: body, response: new Response(JSON.stringify(body), { status: 409 }) })
    })
    draft({ title: 'Cotton kurta set', sku: 'KS-1', category: 'ethnic_wear_kurta_sets' })
    setup('category')
    await screen.findByTestId('g-category-mapping')
    await userEvent.click(screen.getByTestId('guided-send'))
    await waitFor(() => expect(post.mock.calls.filter(([p]) => p === '/products')).toHaveLength(1))
    await userEvent.click(screen.getByTestId('guided-send'))
    await waitFor(() => expect(post.mock.calls.filter(([p]) => p === '/products')).toHaveLength(2))
    expect(await screen.findByText('Continue with it')).toBeTruthy()
  })
})
