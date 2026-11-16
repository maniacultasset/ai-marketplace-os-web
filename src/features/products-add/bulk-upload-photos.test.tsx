import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
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
let sheetPhotos = false
vi.mock('@/features/imports/sheet-photos', async (orig) => ({ ...(await orig<typeof import('@/features/imports/sheet-photos')>()), useSheetPhotos: () => sheetPhotos }))
// Every read stays in flight: these look at the copy only. The column map is refused (an older
// backend), so the read-only column table shows once the matching state ends.
const noColumnMaps = () => {
  const error = { error: { type: 'NOT_FOUND', message: 'm', status: 404, correlation_id: 'req-1', details: null, error_report: null } }
  return Promise.resolve({ data: undefined, error, response: new Response(JSON.stringify(error), { status: 404 }) })
}
vi.mock('@/api/client', async (orig) => ({
  ...(await orig<typeof import('@/api/client')>()),
  api: { GET: () => new Promise(() => {}), POST: (path: string) => (path === '/imports/column-maps' ? noColumnMaps() : new Promise(() => {})) },
}))

const { BulkUpload } = await import('./bulk-upload')
const { UploadForm } = await import('@/features/imports/upload-form')

function setup(node: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <TooltipProvider>{node}</TooltipProvider>
    </QueryClientProvider>,
  )
}

const csv = (rows: string) => new File([`seller_sku,product_name,category,main_image,additional_images\n${rows}`], 'catalog.csv', { type: 'text/csv' })
const GOOD = 'KS-1,Kurta,ethnic_wear_kurta_sets,https://x.test/a.jpg,https://x.test/b.jpg|https://x.test/c.jpg\nKS-2,Kurta,ethnic_wear_kurta_sets,,\n'
const BAD = 'KS-1,Kurta,ethnic_wear_kurta_sets,http://x.test/a.jpg,\n'

async function chooseFile(file: File) {
  await userEvent.click(screen.getByTestId('bulk-next'))
  await userEvent.upload(screen.getByLabelText('CSV file'), file)
}

beforeEach(() => {
  sheetPhotos = false
})
afterEach(cleanup)

describe('bulk upload copy with sheet photos (G2)', () => {
  it('keeps today’s copy while the switch is off', async () => {
    setup(<BulkUpload listOn={[]} importId={null} jobId={null} />)
    expect(screen.getByTestId('photos-rule').textContent).toBe('Photos are not read from the file. Add them on each product’s Media tab after the import.')
    await chooseFile(csv(GOOD))
    const notice = await screen.findByTestId('photo-links-notice')
    expect(notice.textContent).toContain('1 row has photo links')
    expect(notice.textContent).toContain('Photo links are not used.')
    expect(notice.className).toContain('bg-attention-bg')
    expect((await screen.findByTestId('photo-link-note')).textContent).toBe('Not used. Clear these columns: a bad link still fails the row.')
  })

  it('says the photos download after the import while it is on, in a calm notice', async () => {
    sheetPhotos = true
    setup(<BulkUpload listOn={[]} importId={null} jobId={null} />)
    expect(screen.getByTestId('photos-rule').textContent).toBe('Photos are downloaded from main_image and additional_images after the import. Separate several links with |.')
    await chooseFile(csv(GOOD))
    const notice = await screen.findByTestId('photo-links-notice')
    expect(notice.textContent).toContain('1 row has photo links')
    expect(notice.textContent).toContain('The photos download after the import. Each link’s result shows in the report.')
    expect(notice.textContent).not.toContain('not used')
    expect(notice.className).toContain('bg-surface')
    const table = await screen.findByLabelText('Column matching')
    const photoRows = within(table).getAllByRole('row').filter((r) => /main_image|additional_images/.test(r.textContent ?? ''))
    expect(photoRows).toHaveLength(2)
    for (const r of photoRows) {
      expect(r.lastElementChild?.textContent).toMatch(/OK$/)
      expect(r.textContent).not.toContain('Not used')
    }
  })

  it('keeps a bad link a danger notice while it is on: the row still fails', async () => {
    sheetPhotos = true
    setup(<BulkUpload listOn={[]} importId={null} jobId={null} />)
    await chooseFile(csv(BAD))
    const notice = await screen.findByTestId('photo-links-notice')
    expect(notice.className).toContain('bg-danger-bg')
    expect(within(notice).getByTestId('link-problems').textContent).toContain('Row 2: main_image must hold https links.')
    expect(notice.textContent).toContain('A row with a bad link fails.')
  })
})

describe('import upload form copy with sheet photos (G2)', () => {
  it('keeps today’s guide while the switch is off', async () => {
    setup(<UploadForm />)
    expect(screen.getByTestId('photos-note').textContent).toBe('Photos are not read from the file. Add them on each product’s Media tab after the import.')
    await userEvent.click(screen.getByText('All accepted columns'))
    const group = screen.getAllByTestId('column-group').find((g) => g.textContent?.includes('main_image'))!
    expect(group.textContent).toContain('Photo links (not used)')
    expect(group.textContent).toContain('accepted, no photo is downloaded from them')
  })

  it('names the photo link columns, the | separator and the link rules while it is on', async () => {
    sheetPhotos = true
    setup(<UploadForm />)
    expect(screen.getByTestId('photos-note').textContent).toBe('Photos are downloaded from main_image and additional_images after the import. Separate several links with |.')
    await userEvent.click(screen.getByText('All accepted columns'))
    const group = screen.getAllByTestId('column-group').find((g) => g.textContent?.includes('main_image'))!
    expect(group.textContent).toContain('Photo links · downloaded after the import')
    expect(group.textContent).toContain('additional_images: more links, separated by |.')
    expect(group.textContent).not.toContain('not used')
  })
})
