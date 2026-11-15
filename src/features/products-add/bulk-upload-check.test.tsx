import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
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
vi.mock('@/features/ai-credit/use-ai-paused', () => ({ useAiPaused: () => false }))

const get = vi.fn()
const post = vi.fn()
vi.mock('@/api/client', async (orig) => ({
  ...(await orig<typeof import('@/api/client')>()),
  api: { GET: (...a: unknown[]) => get(...a), POST: (...a: unknown[]) => post(...a) },
}))

const { BulkUpload } = await import('./bulk-upload')

const ok = (body: unknown, status = 200) => Promise.resolve({ data: body, error: undefined, response: new Response(JSON.stringify(body), { status }) })
const page = (data: unknown[]) => ({ data, page: { has_more: false, next_cursor: null } })

const IMPORT = '0b1c2d3e-0000-4000-8000-000000006001'
const JOB = '0b1c2d3e-0000-4000-8000-000000006002'
const MAP = '0b1c2d3e-0000-4000-8000-000000006003'

/** The prod bulk test sheet's shape: seller headers matched by known names, one the API does not echo. */
const map = {
  id: MAP,
  status: 'ready',
  created_at: '2026-11-15T10:00:00Z',
  needs_review_count: 0,
  mappings: [
    { position: 1, header_shown: 'sku', key: 'seller_sku', method: 'alias', confidence: 1, needs_review: false },
    { position: 2, header_shown: 'product title', key: 'product_name', method: 'alias', confidence: 1, needs_review: false },
    { position: 3, header_shown: 'category', key: 'category', method: 'exact', confidence: 1, needs_review: false },
    { position: 4, header_shown: 'column 4', key: 'package_weight_g', method: 'fuzzy', confidence: 0.9, needs_review: false },
    { position: 5, header_shown: 'notes', key: null, method: 'none', confidence: 0, needs_review: true },
  ],
}
const csv = () =>
  new File(['SKU,Product Title,category,Weight (g),Notes\nKS-1,Kurta,ethnic_wear_kurta_sets,355,x\nKS-1,Kurta,ethnic_wear_kurta_sets,380,y\nKS-3,Kurta,ethnic_wear_kurta_sets,500 kg,z\n'], 'seller.csv', {
    type: 'text/csv',
  })

const failedRows = [
  { row_number: 3, sku: 'KS-1', status: 'failed', errors: [{ field: 'file.row', error_code: 'DUPLICATE_SKU_IN_FILE', message: 'seller_sku repeats an earlier row', source: 'schema', severity: 'error', retryable: false }] },
  { row_number: 4, sku: 'KS-3', status: 'failed', errors: [{ field: 'file.row', error_code: 'PATTERN_MISMATCH', message: 'package_weight_g must be whole grams', source: 'schema', severity: 'error', retryable: false }] },
]

/** Every check-step read; the failed rows answer only when `release` is called. */
function serve({ connected = ['amazon'] as string[] } = {}) {
  let release: () => void = () => {}
  const rowsGate = new Promise<void>((r) => (release = r))
  get.mockImplementation((path: string, init?: { params?: { query?: { status?: string } } }) => {
    if (path === '/jobs/{job_id}') return ok({ job_id: JOB, kind: 'bulk_import', status: 'partial', attempt: 1, max_attempts: 3, progress_pct: 100 })
    if (path === '/imports/{import_id}') return ok({ import_id: IMPORT, total_rows: 3, imported: 1, failed: 2, schema_version: '2.1.0' })
    if (path === '/imports/{import_id}/rows') {
      if (init?.params?.query?.status === 'failed') return rowsGate.then(() => ok(page(failedRows)))
      return ok(page([{ row_number: 2, sku: 'KS-1', status: 'imported', product_id: 'p1', errors: [] }]))
    }
    if (path === '/marketplaces/accounts') return ok(page(connected.map((m, i) => ({ id: `a${i}`, marketplace: m, status: 'active' }))))
    if (path === '/products' || path === '/listings') return ok(page([]))
    return new Promise(() => {})
  })
  return { release: () => release() }
}

