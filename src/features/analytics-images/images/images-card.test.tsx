import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const uploadImage = vi.fn()
vi.mock('./upload', async (orig) => ({ ...(await orig<typeof import('./upload')>()), uploadImage: (...a: unknown[]) => uploadImage(...a) }))
let live = false
vi.mock('@/hooks/use-capabilities', () => ({ useCapability: () => live, useCapabilityProbe: () => ({ isPending: false, data: [] }) }))
// Reports stay loading unless a test answers a path: these look at grouping, the upload call and the fixes.
const answers = new Map<string, () => Promise<unknown>>()
const get = vi.fn((path: string, ..._rest: unknown[]) => answers.get(path)?.() ?? new Promise(() => {}))
const post = vi.fn()
vi.mock('@/api/client', async (orig) => ({
  ...(await orig<typeof import('@/api/client')>()),
  api: { GET: (path: string, ...rest: unknown[]) => get(path, ...rest), POST: (...a: unknown[]) => post(...a) },
}))
const ok = (body: unknown, status = 200) => Promise.resolve({ data: body, error: undefined, response: new Response(JSON.stringify(body), { status }) })
const refuse = (status: number) => {
  const error = { error: { type: 'NOT_FOUND', message: 'm', status, correlation_id: 'req-1', details: null, error_report: null } }
  return Promise.resolve({ data: undefined, error, response: new Response(JSON.stringify(error), { status }) })
}
const CANDIDATES = '/products/{product_id}/image-candidates'
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
  answers.clear()
  get.mockClear()
  post.mockReset()
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

