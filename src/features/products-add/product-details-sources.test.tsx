import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProductDetail } from '@/features/products/api'

const confirm = vi.fn()
vi.mock('@/features/photo-facts/api', () => ({
  usePhotoFactActions: () => ({ pending: {}, saving: new Set(), errors: {}, confirm, reject: vi.fn() }),
}))
vi.mock('@/lib/permissions', async (orig) => ({ ...(await orig<typeof import('@/lib/permissions')>()), useCan: () => () => true }))
vi.mock('@/lib/auth', async (orig) => ({ ...(await orig<typeof import('@/lib/auth')>()), useSession: () => ({ tenantId: 't1' }) }))

const { ProductDetailsCard } = await import('./product-details')

afterEach(cleanup)

const product: ProductDetail = {
  id: 'p1',
  sku: 'KORA-1',
  title: 'Coral linen shirt',
  status: 'active',
  category: 'tshirts',
  created_at: 'x',
  updated_at: 'x',
  identifier_exemption: true,
  brand_name: 'Kora',
  brand_name_inherited: false, size_chart_read_enabled: false, category_suggest_enabled: false, photo_reading: false,
  gender: 'men',
  attributes: { fabric_type: 'Linen', color: 'Coral pink' },
  attribute_literals: {},
  mrp: '1799.00',
  selling_price: '1299.00',
  manufacturer: { id: 'm1', legal_name: 'Kora Mfg', address_line1: '1 Road', city: 'Jaipur', state_code: 'RJ', postal_code: '302001', country_code: 'IN', inherited: false },
  photo_facts: [{ key: 'color', value: 'Coral pink', confidence: 0.92, image_id: 'img', confirmed: false }],
  field_sources: {
    brand_name: { kind: 'sheet' },
    fabric_type: { kind: 'sheet' },
    color: { kind: 'photo', image_id: 'img', confidence: 0.92 },
    mrp: { kind: 'sheet' },
  },
  suggestions: { hsn_code: { value: '6109', basis: 'category' } },
}

const REQ = {
  category: 'tshirts',
  // As the backend answers since item 15: Amazon needs the packed box for every category.
  amazon: ['brand_name', 'color', 'country_of_origin', 'identifier', 'manufacturer', 'mrp', 'package_dimensions', 'package_weight', 'selling_price'],
  flipkart: ['country_of_origin', 'hsn_code', 'manufacturer', 'mrp', 'package_dimensions', 'package_weight', 'selling_price'],
}

function setup(sellOn: ('amazon' | 'flipkart')[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  qc.setQueryData(['t', 't1', 'catalog', 'requirements', 'tshirts'], REQ)
  render(
    <QueryClientProvider client={qc}>
      <ProductDetailsCard product={product} isVariant={false} source="own" sellOn={sellOn} />
    </QueryClientProvider>,
  )
}

const row = (key: string) => document.querySelector<HTMLElement>(`[data-attr-key="${key}"] dd`)!

describe('Product details sources and needs (SI12)', () => {
  it('shows where each value came from', () => {
    setup(['amazon'])
    expect(within(row('fabric_type')).getByLabelText('Source: From sheet')).toBeTruthy()
    expect(within(row('mrp')).getByLabelText('Source: From sheet')).toBeTruthy()
    expect(within(row('color')).getByLabelText('Source: From photo, not confirmed')).toBeTruthy()
    expect(within(row('hsn_code')).getByText('6109')).toBeTruthy()
    expect(within(row('hsn_code')).getByLabelText('Source: Suggested')).toBeTruthy()
  })

  it('confirms a photo value through the photo-facts confirm', async () => {
    setup(['amazon'])
    await userEvent.click(screen.getByTestId('field-confirm-color'))
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ key: 'color', value: 'Coral pink' }))
  })

  it('names only the ticked marketplaces that need an empty field, with a count', () => {
    setup(['flipkart'])
    expect(within(row('package')).getByLabelText('Source: Flipkart needs this')).toBeTruthy()
    expect(within(row('country_of_origin')).getByLabelText('Source: Flipkart needs this')).toBeTruthy()
    expect(within(row('hsn_code')).getByLabelText('Source: Flipkart needs this')).toBeTruthy()
    expect(screen.getByTestId('details-needs-summary').textContent).toBe('4 missing for Flipkart')
    cleanup()
    setup(['amazon', 'flipkart'])
    expect(within(row('country_of_origin')).getByLabelText('Source: Amazon and Flipkart need this')).toBeTruthy()
    cleanup()
    setup(['amazon'])
    expect(within(row('package')).getByLabelText('Source: Amazon needs this')).toBeTruthy()
    expect(screen.getByTestId('details-needs-summary').textContent).toBe('3 missing for Amazon')
    cleanup()
    setup([])
    expect(screen.queryByTestId('details-needs-summary')).toBeNull()
  })
})
