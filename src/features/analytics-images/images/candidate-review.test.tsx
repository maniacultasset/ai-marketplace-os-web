import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { Candidate, CandidateKind, FailureReason } from './candidates-model'

const post = vi.fn()
vi.mock('@/api/client', async (orig) => ({
  ...(await orig<typeof import('@/api/client')>()),
  api: { POST: (...a: unknown[]) => post(...a), GET: () => new Promise(() => {}) },
}))
vi.mock('@/lib/auth', async (orig) => ({ ...(await orig<typeof import('@/lib/auth')>()), useSession: () => ({ tenantId: 't1' }) }))

const { CandidateBlock, OriginBadges } = await import('./candidate-review')
const { useCandidateSession } = await import('./candidate-session')
const { FAILURE_COPY } = await import('./candidates-model')

const P = '0b1c2d3e-0000-4000-8000-000000000101'
const MAIN = '0b1c2d3e-0000-4000-8000-000000000201'
const C1 = '0b1c2d3e-0000-4000-8000-000000000301'

const cand = (over: Partial<Candidate> = {}): Candidate => ({
  id: C1,
  kind: 'white_background',
  status: 'ready',
  source_image_id: MAIN,
  preview_url: 'https://storage.test/candidate.png',
  source_preview_url: 'https://storage.test/source.jpg',
  created_at: new Date().toISOString(),
  cost_usd: '0.04',
  ...over,
})

const ok = (body: unknown, status = 202) =>
  Promise.resolve({ data: body, error: undefined, response: new Response(JSON.stringify(body), { status }) })
const refuse = (status: number, type: string, details: unknown[] | null = null) => {
  const error = { error: { type, message: 'm', status, correlation_id: 'req-1', details, error_report: null } }
  return Promise.resolve({ data: undefined, error, response: new Response(JSON.stringify(error), { status }) })
}

function Harness(props: {
  kinds?: CandidateKind[]
  candidates?: Candidate[]
  canAct?: boolean
  aiLimit?: boolean
  sourceId?: string | null
}) {
  const session = useCandidateSession()
  return (
    <CandidateBlock
      productId={P}
      sourceId={props.sourceId === undefined ? MAIN : props.sourceId}
      kinds={props.kinds ?? []}
      candidates={props.candidates ?? []}
      listPending={false}
      session={session}
      canAct={props.canAct ?? true}
      aiLimit={props.aiLimit ?? false}
      onPreviewError={() => {}}
    />
  )
}

function setup(props: Parameters<typeof Harness>[0]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        <Harness {...props} />
      </TooltipProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => post.mockReset())
afterEach(cleanup)

