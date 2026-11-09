import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Schema } from '@/api/types'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, params, search, children, ...rest }: { to: string; params?: { productId: string }; search?: { tab?: string }; children: ReactNode }) => (
    <a href={`${to.replace('$productId', params?.productId ?? '')}${search?.tab ? `?tab=${search.tab}` : ''}`} {...rest}>
      {children}
    </a>
  ),
}))
// Unseeded product reads stay in flight.
vi.mock('@/api/client', async (orig) => ({ ...(await orig<typeof import('@/api/client')>()), api: { GET: () => new Promise(() => {}) } }))
vi.mock('@/lib/auth', async (orig) => ({ ...(await orig<typeof import('@/lib/auth')>()), useSession: () => ({ tenantId: 't1' }) }))

const { NeedsPhotosCard } = await import('./needs-photos-card')
const { productQuery } = await import('@/features/products/api')
const { keysFor } = await import('@/lib/query-keys')

afterEach(cleanup)

const product = (id: string, images: string[] = []): Schema<'ProductOut'> => ({
  id,
  sku: `SKU-${id}`,
  title: `Kurta ${id}`,
  status: 'active',
  category: 'kurta_sets',
  created_at: 'x',
  identifier_exemption: false, brand_name_inherited: false, size_chart_read_enabled: false, category_suggest_enabled: false,
  updated_at: 'x',
  images,
})

function setup(products: Schema<'ProductOut'>[], seed: Record<string, Schema<'ProductOut'>> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  for (const [id, p] of Object.entries(seed)) qc.setQueryData(productQuery(keysFor('t1'), id).queryKey, { ...p, etag: '"v"', attribute_literals: {} })
  render(
    <QueryClientProvider client={qc}>
      <NeedsPhotosCard products={products} />
    </QueryClientProvider>,
  )
}

describe('NeedsPhotosCard', () => {
  it('lists products with no main photo and links each to its Media tab', () => {
    const withMain = product('b', ['k1'])
    const secondaryOnly = product('c', ['k2'])
    setup([product('a'), withMain, secondaryOnly], {
      b: { ...withMain, image_details: [{ image_id: 'i1', slot: 'main', position: 0, status: 'ready', origin: 'seller' as const, compliance_status: 'passed' }] },
      c: { ...secondaryOnly, image_details: [{ image_id: 'i2', slot: 'secondary', position: 1, status: 'ready', origin: 'seller' as const, compliance_status: 'passed' }] },
    })
    expect(screen.getByText('2 products need photos')).toBeTruthy()
    const links = screen.getAllByTestId('needs-photos-row')
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['/products/a?tab=media', '/products/c?tab=media'])
  })

  it('shows nothing when every product has a main photo', () => {
    const p = product('b', ['k1'])
    setup([p], { b: { ...p, image_details: [{ image_id: 'i1', slot: 'main', position: 0, status: 'ready', origin: 'seller' as const, compliance_status: 'passed' }] } })
    expect(screen.queryByTestId('needs-photos')).toBeNull()
  })

  it('renders nothing while the photo reads are in flight, so nothing appears and then vanishes', () => {
    setup([product('a'), product('b', ['k1'])])
    expect(screen.queryByTestId('needs-photos')).toBeNull()
    expect(screen.queryByLabelText('Checking photos')).toBeNull()
  })
})
