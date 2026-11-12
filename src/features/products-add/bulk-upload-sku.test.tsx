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
vi.mock('@/features/assist/flags', async (orig) => ({ ...(await orig<object>()), useLampsEnabled: () => ({ enabled: false, pending: false }) }))

const get = vi.fn()
const post = vi.fn()
vi.mock('@/api/client', async (orig) => ({
  ...(await orig<typeof import('@/api/client')>()),
  api: { GET: (...a: unknown[]) => get(...a), POST: (...a: unknown[]) => post(...a) },
}))

const { BulkUpload } = await import('./bulk-upload')

const ok = (body: unknown, status = 200) => Promise.resolve({ data: body, error: undefined, response: new Response(JSON.stringify(body), { status }) })
const refuse = (status: number) => {
  const error = { error: { type: 'NOT_FOUND', message: 'm', status, correlation_id: 'req-1', details: null, error_report: null } }
  return Promise.resolve({ data: undefined, error, response: new Response(JSON.stringify(error), { status }) })
}

const file = (text: string) => new File([text], 'catalog.csv', { type: 'text/csv' })

async function open(text: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        <BulkUpload listOn={[]} importId={null} jobId={null} />
      </TooltipProvider>
    </QueryClientProvider>,
  )
  await userEvent.click(screen.getByTestId('bulk-next'))
  await userEvent.upload(screen.getByLabelText('CSV file'), file(text))
}

const checks = () => post.mock.calls.filter((c) => c[0] === '/skus/availability-check')

beforeEach(() => {
  get.mockReset()
  post.mockReset()
  get.mockImplementation(() => new Promise(() => {}))
  Element.prototype.scrollIntoView ??= () => {}
})
afterEach(cleanup)

describe('Bulk upload duplicate SKU check (client feedback 11 Nov, item 3)', () => {
  it('names repeats in the file and SKUs already in the brand before the upload', async () => {
    post.mockImplementation((path: string) => {
      if (path === '/skus/availability-check')
        return ok({
          checked: 3,
          taken: [
            { sku: 'KS-1', available: false, product_id: 'p1', title: 'Cotton kurta', is_variant: false, deleted: false },
            { sku: 'KS-9-S', available: false, product_id: 'p2', title: 'Linen set', is_variant: true, deleted: false },
          ],
        })
      return refuse(404)
    })
    await open('seller_sku,product_name,category\nKS-1,Kurta,tshirts\nKS-2,Kurta,tshirts\nKS-2,Kurta,tshirts\nKS-9-S,Small,tshirts\n')
    const fails = await screen.findByTestId('csv-sku-fails')
    expect(checks()[0]![1].body).toEqual({ skus: ['KS-1', 'KS-2', 'KS-9-S'] })
    expect(fails.textContent).toContain('Row 4: KS-2 is on rows 3, 4. Every row after the first fails')
    expect(fails.textContent).toContain('Row 5: KS-9-S is a size or colour of “Linen set”. Add its style in parent_style_id')
    expect(screen.getByText('2 rows will fail for the SKU')).toBeTruthy()
    expect(screen.getByTestId('csv-sku-updates').textContent).toBe('Row 2: KS-1 updates “Cotton kurta”.')
    expect(screen.getByText('1 row use a SKU already in this brand')).toBeTruthy()
  })

  it('says so when every SKU is new and used once', async () => {
    post.mockImplementation((path: string) => (path === '/skus/availability-check' ? ok({ checked: 2, taken: [] }) : refuse(404)))
    await open('seller_sku,product_name,category\nKS-1,Kurta,tshirts\nKS-2,Kurta,tshirts\n')
    await screen.findByTestId('csv-sku-clear')
    expect(screen.queryByTestId('csv-sku-fails')).toBeNull()
  })

  it('stays calm when the check fails: the repeats still show and the import checks each row', async () => {
    post.mockImplementation(() => refuse(500))
    await open('seller_sku,product_name,category\nKS-1,Kurta,tshirts\nKS-1,Kurta,tshirts\n')
    await screen.findByTestId('csv-sku-unknown')
    await waitFor(() => expect(screen.getByTestId('csv-sku-fails').textContent).toContain('KS-1 is on rows 2, 3'))
  })

  it('reads the SKU column Kuinn matched in the column map, and flags a family’s style sent alone', async () => {
    const map = {
      id: 'map-1',
      status: 'ready',
      needs_review_count: 0,
      created_at: '2026-11-12T00:00:00Z',
      mappings: [
        { position: 1, header_shown: 'Item code', key: 'seller_sku', method: 'ai', confidence: 0.95, needs_review: false },
        { position: 2, header_shown: 'product_name', key: 'product_name', method: 'exact', confidence: 1, needs_review: false },
        { position: 3, header_shown: 'category', key: 'category', method: 'exact', confidence: 1, needs_review: false },
      ],
    }
    post.mockImplementation((path: string) => {
      if (path === '/imports/column-maps') return ok(map, 201)
      if (path === '/skus/availability-check')
        return ok({ checked: 2, taken: [{ sku: 'ST-1', available: false, product_id: 'p1', title: 'Linen set', is_variant: false, deleted: false, family_role: 'style' }] })
      return refuse(404)
    })
    get.mockImplementation(() => ok(map))
    await open('Item code,product_name,category\nST-1,Linen set,tshirts\nNEW-1,Tee,tshirts\n')
    const fails = await screen.findByTestId('csv-sku-fails')
    expect(checks()[0]![1].body).toEqual({ skus: ['ST-1', 'NEW-1'] })
    expect(fails.textContent).toContain('Row 2: ST-1 is “Linen set”, a style with sizes or colours. Send it with its variants')
    expect(screen.getByText('1 row will fail for the SKU')).toBeTruthy()
  })
})