describe('fix buttons', () => {
  it('asks for a white background once per click, with an Idempotency-Key', async () => {
    let settle: (v: unknown) => void = () => {}
    post.mockReturnValueOnce(new Promise((r) => (settle = r)))
    setup({ kinds: ['white_background', 'fix'] })
    expect(screen.getByTestId('hint-white_background').textContent).toMatch(/Uses AI/)
    expect(screen.getByTestId('hint-fix').textContent).toBe('No AI. Free.')
    const btn = screen.getByTestId('make-white_background') as HTMLButtonElement
    fireEvent.click(btn)
    fireEvent.click(btn)
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    const [path, init] = post.mock.calls[0] as [string, { params: { header: Record<string, string> }; body: unknown }]
    expect(path).toBe('/products/{product_id}/image-candidates')
    expect(init.body).toEqual({ kind: 'white_background', source_image_id: MAIN })
    expect(init.params.header['Idempotency-Key']).toMatch(/^[\x21-\x7E]{1,255}$/)
    await waitFor(() => expect(btn.textContent).toContain('Starting…'))
    expect(btn.disabled).toBe(true)
    expect((screen.getByTestId('make-fix') as HTMLButtonElement).disabled).toBe(true)
    settle(await ok({ candidate_id: C1, status: 'queued', job_id: 'j1', poll_url: '/api/v1/jobs/j1' }))
  })

  it('sends no source for a size chart', async () => {
    post.mockReturnValueOnce(ok({ candidate_id: C1, status: 'queued', job_id: 'j1', poll_url: '/api/v1/jobs/j1' }))
    setup({ kinds: ['size_chart'], sourceId: null })
    fireEvent.click(screen.getByTestId('make-size_chart'))
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    expect((post.mock.calls[0] as [string, { body: unknown }])[1].body).toEqual({ kind: 'size_chart' })
  })

  it('is disabled while a candidate of that photo is being made', () => {
    setup({ kinds: ['white_background', 'fix'], candidates: [cand({ status: 'queued', preview_url: null })] })
    expect((screen.getByTestId('make-white_background') as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByTestId('make-fix') as HTMLButtonElement).disabled).toBe(true)
    const review = screen.getByTestId('candidate-review')
    expect(review.dataset.status).toBe('queued')
    expect(review.getAttribute('aria-busy')).toBe('true')
    expect(review.textContent).toContain('Making a white background…')
    expect(screen.queryByTestId('candidate-use')).toBeNull()
  })

  it('holds the AI button with the reason when the daily limit is hit, and never calls', () => {
    setup({ kinds: ['white_background', 'fix'], aiLimit: true })
    const btn = screen.getByTestId('make-white_background')
    expect(btn.getAttribute('aria-disabled')).toBe('true')
    expect(screen.getByTestId('hint-white_background').textContent).toBe('Daily AI image limit reached. Try tomorrow.')
    fireEvent.click(btn)
    expect(post).not.toHaveBeenCalled()
    // The free fix still works.
    expect((screen.getByTestId('make-fix') as HTMLButtonElement).disabled).toBe(false)
  })

  it('turns the AI button off with the reason when the API says editing is switched off', async () => {
    post.mockReturnValueOnce(refuse(422, 'VALIDATION_FAILED', [{ loc: ['body', 'kind'], msg: 'off' }]))
    setup({ kinds: ['white_background'] })
    fireEvent.click(screen.getByTestId('make-white_background'))
    await waitFor(() => expect(screen.getByTestId('make-white_background').getAttribute('aria-disabled')).toBe('true'))
    expect(screen.getByTestId('hint-white_background').textContent).toBe('AI image editing is switched off right now.')
    expect(screen.queryByTestId('candidate-create-error')).toBeNull()
  })

  it('shows plain words and the reference for other refusals', async () => {
    post.mockReturnValueOnce(refuse(422, 'VALIDATION_FAILED', [{ loc: ['body', 'source_image_id'], msg: 'x' }]))
    setup({ kinds: ['fix'] })
    fireEvent.click(screen.getByTestId('make-fix'))
    const err = await screen.findByTestId('candidate-create-error')
    expect(err.textContent).toContain('This photo is still being checked.')
    expect(err.textContent).toContain('req-1')
  })

  it('hides the buttons from people who may not change images', () => {
    setup({ kinds: ['white_background', 'fix'], candidates: [cand()], canAct: false })
    expect(screen.queryByTestId('make-white_background')).toBeNull()
    expect(screen.getByTestId('candidate-review')).toBeTruthy()
    expect(screen.queryByTestId('candidate-use')).toBeNull()
    expect(screen.queryByTestId('candidate-discard')).toBeNull()
  })

  it('renders nothing when there is nothing to offer', () => {
    const { container } = setup({ kinds: [] })
    expect(container.textContent).toBe('')
  })
})