function renderBulk(props: { importId: string | null; jobId: string | null; listOn?: ('amazon' | 'flipkart')[] }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        <BulkUpload listOn={props.listOn ?? []} importId={props.importId} jobId={props.jobId} />
      </TooltipProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  get.mockReset()
  post.mockReset()
  navigate.mockReset()
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})
afterEach(cleanup)

const tile = (caption: string) => within(screen.getByTestId('bulk-counts')).getByText(caption).parentElement!

describe('Bulk upload check step (prod bulk test, 15 Nov)', () => {
  it('shows the seller’s own header text in the column review (W4)', async () => {
    get.mockImplementation(() => new Promise(() => {}))
    post.mockImplementation((path: string) => (path === '/imports/column-maps' ? ok(map, 201) : new Promise(() => {})))
    renderBulk({ importId: null, jobId: null })
    await userEvent.click(screen.getByTestId('bulk-next'))
    await userEvent.upload(screen.getByLabelText('CSV file'), csv())
    await screen.findByTestId('column-map-review')
    const row = screen.getAllByTestId('column-map-row').find((r) => r.dataset.position === '4')!
    expect(row.textContent).toContain('Weight (g)')
    expect(row.textContent).not.toContain('column 4')
  })

  it('after an upload with a column map, shows that map and counts its columns, not the exact-name table (W1)', async () => {
    serve()
    post.mockImplementation((path: string) => {
      if (path === '/imports/column-maps') return ok(map, 201)
      if (path === '/imports/column-maps/{map_id}/confirm') return ok({ ...map, status: 'confirmed' })
      if (path === '/products/bulk') return ok({ import_id: IMPORT, job_id: JOB, status: 'queued' }, 202)
      return new Promise(() => {})
    })
    renderBulk({ importId: null, jobId: null })
    await userEvent.click(screen.getByTestId('bulk-next'))
    await userEvent.upload(screen.getByLabelText('CSV file'), csv())
    await screen.findByTestId('column-map-review')
    const upload = screen.getByTestId('bulk-upload') as HTMLButtonElement
    // The unmatched Notes column waits for an answer: leave it out.
    await userEvent.click(screen.getAllByTestId('map-field-5')[0]!)
    await userEvent.click(await screen.findByRole('option', { name: 'Don’t import this column' }))
    await waitFor(() => expect(upload.disabled).toBe(false))
    await userEvent.click(upload)
    await waitFor(() => expect(navigate).toHaveBeenCalled())
    cleanup()

    renderBulk({ importId: IMPORT, jobId: JOB })
    const review = await screen.findByTestId('column-map-review')
    expect(review.textContent).toContain('The import read 4 of 5 columns as below.')
    expect(review.textContent).toContain('Weight (g)')
    expect(review.textContent).toContain('Not imported')
    expect(screen.queryAllByRole('combobox')).toHaveLength(0)
    expect(screen.queryByText(/Missing required/)).toBeNull()
    expect(screen.queryByText('columns matched by name')).toBeNull()
    await waitFor(() => expect(tile('columns matched').textContent).toContain('4'))
  }, 15_000)

  it('keeps the fix and repeat counts waiting until the failed rows load, then counts the repeat apart (W2)', async () => {
    const { release } = serve()
    renderBulk({ importId: IMPORT, jobId: JOB })
    await screen.findByTestId('bulk-counts')
    await waitFor(() => expect(tile('rows imported, ready for the agent').textContent).toContain('1'))
    // The rows have not answered: no number is shown that would change once they do.
    expect(tile('need a fix').textContent).toBe('need a fix')
    expect(tile('repeat a SKU in the file').textContent).toBe('repeat a SKU in the file')
    release()
    await waitFor(() => expect(tile('need a fix').textContent).toBe('1need a fix'))
    expect(tile('repeat a SKU in the file').textContent).toBe('1repeat a SKU in the file')
  })

  it('pre-selects the connected marketplaces when no choice came with the page (W3)', async () => {
    serve({ connected: ['amazon'] }).release()
    renderBulk({ importId: IMPORT, jobId: JOB })
    const amazon = await screen.findByRole('checkbox', { name: 'Amazon' })
    await waitFor(() => expect(amazon.getAttribute('data-state')).toBe('checked'))
    await userEvent.click(amazon)
    await waitFor(() => expect(amazon.getAttribute('data-state')).toBe('unchecked'))
  })
})
