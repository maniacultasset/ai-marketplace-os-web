import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'

const post = vi.fn()
vi.mock('@/api/client', async (orig) => ({ ...(await orig<typeof import('@/api/client')>()), api: { POST: (...a: unknown[]) => post(...a) } }))
const fetchProduct = vi.fn()
vi.mock('./api', async (orig) => ({ ...(await orig<typeof import('./api')>()), fetchProduct: (...a: unknown[]) => fetchProduct(...a) }))
let paused = false
vi.mock('@/features/ai-credit/use-ai-paused', () => ({ useAiPaused: () => paused }))
const markAiPaused = vi.fn()
vi.mock('@/features/ai-credit/model', async (orig) => ({ ...(await orig<typeof import('@/features/ai-credit/model')>()), markAiPaused: () => markAiPaused() }))
vi.mock('@/lib/auth', async (orig) => ({ ...(await orig<typeof import('@/lib/auth')>()), useSession: () => ({ tenantId: 't1' }) }))

const { SizeChartReadButton } = await import('./size-chart-read-button')
const { outcomeOf } = await import('./size-chart-read')

const IMG = '55555555-5555-4555-8555-555555555555'
const CHART = { unit: 'cm' as const, basis: 'garment' as const, rows: [{ size: 'M', chest: 102 }, { size: 'L', chest: 108 }] }
const product = {
  id: 'p1',
  sku: 'S',
  title: 'T',
  category: 'tshirts',
  status: 'active' as const,
  created_at: 'x',
  updated_at: 'x',
  brand_name_inherited: false,
  identifier_exemption: false,
  attribute_literals: {},
  image_details: [{ image_id: IMG, slot: 'size_chart' as const, position: 0, status: 'ready', origin: 'seller' as const, compliance_status: 'passed' as const }],
}

const answer = (body: unknown, status: number) => Promise.resolve({ data: status < 400 ? body : undefined, error: status >= 400 ? body : undefined, response: new Response(JSON.stringify(body), { status }) })
const refusal = (status: number, type: string) => answer({ error: { type, message: 'm', status, correlation_id: 'r', details: null, error_report: null } }, status)

function setup(p = product) {
  const onRead = vi.fn()
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        <SizeChartReadButton product={p} onRead={onRead} loaded={false} />
      </TooltipProvider>
    </QueryClientProvider>,
  )
  return { onRead }
}

beforeEach(() => {
  paused = false
  post.mockReset()
  fetchProduct.mockReset()
  markAiPaused.mockReset()
})
afterEach(cleanup)

describe('Read sizes from your size chart photo (SI12)', () => {
  it('starts the read, follows the product until it is read, and hands the rows to the editor', async () => {
    post.mockReturnValue(answer({ image_id: IMG, job_id: 'j1', status: 'queued' }, 202))
    fetchProduct
      .mockResolvedValueOnce({ ...product, size_chart_suggestion: { image_id: IMG, status: 'reading' } })
      .mockResolvedValue({ ...product, size_chart_suggestion: { image_id: IMG, status: 'read', chart: CHART, confidence: 0.9 } })
    const { onRead } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Read sizes from your size chart photo' }))
    expect(post.mock.calls[0]![0]).toBe('/products/{product_id}/size-chart-read')
    expect(post.mock.calls[0]![1].params.header['Idempotency-Key']).toBeTruthy()
    await waitFor(() => expect(onRead).toHaveBeenCalledWith(CHART, IMG), { timeout: 4000 })
  })

  it('says so when the photo could not be read, and loads nothing', async () => {
    post.mockReturnValue(answer({ image_id: IMG, status: 'unreadable' }, 200))
    fetchProduct.mockResolvedValue({ ...product, size_chart_suggestion: { image_id: IMG, status: 'unreadable' } })
    const { onRead } = setup()
    await userEvent.click(screen.getByTestId('size-chart-read-start'))
    expect(await screen.findByText(/could not be read/)).toBeTruthy()
    expect(onRead).not.toHaveBeenCalled()
  })

  it('marks AI as paused on a 503 and says the work is saved', async () => {
    post.mockReturnValue(refusal(503, 'AI_CREDIT_EXHAUSTED'))
    setup()
    await userEvent.click(screen.getByTestId('size-chart-read-start'))
    expect(await screen.findByText('AI drafting is paused. Your work is saved.')).toBeTruthy()
    expect(markAiPaused).toHaveBeenCalled()
    expect(fetchProduct).not.toHaveBeenCalled()
  })

  it('is off while AI is paused, with the reason', () => {
    paused = true
    setup()
    const button = screen.getByRole('button', { name: /Read sizes/ })
    expect(button.getAttribute('aria-disabled')).toBe('true')
    expect(screen.queryByTestId('size-chart-read-start')).toBeNull()
  })

  it('asks for a size chart photo when there is none', () => {
    setup({ ...product, image_details: [] })
    expect(screen.getByTestId('size-chart-read-none').textContent).toContain('Add a size chart photo')
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('only counts a finished read of the same photo', () => {
    expect(outcomeOf({ image_id: IMG, status: 'reading' }, IMG)).toBeNull()
    expect(outcomeOf({ image_id: 'other', status: 'read', chart: CHART }, IMG)).toBeNull()
    expect(outcomeOf({ image_id: IMG, status: 'read', chart: CHART }, IMG)).toEqual({ kind: 'read', rows: 2 })
    expect(outcomeOf({ image_id: IMG, status: 'read', chart: null }, IMG)).toEqual({ kind: 'unreadable' })
    expect(outcomeOf({ image_id: IMG, status: 'unavailable' }, IMG)).toEqual({ kind: 'failed' })
  })
})