describe('candidate review', () => {
  it('shows the original and the candidate side by side', () => {
    setup({ candidates: [cand()] })
    expect(screen.getByAltText('Original').getAttribute('src')).toBe('https://storage.test/source.jpg')
    expect(screen.getByAltText('AI white background').getAttribute('src')).toBe('https://storage.test/candidate.png')
    expect(screen.getByTestId('candidate-review').textContent).toContain('Your original stays as an extra image.')
  })

  it('shows a size chart on its own', () => {
    setup({ sourceId: null, candidates: [cand({ kind: 'size_chart', source_image_id: null, source_preview_url: null })] })
    expect(screen.queryByAltText('Original')).toBeNull()
    expect(screen.getByAltText('Made from your size chart')).toBeTruthy()
  })

  it('uses the image with one call per click', async () => {
    post.mockReturnValue(ok({ image_id: 'i9', job_id: 'j9', poll_url: '/api/v1/jobs/j9', status: 'queued' }))
    setup({ candidates: [cand()] })
    const use = screen.getByTestId('candidate-use') as HTMLButtonElement
    fireEvent.click(use)
    fireEvent.click(use)
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    const [path, init] = post.mock.calls[0] as [string, { params: { path: { candidate_id: string }; header: Record<string, string> } }]
    expect(path).toBe('/image-candidates/{candidate_id}/accept')
    expect(init.params.path.candidate_id).toBe(C1)
    expect(init.params.header['Idempotency-Key']).toBeTruthy()
  })

  it('discards with one call per click', async () => {
    post.mockReturnValue(ok({ ...cand({ status: 'rejected', preview_url: null, source_preview_url: null }) }, 200))
    setup({ candidates: [cand()] })
    const discard = screen.getByTestId('candidate-discard') as HTMLButtonElement
    fireEvent.click(discard)
    fireEvent.click(discard)
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    expect(post.mock.calls[0]![0]).toBe('/image-candidates/{candidate_id}/reject')
  })

  it('says the photo changed when the use is refused', async () => {
    post.mockReturnValue(refuse(409, 'INVALID_STATUS_TRANSITION'))
    setup({ candidates: [cand()] })
    fireEvent.click(screen.getByTestId('candidate-use'))
    expect((await screen.findByTestId('candidate-decide-error')).textContent).toContain('The photo changed since this was made.')
  })

  it('says a cache hit cost nothing', async () => {
    post.mockReturnValueOnce(ok({ candidate_id: C1, status: 'ready', job_id: null, poll_url: null }))
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const view = (list: Candidate[]) => (
      <QueryClientProvider client={qc}>
        <TooltipProvider>
          <Harness kinds={['fix']} candidates={list} />
        </TooltipProvider>
      </QueryClientProvider>
    )
    const { rerender } = render(view([]))
    fireEvent.click(screen.getByTestId('make-fix'))
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    rerender(view([cand({ kind: 'fix' })]))
    expect((await screen.findByTestId('candidate-review')).textContent).toContain('Made before, so no new cost.')
  })

  it.each(Object.entries(FAILURE_COPY) as [FailureReason, string][])('says %s plainly', (reason, copy) => {
    setup({ kinds: [], candidates: [cand({ status: 'failed', failure_reason: reason, preview_url: null })] })
    const review = screen.getByTestId('candidate-review')
    expect(review.dataset.reason).toBe(reason)
    expect(review.textContent).toContain(copy)
    expect(screen.queryByTestId('candidate-use')).toBeNull()
  })

  it('offers a retry only for a passing model failure, and closes on request', () => {
    setup({ kinds: ['white_background'], candidates: [cand({ status: 'failed', failure_reason: 'model_failed' })] })
    expect(screen.getByTestId('candidate-retry')).toBeTruthy()
    fireEvent.click(screen.getByTestId('candidate-hide'))
    expect(screen.queryByTestId('candidate-review')).toBeNull()
  })
})

describe('origin badges', () => {
  it('shows where an image came from and the kept original', () => {
    render(<OriginBadges label="AI white background" kept />)
    expect(screen.getByTestId('origin-badge').textContent).toContain('AI white background')
    expect(screen.getByTestId('kept-badge').textContent).toBe('Original, kept')
  })
})
