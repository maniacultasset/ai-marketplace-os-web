import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const uploadImage = vi.fn()
vi.mock('./upload', async (orig) => ({ ...(await orig<typeof import('./upload')>()), uploadImage: (...a: unknown[]) => uploadImage(...a) }))
let live = false
vi.mock('@/hooks/use-capabilities', () => ({ useCapability: () => live, useCapabilityProbe: () => ({ isPending: false, data: [] }) }))
// Reports stay loading: these tests look at grouping and the upload call only.
vi.mock('@/api/client', async (orig) => ({ ...(await orig<typeof import('@/api/client')>()), api: { GET: () => new Promise(() => {}) } }))
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

const product = {
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
}

function setup(p: Parameters<typeof ProductImagesCard>[0]['product'] = product) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <ProductImagesCard product={p} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  live = false
  uploadImage.mockReset()
  // Radix Select in jsdom.
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})
afterEach(cleanup)

describe('ProductImagesCard per colour', () => {
  it('groups images under All colours and each colour, and says when a colour has none', () => {
    setup()
    const groups = screen.getAllByTestId('colour-group')
    expect(groups.map((g) => g.dataset.colour)).toEqual(['all', BLACK, WHITE])
    expect(within(groups[1]!).getByText('1 image')).toBeTruthy()
    expect(within(groups[2]!).getByText('No photos yet')).toBeTruthy()
    expect(within(groups[2]!).getByText(/Uses the photos for all colours/)).toBeTruthy()
  })

  it('shows a flat list for a product with no colours', () => {
    setup({ ...product, colourways: [] })
    expect(screen.queryAllByTestId('colour-group')).toHaveLength(0)
    expect(screen.getByLabelText('Product images').querySelectorAll('[data-testid="image-row"]')).toHaveLength(2)
  })
})

describe('ProductImagesCard upload', () => {
  const file = () => new File(['x'], 'front.jpg', { type: 'image/jpeg' })
  beforeEach(() => {
    live = true
    uploadImage.mockResolvedValue({ image_id: '33333333-3333-4333-8333-333333333339', job_id: 'j1', status: 'queued' })
  })

  it('offers no colour choice for a product with no colours and sends none', async () => {
    setup({ ...product, colourways: [] })
    expect(screen.queryByTestId('image-colour')).toBeNull()
    await userEvent.upload(screen.getByLabelText('Image files'), file())
    await waitFor(() => expect(uploadImage).toHaveBeenCalled())
    expect(uploadImage.mock.calls[0]![0]).toMatchObject({ productId: P, colourwayId: null })
  })

  it('files the upload under the colour picked', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(screen.getByTestId('image-colour'))
    await user.click(await screen.findByRole('option', { name: 'White' }))
    // White has no main yet, so the hint does not warn about replacing one.
    expect(screen.queryByText(/replaces the current one/)).toBeNull()
    await user.upload(screen.getByLabelText('Image files'), file())
    await waitFor(() => expect(uploadImage).toHaveBeenCalled())
    // White has no main yet, so its first photo is its main, like on the variants page.
    expect(uploadImage.mock.calls[0]![0]).toMatchObject({ productId: P, slot: 'main', colourwayId: WHITE })
  })

  it('picking a colour that has a main moves the slot to secondary', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(screen.getByTestId('image-colour'))
    await user.click(await screen.findByRole('option', { name: 'White' }))
    expect(screen.getByTestId('image-slot').textContent).toBe('Main')
    await user.click(screen.getByTestId('image-colour'))
    await user.click(await screen.findByRole('option', { name: 'Black' }))
    expect(screen.getByTestId('image-slot').textContent).toBe('Secondary')
  })

  it('warns that a new main replaces the colour’s current main', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(screen.getByTestId('image-colour'))
    await user.click(await screen.findByRole('option', { name: 'Black' }))
    await user.click(screen.getByTestId('image-slot'))
    await user.click(await screen.findByRole('option', { name: 'Main' }))
    expect(screen.getByText('A new main image replaces the current one for Black.')).toBeTruthy()
  })

  it('never files a size chart under a colour', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(screen.getByTestId('image-colour'))
    await user.click(await screen.findByRole('option', { name: 'Black' }))
    await user.click(screen.getByTestId('image-slot'))
    await user.click(await screen.findByRole('option', { name: 'Size chart' }))
    expect(screen.queryByTestId('image-colour')).toBeNull()
    await user.upload(screen.getByLabelText('Image files'), file())
    await waitFor(() => expect(uploadImage).toHaveBeenCalled())
    expect(uploadImage.mock.calls[0]![0]).toMatchObject({ slot: 'size_chart', colourwayId: null })
  })

  it('names each select by its visible words', () => {
    setup()
    expect(screen.getByRole('combobox', { name: 'Colour' })).toBeTruthy()
    expect(screen.getByRole('combobox', { name: 'Upload as' })).toBeTruthy()
  })
})

describe('ProductImagesCard image fixes (SI7)', () => {
  beforeEach(() => {
    live = true
  })
  const withFixes = {
    ...product,
    colourways: [],
    size_chart: { rows: [{ size: 'M' }] },
    image_details: [
      { image_id: I1, slot: 'main' as const, position: 0, status: 'ready', origin: 'generated' as const, parent_image_id: I2, fixes: ['fix' as const], compliance_status: 'failed' as const },
      { image_id: I2, slot: 'secondary' as const, position: 1, status: 'ready', origin: 'seller' as const, compliance_status: 'passed' as const },
    ],
  }

  it('badges the AI image and the kept original, and holds the fixes while the list loads', () => {
    setup(withFixes)
    const rows = screen.getAllByTestId('image-row')
    expect(within(rows[0]!).getByTestId('origin-badge').textContent).toContain('AI white background')
    expect(within(rows[1]!).getByTestId('kept-badge')).toBeTruthy()
    expect(within(rows[0]!).getByLabelText('Loading image fixes')).toBeTruthy()
    expect(screen.getByTestId('size-chart-image')).toBeTruthy()
  })

  it('offers no size chart image on a variant', () => {
    setup({ ...withFixes, parent_product_id: P })
    expect(screen.queryByTestId('size-chart-image')).toBeNull()
  })

  it('stays off against a backend without image candidates', () => {
    setup({ ...product, colourways: [], size_chart: { rows: [{ size: 'M' }] }, image_details: product.image_details.map(({ origin: _o, ...d }) => d) as never })
    expect(screen.queryByTestId('size-chart-image')).toBeNull()
    expect(screen.queryByLabelText('Loading image fixes')).toBeNull()
  })
})
