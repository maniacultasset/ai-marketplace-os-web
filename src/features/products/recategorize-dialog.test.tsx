import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.fn((_path: string): Promise<unknown> => new Promise(() => {}))
vi.mock('@/api/client', async (orig) => ({
  ...(await orig<typeof import('@/api/client')>()),
  api: { GET: (path: string) => get(path), POST: () => new Promise(() => {}) },
}))
vi.mock('@/lib/auth', async (orig) => ({ ...(await orig<typeof import('@/lib/auth')>()), useSession: () => ({ tenantId: 't1' }) }))

const { ChangeCategoryButton } = await import('./recategorize-dialog')

const mapped = (marketplace: 'amazon' | 'flipkart', product_type: string, product_type_name: string) => ({
  marketplace,
  product_type,
  product_type_name,
  external_category_id: null,
  template_version: 1,
})
const CATALOG = {
  items: [
    { category: 'ethnic_wear_kurta_sets', label: 'Kurta sets', enabled: true, marketplaces: [mapped('amazon', 'KURTA', 'Kurta'), mapped('flipkart', 'kurta', 'Kurta')] },
    { category: 'tshirts', label: 'T-shirts', enabled: true, marketplaces: [mapped('amazon', 'SHIRT', 'Shirt'), mapped('flipkart', 't_shirt', 'T-shirt')] },
  ],
}

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <ChangeCategoryButton productId="p1" current="ethnic_wear_kurta_sets" state={{ kind: 'open' }} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  get.mockReset()
  get.mockImplementation(() => new Promise(() => {}))
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})
afterEach(cleanup)

describe('Change category (client item 5)', () => {
  it('names the product type each marketplace is sent for the new category', async () => {
    get.mockImplementation((path: string) =>
      path === '/catalog/categories' ? Promise.resolve({ data: CATALOG, error: undefined, response: new Response(null, { status: 200 }) }) : new Promise(() => {}),
    )
    setup()
    await userEvent.click(screen.getByTestId('change-category'))
    await waitFor(() => expect(screen.getByTestId('change-category-mapping').textContent).toBe('On Amazon: Shirt (SHIRT) · On Flipkart: T-shirt'))
    expect(screen.getByRole('combobox').getAttribute('aria-describedby')).toBeTruthy()
  })

  it('says nothing about product types while the catalog has not loaded', async () => {
    setup()
    await userEvent.click(screen.getByTestId('change-category'))
    expect(screen.getByTestId('change-category-dialog')).toBeTruthy()
    expect(screen.queryByTestId('change-category-mapping')).toBeNull()
  })
})
