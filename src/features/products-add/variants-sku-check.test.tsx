import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
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
vi.mock('@/lib/auth', async (orig) => ({ ...(await orig<typeof import('@/lib/auth')>()), useSession: () => ({ tenantId: 't1', userId: 'u1' }) }))
vi.mock('@/lib/permissions', async (orig) => ({ ...(await orig<typeof import('@/lib/permissions')>()), useCan: () => () => true }))
vi.mock('@/hooks/use-capabilities', async (orig) => ({ ...(await orig<object>()), useCapability: () => false }))

const STYLE = { id: 'style-1', sku: 'KS-1', title: 'Kurta set', category: 'ethnic_wear_kurta_sets', parent_product_id: null, colourways: [] }
vi.mock('@/features/products/api', async (orig) => ({ ...(await orig<object>()), useProduct: () => ({ data: STYLE, isPending: false, error: null }) }))
vi.mock('./catalog', async (orig) => ({ ...(await orig<object>()), useAllProducts: () => ({ data: { rows: [STYLE] } }) }))
vi.mock('./list-on', async (orig) => ({ ...(await orig<object>()), useConnectedMarketplaces: () => ({ connected: [], error: null }) }))

const get = vi.fn()
const post = vi.fn()
vi.mock('@/api/client', async (orig) => ({
  ...(await orig<typeof import('@/api/client')>()),
  api: { GET: (...a: unknown[]) => get(...a), POST: (...a: unknown[]) => post(...a) },
}))

const { VariantsPage } = await import('./variants-page')

const ok = (body: unknown, status = 200) => Promise.resolve({ data: body, error: undefined, response: new Response(JSON.stringify(body), { status }) })
const held = (sku: string, product_id: string, title: string) => ({ sku, available: false, product_id, title, is_variant: true, deleted: false })

function open() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        <VariantsPage productId="style-1" />
      </TooltipProvider>
    </QueryClientProvider>,
  )
}

const bulk = () => post.mock.calls.filter((c) => c[0] === '/products/bulk')

beforeEach(() => {
  get.mockReset()
  post.mockReset()
  get.mockImplementation(() => new Promise(() => {}))
  Element.prototype.scrollIntoView ??= () => {}
})
afterEach(cleanup)

describe('Variants grid duplicate SKU check (client feedback 11 Nov, item 3)', () => {
  it('says each variant SKU goes as its seller SKU, flags one another product holds, and does not save', async () => {
    post.mockImplementation((path: string) => {
      if (path === '/skus/availability-check') return ok({ checked: 4, taken: [held('KS-1-M', 'other', 'Linen shirt')] })
      return ok({ import_id: 'i1', job_id: 'j1', status: 'queued' }, 202)
    })
    open()
    expect(screen.getByTestId('variant-sku-hint').textContent).toContain('Sent as that variant’s seller SKU.')
    // Another product's SKU is shown on its row at once, before any save.
    expect(await screen.findByText('KS-1-M is already used by a size or colour of “Linen shirt”. Give this variant another SKU.')).toBeTruthy()
    expect(post.mock.calls.find((c) => c[0] === '/skus/availability-check')![1].body).toEqual({ skus: ['KS-1-S', 'KS-1-M', 'KS-1-L', 'KS-1-XL'] })
    expect(screen.queryByText(/KS-1-S is already used/)).toBeNull()
    expect(screen.getByText(/Each is checked against your other products/)).toBeTruthy()
    await userEvent.click(screen.getByTestId('variants-save'))
    await waitFor(() => expect((screen.getByTestId('variants-save') as HTMLButtonElement).disabled).toBe(false))
    expect(bulk()).toHaveLength(0)
  })

  it('saves once every SKU is free in the brand', async () => {
    post.mockImplementation((path: string) => (path === '/skus/availability-check' ? ok({ checked: 4, taken: [] }) : ok({ import_id: 'i1', job_id: 'j1', status: 'queued' }, 202)))
    open()
    await userEvent.click(screen.getByTestId('variants-save'))
    await waitFor(() => expect(bulk()).toHaveLength(1))
  })

  it('still saves when the check cannot answer: the import checks each row', async () => {
    const error = { error: { type: 'INTERNAL_ERROR', message: 'm', status: 500, correlation_id: 'req-1', details: null, error_report: null } }
    post.mockImplementation((path: string) =>
      path === '/skus/availability-check'
        ? Promise.resolve({ data: undefined, error, response: new Response(JSON.stringify(error), { status: 500 }) })
        : ok({ import_id: 'i1', job_id: 'j1', status: 'queued' }, 202),
    )
    open()
    await userEvent.click(screen.getByTestId('variants-save'))
    await waitFor(() => expect(bulk()).toHaveLength(1))
  })
})