describe('ProductImagesCard photo tiles (SI12)', () => {
  const file = () => new File(['x'], 'front.jpg', { type: 'image/jpeg' })
  beforeEach(() => {
    live = true
    uploadImage.mockResolvedValue({ image_id: '33333333-3333-4333-8333-333333333339', job_id: 'j1', status: 'queued' })
  })

  it('shows Front, Back, Close-up and Size chart, and sends the Front as the main photo with no colour', async () => {
    setup({ ...product, colourways: [] })
    // This product already has its Front photo: no Required on it.
    expect(screen.queryByTestId('photo-slot-required')).toBeNull()
    expect(screen.getAllByTestId(/^photo-slot-(front|back|close_up|size_chart)$/).map((t) => t.dataset.testid)).toEqual([
      'photo-slot-front',
      'photo-slot-back',
      'photo-slot-close_up',
      'photo-slot-size_chart',
    ])
    expect(screen.queryByTestId('image-colour')).toBeNull()
    await userEvent.upload(screen.getByLabelText('Front photo file'), file())
    await waitFor(() => expect(uploadImage).toHaveBeenCalled())
    expect(uploadImage.mock.calls[0]![0]).toMatchObject({ productId: P, slot: 'main', role: null, colourwayId: null })
  })

  it('sends the Back and Close-up roles with the secondary slot', async () => {
    setup({ ...product, colourways: [] })
    await userEvent.upload(screen.getByLabelText('Back photo file'), file())
    await userEvent.upload(screen.getByLabelText('Close-up photo file'), file())
    await waitFor(() => expect(uploadImage).toHaveBeenCalledTimes(2))
    expect(uploadImage.mock.calls.map((c) => c[0])).toEqual([
      expect.objectContaining({ slot: 'secondary', role: 'back' }),
      expect.objectContaining({ slot: 'secondary', role: 'close_up' }),
    ])
  })

  it('says what each tile holds from the product read', () => {
    setup({
      ...product,
      colourways: [],
      image_details: [
        { image_id: I1, slot: 'main' as const, position: 0, status: 'ready', origin: 'seller' as const, compliance_status: 'passed' as const },
        { image_id: I2, slot: 'secondary' as const, role: 'back' as const, position: 1, status: 'ready', origin: 'seller' as const, compliance_status: 'pending' as const },
      ],
    })
    expect(within(screen.getByTestId('photo-slot-front')).getByText('Checked')).toBeTruthy()
    expect(within(screen.getByTestId('photo-slot-back')).getByText('Checking…')).toBeTruthy()
    expect(screen.getByTestId('photo-slots-recommended').textContent).toBe('Recommended')
    expect(screen.queryByTestId('photo-slot-required')).toBeNull()
    expect(screen.getByLabelText('Replace front photo')).toBeTruthy()
    expect(screen.getByLabelText('Add close-up photo')).toBeTruthy()
  })

  it('files the tiles under the colour picked', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(screen.getByTestId('image-colour'))
    await user.click(await screen.findByRole('option', { name: 'White' }))
    await user.upload(screen.getByLabelText('Back photo file'), file())
    await waitFor(() => expect(uploadImage).toHaveBeenCalled())
    expect(uploadImage.mock.calls[0]![0]).toMatchObject({ productId: P, slot: 'secondary', role: 'back', colourwayId: WHITE })
  })

  it('never files a size chart under a colour', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(screen.getByTestId('image-colour'))
    await user.click(await screen.findByRole('option', { name: 'Black' }))
    await user.upload(screen.getByLabelText('Size chart photo file'), file())
    await waitFor(() => expect(uploadImage).toHaveBeenCalled())
    expect(uploadImage.mock.calls[0]![0]).toMatchObject({ slot: 'size_chart', colourwayId: null })
  })

  it('marks an empty Front tile Required on the tile itself', () => {
    setup({ id: P, images: [], image_details: [], colourways: [] })
    expect(within(screen.getByTestId('photo-slot-front')).getByTestId('photo-slot-required').textContent).toBe('Required')
    expect(screen.getByTestId('photo-slots-recommended').textContent).toBe('Recommended')
  })

  it('has no size chart tile on a variant', () => {
    setup({ ...product, colourways: [], parent_product_id: P })
    expect(screen.getByTestId('photo-slot-front')).toBeTruthy()
    expect(screen.queryByTestId('photo-slot-size_chart')).toBeNull()
  })

  it('keeps More photos collapsed, and uploads the extra kinds from it', async () => {
    const user = userEvent.setup()
    setup({ ...product, colourways: [] })
    expect(screen.queryByLabelText('Image files')).toBeNull()
    await user.click(screen.getByTestId('more-photos-toggle'))
    expect(screen.getByRole('combobox', { name: 'Upload as' })).toBeTruthy()
    await user.click(screen.getByTestId('image-slot'))
    expect((await screen.findAllByRole('option')).map((o) => o.textContent)).toEqual(['Secondary', 'Lifestyle', 'Packaging label'])
    await user.click(screen.getByRole('option', { name: 'Lifestyle' }))
    await user.upload(screen.getByLabelText('Image files'), [file(), file()])
    await waitFor(() => expect(uploadImage).toHaveBeenCalledTimes(2))
    expect(uploadImage.mock.calls[0]![0]).toMatchObject({ slot: 'lifestyle', role: null })
  })

  it('names the colour select by its visible word', () => {
    setup()
    expect(screen.getByRole('combobox', { name: 'Colour' })).toBeTruthy()
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

  it('badges the AI image and the kept original under the title, and holds the fixes while the list loads', () => {
    setup(withFixes)
    const rows = screen.getAllByTestId('image-row')
    expect(within(within(rows[0]!).getByTestId('image-meta')).getByTestId('origin-badge').textContent).toContain('AI white background')
    expect(within(within(rows[1]!).getByTestId('image-meta')).getByTestId('kept-badge')).toBeTruthy()
    expect(within(rows[0]!).getByLabelText('Loading image fixes')).toBeTruthy()
    // Support is not known yet: no size chart button before the list answers.
    expect(screen.queryByTestId('size-chart-image')).toBeNull()
  })

  it('titles each row from the product read, so a demoted main never reads as a second Front', () => {
    setup(withFixes)
    const rows = screen.getAllByTestId('image-row')
    expect(rows.map((r) => r.querySelector('[data-testid="image-title"]')?.textContent)).toEqual(['Front', 'Secondary'])
  })

  it('titles a Back photo by its role', () => {
    setup({ ...withFixes, image_details: [withFixes.image_details[0]!, { ...withFixes.image_details[1]!, role: 'back' as const }] })
    const rows = screen.getAllByTestId('image-row')
    expect(rows.map((r) => r.querySelector('[data-testid="image-title"]')?.textContent)).toEqual(['Front', 'Back'])
  })

  it('offers the size chart image on a product with no photos once the list answers', async () => {
    answers.set(CANDIDATES, () => ok({ items: [] }))
    setup({ id: P, images: [], image_details: [], colourways: [], size_chart: { rows: [{ size: 'M' }] } })
    expect(await screen.findByTestId('make-size_chart')).toBeTruthy()
  })

  it('offers no size chart image on a variant', async () => {
    answers.set(CANDIDATES, () => ok({ items: [] }))
    setup({ ...withFixes, parent_product_id: P })
    await waitFor(() => expect(get).toHaveBeenCalledWith(CANDIDATES, expect.anything()))
    expect(screen.queryByTestId('size-chart-image')).toBeNull()
  })

  it('stays off against a backend without image candidates', async () => {
    answers.set(CANDIDATES, () => refuse(404))
    setup({ ...withFixes, image_details: withFixes.image_details.map((d) => ({ ...d, fixes: undefined })) })
    await waitFor(() => expect(screen.queryByLabelText('Loading image fixes')).toBeNull())
    expect(screen.queryByTestId('size-chart-image')).toBeNull()
    expect(screen.queryByTestId('candidate-block')).toBeNull()
  })

  it('after a use, polls the new image job and reads the product again when it ends', async () => {
    const ready = { id: 'c1', kind: 'fix', status: 'ready', source_image_id: I1, preview_url: 'https://s.test/c.png', source_preview_url: 'https://s.test/s.jpg', cost_usd: '0', created_at: new Date().toISOString() }
    answers.set(CANDIDATES, () => ok({ items: [ready] }))
    answers.set('/jobs/{job_id}', () => ok({ job_id: 'J9', status: 'succeeded', kind: 'image_compliance' }))
    post.mockReturnValue(ok({ image_id: 'NEW', job_id: 'J9', poll_url: '/api/v1/jobs/J9', status: 'queued' }, 202))
    setup(withFixes)
    await userEvent.click(await screen.findByTestId('candidate-use'))
    await waitFor(() =>
      expect(get.mock.calls.some(([path, init]) => path === '/jobs/{job_id}' && (init as { params: { path: { job_id: string } } }).params.path.job_id === 'J9')).toBe(true),
    )
  })
})

