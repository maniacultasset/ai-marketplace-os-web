import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PhotoLink } from './photo-links'

vi.mock('./upload', async (orig) => ({ ...(await orig<typeof import('./upload')>()), uploadImage: vi.fn() }))
vi.mock('@/hooks/use-capabilities', () => ({ useCapability: () => true, useCapabilityProbe: () => ({ isPending: false, data: [] }) }))
let sheetPhotos = true
vi.mock('@/features/imports/sheet-photos', async (orig) => ({ ...(await orig<typeof import('@/features/imports/sheet-photos')>()), useSheetPhotos: () => sheetPhotos }))
const answers = new Map<string, () => Promise<unknown>>()
const get = vi.fn((path: string, ..._rest: unknown[]) => answers.get(path)?.() ?? new Promise(() => {}))
vi.mock('@/api/client', async (orig) => ({
  ...(await orig<typeof import('@/api/client')>()),
  api: { GET: (path: string, ...rest: unknown[]) => get(path, ...rest), POST: vi.fn(), PATCH: vi.fn(), DELETE: vi.fn() },
}))
vi.mock('@/lib/auth', async (orig) => ({ ...(await orig<typeof import('@/lib/auth')>()), useSession: () => ({ tenantId: 't1' }) }))
vi.mock('@/lib/permissions', async (orig) => ({ ...(await orig<typeof import('@/lib/permissions')>()), useCan: () => () => true }))
vi.mock('@/api/capabilities', async (orig) => ({ ...(await orig<typeof import('@/api/capabilities')>()), BUILT: new Proxy({}, { get: () => false }) }))

const { ProductImagesCard } = await import('./images-card')

const T = '11111111-1111-4111-8111-111111111111'
const P = '22222222-2222-4222-8222-222222222222'
const I1 = '33333333-3333-4333-8333-333333333331'
const I2 = '33333333-3333-4333-8333-333333333332'
const BLACK = '44444444-4444-4444-8444-444444444441'
const WHITE = '44444444-4444-4444-8444-444444444442'
const PRODUCT_PATH = '/products/{product_id}'

let n = 0
const link = (over: Partial<PhotoLink>): PhotoLink => ({
  link_id: `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
  position: 1,
  column: 'main_image',
  status: 'queued',
  retryable: false,
  ...over,
})

const links = [
  link({ position: 1, status: 'saved', view: 'front', image_id: I1 }),
  link({ position: 2, column: 'additional_images', status: 'failed', retryable: true, problem: 'not_public', http_status: 403, message: 'The link is not public. Share it so anyone with the link can view, then retry.' }),
  link({ position: 1, status: 'downloading', colourway_id: BLACK }),
]

const product = (over: Record<string, unknown> = {}) => ({
  id: P,
  images: [`${T}/${P}/images/${I1}`, `${T}/${P}/images/${I2}`],
  image_details: [
    { image_id: I1, slot: 'main' as const, position: 0, status: 'ready', origin: 'seller' as const, compliance_status: 'passed' as const },
    { image_id: I2, slot: 'main' as const, position: 0, status: 'ready', origin: 'seller' as const, compliance_status: 'passed' as const, colourway_id: BLACK },
  ],
  colourways: [
    { id: BLACK, colour: 'Black' },
    { id: WHITE, colour: 'White' },
  ],
  photo_links: links,
  photo_links_pending: true,
  ...over,
})

function setup(p = product()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <ProductImagesCard product={p} />
    </QueryClientProvider>,
  )
}

const productReads = () => get.mock.calls.filter(([path]) => path === PRODUCT_PATH).length

beforeEach(() => {
  sheetPhotos = true
  answers.clear()
  get.mockClear()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('ProductImagesCard photos from the file (G2)', () => {
  it('shows each colour’s links in its own section, the colourless ones under All colours', () => {
    setup()
    const groups = screen.getAllByTestId('colour-group')
    const all = within(groups[0]!).getByTestId('photo-links')
    expect(within(all).getAllByTestId('photo-link-problem').map((r) => r.textContent?.replace('Dismiss', ''))).toEqual([
      'Photo 2: The link is not public. Share it so anyone with the link can view, then retry.',
    ])
    expect(within(all).getByTestId('photo-links-retry')).toBeTruthy()
    expect(within(groups[1]!).getByTestId('photo-links-pending').textContent).toBe('Downloading 1 photo from your file…')
    expect(within(groups[2]!).queryByTestId('photo-links')).toBeNull()
  })

  it('tags the saved photo that came from the file', () => {
    setup()
    const rows = screen.getAllByTestId('image-row')
    const tagged = rows.filter((r) => within(r).queryByTestId('from-file-badge'))
    expect(tagged).toHaveLength(1)
    expect(tagged[0]!.dataset.imageId).toBe(I1)
  })

  it('shows one panel for a product with no colours', () => {
    setup(product({ colourways: [], photo_links: links.map((l) => ({ ...l, colourway_id: null })) }))
    expect(screen.getAllByTestId('photo-links')).toHaveLength(1)
    expect(screen.getByTestId('photo-links-pending').textContent).toBe('Downloading 1 photo from your file…')
  })

  it('keeps today’s card while the switch is off: no panel, no tag, no polling', () => {
    sheetPhotos = false
    setup()
    expect(screen.queryByTestId('photo-links')).toBeNull()
    expect(screen.queryByTestId('from-file-badge')).toBeNull()
    expect(productReads()).toBe(0)
  })

  it('reads the product every 3 s while a link downloads, and stops once nothing is pending', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let pending = true
    answers.set(PRODUCT_PATH, () => {
      const body = JSON.stringify({ ...product(), photo_links_pending: pending, attribute_literals: {} })
      return Promise.resolve({ data: body, error: undefined, response: new Response(body, { status: 200 }) })
    })
    setup()
    await act(() => vi.advanceTimersByTimeAsync(100))
    const first = productReads()
    expect(first).toBeGreaterThanOrEqual(1)
    await act(() => vi.advanceTimersByTimeAsync(3_100))
    expect(productReads()).toBe(first + 1)
    pending = false
    await act(() => vi.advanceTimersByTimeAsync(3_100))
    const settled = productReads()
    await act(() => vi.advanceTimersByTimeAsync(10_000))
    expect(productReads()).toBe(settled)
  })
})
