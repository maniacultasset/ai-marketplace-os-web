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
const patch = vi.fn()
vi.mock('@/api/client', async (orig) => ({
  ...(await orig<typeof import('@/api/client')>()),
  api: {
    GET: (path: string, ...rest: unknown[]) => get(path, ...rest),
    POST: (...a: unknown[]) => post(...a),
    PATCH: (...a: unknown[]) => patch(...a),
  },
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
  patch.mockReset()
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

  it('gives each colour its own upload tiles, filed under that colour', async () => {
    const user = userEvent.setup()
    setup()
    const groups = screen.getAllByTestId('colour-group')
    expect(groups.map((g) => within(g).queryAllByTestId('photo-slot-front').length)).toEqual([1, 1, 1])
    await user.upload(within(groups[2]!).getByLabelText('Back photo file'), file())
    await waitFor(() => expect(uploadImage).toHaveBeenCalled())
    expect(uploadImage.mock.calls[0]![0]).toMatchObject({ productId: P, slot: 'secondary', role: 'back', colourwayId: WHITE })
    await user.upload(within(groups[0]!).getByLabelText('Front photo file'), file())
    await waitFor(() => expect(uploadImage).toHaveBeenCalledTimes(2))
    expect(uploadImage.mock.calls[1]![0]).toMatchObject({ slot: 'main', colourwayId: null })
  })

  it('shows each colour its own Front photo and an empty Front where it has none', () => {
    live = true
    setup()
    const [all, black, white] = screen.getAllByTestId('colour-group')
    expect(within(all!).getByTestId('photo-slot-front').dataset.filled).toBe('true')
    expect(within(black!).getByTestId('photo-slot-front').dataset.filled).toBe('true')
    expect(within(white!).getByTestId('photo-slot-front').dataset.filled).not.toBe('true')
  })

  it('keeps the size chart with all colours, never under a colour', async () => {
    const user = userEvent.setup()
    setup()
    const groups = screen.getAllByTestId('colour-group')
    expect(groups.map((g) => within(g).queryAllByTestId('photo-slot-size_chart').length)).toEqual([1, 0, 0])
    await user.upload(within(groups[0]!).getByLabelText('Size chart photo file'), file())
    await waitFor(() => expect(uploadImage).toHaveBeenCalled())
    expect(uploadImage.mock.calls[0]![0]).toMatchObject({ slot: 'size_chart', colourwayId: null })
  })

  it('files More photos under the colour picked there', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(screen.getByTestId('more-photos-toggle'))
    await user.click(screen.getByTestId('image-colour'))
    await user.click(await screen.findByRole('option', { name: 'White' }))
    await user.upload(screen.getByLabelText('Image files'), [file()])
    await waitFor(() => expect(uploadImage).toHaveBeenCalled())
    expect(uploadImage.mock.calls[0]![0]).toMatchObject({ slot: 'secondary', role: null, colourwayId: WHITE })
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

  it('names the colour select by its visible word', async () => {
    setup()
    await userEvent.click(screen.getByTestId('more-photos-toggle'))
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

describe('ProductImagesCard colour check (client feedback item 9)', () => {
  const KEEP = '/images/{image_id}/photo-match/keep'
  const match = (status: 'checking' | 'match' | 'mismatch' | 'unsure' | 'failed', extra: Record<string, unknown> = {}) => ({
    status,
    colour: 'Black',
    product_match: 0.93,
    colour_match: status === 'mismatch' ? 0.05 : 0.9,
    seen_colour: status === 'mismatch' ? 'red' : 'black',
    reason: status === 'mismatch' ? 'The photo shows a red kurta.' : null,
    question: status === 'mismatch' || status === 'unsure' ? 'Is this photo the Black Cotton Kurta?' : null,
    checked_at: '2026-11-11T10:00:00Z',
    kept: false,
    kept_at: null,
    kept_by_user_id: null,
    ...extra,
  })
  const withMatch = (m: ReturnType<typeof match> | null) => ({
    ...product,
    image_details: [product.image_details[0]!, { ...product.image_details[1]!, photo_match: m }],
  })
  const blackRow = () => within(screen.getAllByTestId('colour-group')[1]!).getByTestId('image-row')

  beforeEach(() => {
    live = true
  })

  it('says a matched photo shows its colour, quietly', () => {
    setup(withMatch(match('match')))
    const note = within(blackRow()).getByTestId('photo-match')
    expect(note.textContent).toBe('Shows Black')
    expect(within(note).queryByRole('button')).toBeNull()
    expect(screen.queryByTestId('colour-questions')).toBeNull()
  })

  it('says the check is running while it runs', () => {
    setup(withMatch(match('checking')))
    expect(within(blackRow()).getByRole('status').textContent).toContain('Checking it shows Black')
    const front = within(screen.getAllByTestId('colour-group')[1]!).getByTestId('photo-slot-front')
    expect(within(front).getByText('Checking colour…')).toBeTruthy()
  })

  it('asks about a mismatch on the row, the tile and the colour heading, and keeps it on request', async () => {
    post.mockReturnValue(ok({ image_id: I2, photo_match: match('mismatch', { kept: true, kept_at: '2026-11-11T10:01:00Z' }) }))
    setup(withMatch(match('mismatch')))
    const black = screen.getAllByTestId('colour-group')[1]!
    expect(within(black).getByTestId('colour-questions').textContent).toBe('1 to check')
    expect(within(within(black).getByTestId('photo-slot-front')).getByText('Check this photo below')).toBeTruthy()
    const note = within(blackRow()).getByTestId('photo-match')
    expect(within(note).getByTestId('photo-match-question').textContent).toBe('Is this photo the Black Cotton Kurta?')
    expect(note.textContent).toContain('It looks red.')
    expect(note.textContent).toContain('Approval waits until you keep or remove it.')
    await userEvent.click(within(note).getByTestId('photo-match-keep'))
    await waitFor(() => expect(post).toHaveBeenCalled())
    const [path, init] = post.mock.calls[0] as [string, { params: { path: { image_id: string }; header: Record<string, string> } }]
    expect(path).toBe(KEEP)
    expect(init.params.path.image_id).toBe(I2)
    expect(init.params.header['Idempotency-Key']).toBeTruthy()
  })

  it('says an unsure photo does not stop approval', () => {
    setup(withMatch(match('unsure')))
    expect(within(blackRow()).getByTestId('photo-match').textContent).toContain('You can still approve.')
  })

  it('offers Remove, which asks before deleting', async () => {
    setup(withMatch(match('mismatch')))
    await userEvent.click(within(blackRow()).getByTestId('photo-match-remove'))
    expect(within(blackRow()).getByTestId('image-delete-confirm')).toBeTruthy()
  })

  it('says a kept photo was kept, and a photo it could not read was not checked', () => {
    setup(withMatch(match('mismatch', { kept: true, kept_at: '2026-11-11T10:01:00Z' })))
    expect(within(blackRow()).getByTestId('photo-match').textContent).toBe('You kept this photo')
    cleanup()
    setup(withMatch(match('failed')))
    expect(within(blackRow()).getByTestId('photo-match').textContent).toBe('Not checked for colour')
  })

  it('shows nothing while the check is off', () => {
    setup(withMatch(null))
    expect(screen.queryByTestId('photo-match')).toBeNull()
  })
})

describe('ProductImagesCard change view (feedback 7)', () => {
  const EXTRA = '33333333-3333-4333-8333-333333333333'
  const BACK = '33333333-3333-4333-8333-333333333334'
  const flat = {
    id: P,
    images: [`${T}/${P}/images/${I1}`, `${T}/${P}/images/${EXTRA}`, `${T}/${P}/images/${BACK}`],
    image_details: [
      { image_id: I1, slot: 'main' as const, position: 0, status: 'ready', origin: 'seller' as const, compliance_status: 'passed' as const },
      { image_id: EXTRA, slot: 'secondary' as const, position: 0, status: 'ready', origin: 'seller' as const, compliance_status: 'passed' as const },
      { image_id: BACK, slot: 'secondary' as const, role: 'back' as const, position: 1, status: 'ready', origin: 'seller' as const, compliance_status: 'passed' as const },
    ],
    colourways: [],
  }
  const row = (id: string) => document.querySelector<HTMLElement>(`[data-testid="image-row"][data-image-id="${id}"]`)!
  beforeEach(() => {
    live = true
  })

  it('marks a More photos extra as the Close-up from its row, with no new upload', async () => {
    patch.mockReturnValue(ok({ image_id: EXTRA, slot: 'secondary', role: 'close_up', compliance_status: 'passed', job_id: null, swapped: null }))
    setup(flat)
    const trigger = within(row(EXTRA)).getByRole('button', { name: 'Change view of the secondary photo' })
    await userEvent.click(trigger)
    const items = screen.getAllByRole('menuitemradio')
    expect(items.map((i) => i.textContent?.replace('Swaps with the photo there now', ''))).toEqual([
      'Front',
      'Back',
      'Close-up',
      'Size chart',
      'Other angle',
      'Lifestyle',
      'Packaging label',
    ])
    expect(screen.getByRole('menuitemradio', { name: 'Other angle' }).getAttribute('aria-checked')).toBe('true')
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Close-up' }))
    await waitFor(() => expect(patch).toHaveBeenCalled())
    expect(patch.mock.calls[0]).toEqual(['/images/{image_id}', { params: { path: { image_id: EXTRA } }, body: { slot: 'secondary', role: 'close_up' } }])
    expect(uploadImage).not.toHaveBeenCalled()
  })

  it('says a taken Back swaps, and works from the keyboard', async () => {
    patch.mockReturnValue(
      ok({
        image_id: EXTRA,
        slot: 'secondary',
        role: 'back',
        compliance_status: 'passed',
        job_id: null,
        swapped: { image_id: BACK, slot: 'secondary', role: null, compliance_status: 'passed', job_id: null },
      }),
    )
    setup(flat)
    const trigger = within(row(EXTRA)).getByRole('button', { name: 'Change view of the secondary photo' })
    trigger.focus()
    await userEvent.keyboard('{Enter}')
    const back = await screen.findByRole('menuitemradio', { name: /^Back/ })
    expect(back.textContent).toContain('Swaps with the photo there now')
    // Front is taken too; the size chart and the More photos kinds hold many photos.
    expect(screen.getByRole('menuitemradio', { name: /^Front/ }).textContent).toContain('Swaps')
    expect(screen.getByRole('menuitemradio', { name: 'Lifestyle' }).textContent).not.toContain('Swaps')
    await waitFor(() => expect(document.activeElement?.getAttribute('role')).toBe('menuitemradio'))
    await userEvent.keyboard('{ArrowDown}')
    expect(document.activeElement?.textContent).toMatch(/^Back/)
    await userEvent.keyboard('{Enter}')
    await waitFor(() => expect(patch).toHaveBeenCalled())
    expect(patch.mock.calls[0]![1]).toMatchObject({ body: { slot: 'secondary', role: 'back' } })
  })

  it('puts the menu on a filled tile, and offers no size chart on a variant', async () => {
    setup({ ...flat, parent_product_id: P })
    const front = screen.getByTestId('photo-slot-front')
    await userEvent.click(within(front).getByRole('button', { name: 'Change view of the front photo' }))
    const labels = screen.getAllByRole('menuitemradio').map((i) => i.textContent)
    expect(labels).not.toContain('Size chart')
    expect(screen.getByRole('menuitemradio', { name: 'Front' }).getAttribute('aria-checked')).toBe('true')
  })

  it('shows no menu to someone who may not move photos', () => {
    live = false
    setup(flat)
    expect(screen.queryByTestId('change-view')).toBeNull()
  })
})