describe('ProductImagesCard saved photos (after a reload)', () => {
  const VIEW1 = 'http://localhost:9000/marketplace-images/t/p/derived/i1/vision.jpg?X-Amz-Signature=a'
  const withViews = {
    ...product,
    colourways: [],
    image_details: [
      { ...product.image_details[0]!, view_url: VIEW1, view_expires_at: '2099-01-01T00:00:00Z' },
      { ...product.image_details[1]!, slot: 'secondary' as const, colourway_id: null, view_url: null },
    ],
  }

  it('shows each saved photo in its row from the product read, and a quiet placeholder while one has no view yet', () => {
    setup(withViews)
    const rows = screen.getAllByTestId('image-row')
    const first = within(rows[0]!).getByTestId('image-thumb')
    expect(first.querySelector('img')?.getAttribute('src')).toBe(VIEW1)
    expect(first.querySelector('img')?.getAttribute('alt')).toBe('Front image')
    expect(within(rows[1]!).getByTestId('image-thumb').querySelector('img')).toBeNull()
  })

  it('fills the Front tile with the saved photo once there is no upload this visit', () => {
    live = true
    setup(withViews)
    const front = screen.getByTestId('photo-slot-front')
    expect(front.dataset.filled).toBe('true')
    expect(within(front).getByTestId('photo-slot-image').querySelector('img')?.getAttribute('src')).toBe(VIEW1)
  })
})

describe('ProductImagesCard photo QA warnings (SI14)', () => {
  const REPORT = '/images/{image_id}/report'
  const reportFor = (qa: boolean) => ({
    image_id: I1,
    compliance_status: 'passed' as const,
    reports: {
      amazon: {
        image_id: I1,
        marketplace: 'amazon' as const,
        slot: 'main' as const,
        pass: true,
        processed_at: '2026-11-09T10:00:00Z',
        checks: [
          { check: 'format' as const, method: 'deterministic' as const, passed: true },
          ...(qa
            ? [
                { check: 'text_overlay' as const, method: 'deterministic' as const, passed: false },
                { check: 'fill_ratio' as const, method: 'deterministic' as const, passed: false },
              ]
            : []),
        ],
        issues: qa ? [{ code: 'FILL_RATIO_LOW' as const, check: 'fill_ratio' as const, suggestion: 'Zoom or crop so the product fills the frame' }] : [],
      },
      flipkart: null,
    },
  })
  const single = { ...product, colourways: [], images: [`${T}/${P}/images/${I1}`], image_details: [product.image_details[0]!] }

  beforeEach(() => {
    live = true
  })

  it('shows calm chips on the row and the Front tile while photo QA reports warnings, and still says Checked', async () => {
    answers.set(REPORT, () => ok(reportFor(true)))
    setup(single)
    const chips = await screen.findAllByTestId('photo-qa')
    expect(chips.length).toBe(2)
    for (const c of chips) expect(within(c).getAllByRole('listitem').map((li) => li.dataset.check)).toEqual(['text_overlay', 'fill_ratio'])
    expect(within(screen.getByTestId('photo-slot-front')).getByText('Checked')).toBeTruthy()
    expect(within(screen.getByTestId('photo-slot-front')).getByText('Low fill')).toBeTruthy()
    // A warning, never a block: no alert role on the chips.
    expect(within(chips[0]!).queryByRole('alert')).toBeNull()
  })

  it('shows nothing new while photo QA is off', async () => {
    answers.set(REPORT, () => ok(reportFor(false)))
    setup(single)
    await waitFor(() => expect(screen.getByTestId('image-row').dataset.compliance).toBe('passed'))
    expect(screen.queryByTestId('photo-qa')).toBeNull()
  })
})

