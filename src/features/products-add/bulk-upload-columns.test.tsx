import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'

const navigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...rest }: { to: string; children: ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
  useNavigate: () => navigate,
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
const refuse = (status: number, type = 'NOT_FOUND') => {
  const error = { error: { type, message: 'm', status, correlation_id: 'req-1', details: null, error_report: null } }
  return Promise.resolve({ data: undefined, error, response: new Response(JSON.stringify(error), { status }) })
}

const MAP = '0b1c2d3e-0000-4000-8000-000000005001'
const map = {
  id: MAP,
  status: 'ready',
  created_at: '2026-11-09T10:00:00Z',
  needs_review_count: 1,
  mappings: [
    { position: 1, header_shown: 'seller_sku', key: 'seller_sku', method: 'exact', confidence: 1, needs_review: false },
    { position: 2, header_shown: 'product_name', key: 'product_name', method: 'exact', confidence: 1, needs_review: false },
    { position: 3, header_shown: 'category', key: 'category', method: 'exact', confidence: 1, needs_review: false },
    { position: 4, header_shown: 'colour shade', key: 'color_name', method: 'ai', confidence: 0.72, needs_review: true },
  ],
}
/** What the backend answers while `COLUMN_MAP_AI_ENABLED` is off: the leftover stays unmapped. */
const plainMap = {
  ...map,
  mappings: [...map.mappings.slice(0, 3), { position: 4, header_shown: 'colour shade', key: null, method: 'none', confidence: 0, needs_review: true }],
}

const csv = () => new File(['seller_sku,product_name,category,colour shade\nKS-1,Kurta,ethnic_wear_kurta_sets,Red\nKS-2,Kurta,ethnic_wear_kurta_sets,Blue\n'], 'catalog.csv', { type: 'text/csv' })

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        <BulkUpload listOn={[]} importId={null} jobId={null} />
      </TooltipProvider>
    </QueryClientProvider>,
  )
}

async function chooseFile() {
  await userEvent.click(screen.getByTestId('bulk-next'))
  await userEvent.upload(screen.getByLabelText('CSV file'), csv())
}

beforeEach(() => {
  get.mockReset()
  post.mockReset()
  navigate.mockReset()
  get.mockImplementation(() => new Promise(() => {}))
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})
afterEach(cleanup)

describe('Bulk upload column review (SI14)', () => {
  it('shows each header with its field, source and confidence, and waits for the weak match', async () => {
    post.mockImplementation((path: string, init: { body: unknown }) => {
      if (path === '/imports/column-maps') return ok(map, 201)
      if (path === '/imports/column-maps/{map_id}/confirm') return ok({ ...map, status: 'confirmed', needs_review_count: 0 })
      if (path === '/products/bulk') return ok({ import_id: 'i1', job_id: 'j1', status: 'queued', body: init.body }, 202)
      return refuse(404)
    })
    setup()
    await chooseFile()
    await screen.findByTestId('column-map-review')
    expect(post.mock.calls[0]![1].body).toEqual({ headers: ['seller_sku', 'product_name', 'category', 'colour shade'] })
    const row = screen.getAllByTestId('column-map-row').find((r) => r.dataset.position === '4')!
    expect(row.dataset.review).toBe('true')
    expect(row.textContent).toContain('Kuinn')
    expect(row.textContent).toContain('72%')
    expect(screen.getByTestId('column-map-summary').textContent).toBe('1 column needs your check before the rows are read.')
    const upload = screen.getByTestId('bulk-upload') as HTMLButtonElement
    expect(upload.disabled).toBe(true)
    expect(upload.textContent).toBe('Check the columns first')

    // Confirming the suggestion unblocks the upload, which confirms the map and sends its id.
    await userEvent.click(screen.getAllByTestId('map-use-4')[0]!)
    await waitFor(() => expect(upload.disabled).toBe(false))
    await userEvent.click(upload)
    await waitFor(() => expect(post.mock.calls.some((c) => c[0] === '/products/bulk')).toBe(true))
    const confirm = post.mock.calls.find((c) => c[0] === '/imports/column-maps/{map_id}/confirm')!
    expect(confirm[1].body.mappings).toContainEqual({ position: 4, key: 'color_name' })
    const fd = post.mock.calls.find((c) => c[0] === '/products/bulk')![1].body as FormData
    expect(fd.get('column_map_id')).toBe(MAP)
  }, 15_000)

  it('keeps today’s read-only matching while Kuinn is not asked about the columns (switch off)', async () => {
    post.mockImplementation((path: string) => (path === '/imports/column-maps' ? ok(plainMap, 201) : ok({ import_id: 'i1', job_id: 'j1', status: 'queued' }, 202)))
    setup()
    await chooseFile()
    await waitFor(() => expect(post.mock.calls.some((c) => c[0] === '/imports/column-maps')).toBe(true))
    await waitFor(() => expect((screen.getByTestId('bulk-upload') as HTMLButtonElement).textContent).toBe('Fix the columns first'))
    expect(screen.queryByTestId('column-map-review')).toBeNull()
    expect(screen.getByLabelText('Column matching')).toBeTruthy()
  })

  it('keeps today’s read-only matching against a backend without column maps', async () => {
    post.mockImplementation((path: string) => (path === '/imports/column-maps' ? refuse(404) : ok({ import_id: 'i1', job_id: 'j1', status: 'queued' }, 202)))
    setup()
    await chooseFile()
    await waitFor(() => expect(screen.getByLabelText('Column matching')).toBeTruthy())
    expect(screen.queryByTestId('column-map-review')).toBeNull()
    // The unknown column refuses the file exactly as before.
    expect((screen.getByTestId('bulk-upload') as HTMLButtonElement).textContent).toBe('Fix the columns first')
  })
})