describe('ProductImagesCard photo checklist (feedback 7)', () => {
  beforeEach(() => {
    live = true
  })
  const view = (v: string, requirement: 'required' | 'recommended' | 'optional', status: 'present' | 'missing' | 'invalid', extra: Record<string, unknown> = {}) => ({
    view: v,
    label: { front: 'Front', back: 'Back', close_up: 'Close-up', size_chart: 'Size chart', lifestyle: 'Lifestyle' }[v]!,
    slot: ({ front: 'main', back: 'secondary', close_up: 'secondary', size_chart: 'size_chart', lifestyle: 'lifestyle' } as Record<string, string>)[v]!,
    role: v === 'back' || v === 'close_up' ? v : null,
    requirement,
    why: `Why ${v}`,
    amazon: requirement,
    flipkart: requirement,
    status,
    image_ids: [],
    ...extra,
  })
  const lamp = {
    ...product,
    colourways: [],
    photo_views: [view('front', 'required', 'present'), view('close_up', 'recommended', 'missing'), view('lifestyle', 'recommended', 'missing'), view('back', 'optional', 'missing')],
  } as unknown as Parameters<typeof ProductImagesCard>[0]['product']

  it('draws only the views the category has, each with its level', () => {
    setup(lamp)
    expect(screen.getAllByTestId(/^photo-slot-(front|back|close_up|size_chart)$/).map((t) => t.dataset.testid)).toEqual([
      'photo-slot-front',
      'photo-slot-close_up',
      'photo-slot-back',
    ])
    expect(within(screen.getByTestId('photo-slot-close_up')).getByTestId('photo-slot-level').textContent).toBe('Recommended')
    expect(within(screen.getByTestId('photo-slot-back')).getByTestId('photo-slot-level').textContent).toBe('Optional')
    expect(screen.queryByTestId('photo-slots-recommended')).toBeNull()
    expect(screen.getByTestId('photo-recommended').textContent).toBe('Recommended: Close-up, Lifestyle.')
    expect(screen.queryByTestId('photo-needed')).toBeNull()
    expect(screen.getByText('Lifestyle recommended (not added yet). Other photos optional.')).toBeTruthy()
  })

  it('says what approval needs, and a saved chart meets the size chart', () => {
    const kurta = {
      ...product,
      colourways: [],
      image_details: [],
      images: [],
      photo_views: [view('front', 'required', 'missing'), view('back', 'recommended', 'missing'), view('size_chart', 'required', 'missing')],
      size_chart_check: { required: true, saved: false, missing_sizes: [], unused_sizes: [] },
    } as unknown as Parameters<typeof ProductImagesCard>[0]['product']
    setup(kurta)
    expect(screen.getByTestId('photo-needed').textContent).toContain('Needed before approval: Front, Size chart.')
    expect(within(screen.getByTestId('photo-slot-size_chart')).getByTestId('photo-slot-required')).toBeTruthy()
    cleanup()
    setup({ ...kurta, size_chart: { rows: [{ size: 'M' }] }, size_chart_check: { required: true, saved: true, missing_sizes: [], unused_sizes: [] } } as typeof kurta)
    expect(within(screen.getByTestId('photo-slot-size_chart')).queryByTestId('photo-slot-required')).toBeNull()
    expect(within(screen.getByTestId('photo-slot-size_chart')).getByText('Chart saved')).toBeTruthy()
    expect(screen.getByTestId('photo-needed').textContent).toContain('Needed before approval: Front.')
  })
})
