import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/errors'

const post = vi.fn()
vi.mock('@/api/client', async (orig) => ({ ...(await orig<typeof import('@/api/client')>()), api: { POST: (...a: unknown[]) => post(...a) } }))
vi.mock('@/lib/auth', async (orig) => ({ ...(await orig<typeof import('@/lib/auth')>()), useSession: () => ({ tenantId: 't1' }) }))
const success = vi.fn()
vi.mock('sonner', () => ({ toast: { success: (...a: unknown[]) => success(...a) } }))

const { SizeRunAction } = await import('./size-run-action')
const { sizeKey, sizeRunErrorMessage, sizeRunPlan, sizeSku } = await import('./size-run')

const CHART = { unit: 'cm' as const, basis: 'garment' as const, rows: [{ size: 'S', chest: 96 }, { size: 'M', chest: 100 }, { size: 'Free Size', chest: 110 }] }
const product = {
  id: 'p1', sku: 'KORA-01', title: 'Kurta', category: 'kurtas', status: 'active' as const, created_at: 'x', updated_at: 'x',
  brand_name_inherited: false, identifier_exemption: false, attribute_literals: {}, attributes: {},
  size_chart_read_enabled: false, category_suggest_enabled: false, photo_reading: false,
  parent_product_id: null, size_chart: CHART, size_run: [] as string[], variation_theme: null,
}
type P = typeof product

const answer = (body: unknown, status: number) => Promise.resolve({ data: status < 400 ? body : undefined, error: status >= 400 ? body : undefined, response: new Response(JSON.stringify(body), { status }) })
const refusal = (status: number, type: string, loc?: string) =>
  answer({ error: { type, message: 'm', status, correlation_id: 'r', details: loc ? [{ loc, msg: 'x' }] : null, error_report: null } }, status)

function setup(p: Partial<P> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <SizeRunAction product={{ ...product, ...p } as never} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  post.mockReset()
  success.mockReset()
})
afterEach(cleanup)

describe('size run rules (V1.1)', () => {
  it('keys and SKUs follow the family rule', () => {
    expect(sizeKey(' Free  Size ')).toBe('free size')
    expect(sizeSku('KORA-01', 'xl')).toBe('KORA-01-XL')
    expect(sizeSku('KORA-01', 'Free  Size')).toBe('KORA-01-FREE-SIZE')
  })

  it('offers the chart sizes, marks made ones, and says why it is blocked', () => {
    const plan = sizeRunPlan({ ...product, size_run: ['m'], variation_theme: 'size' } as never)
    expect(plan?.options.map((o) => [o.label, o.exists])).toEqual([['S', false], ['M', true], ['Free Size', false]])
    expect(plan?.blocked).toBeNull()
    expect(sizeRunPlan({ ...product, parent_product_id: 'style' } as never)).toBeNull()
    expect(sizeRunPlan({ ...product, size_chart: null } as never)).toBeNull()
    expect(sizeRunPlan({ ...product, variation_theme: 'size_color' } as never)?.blocked).toMatch(/split by colour/)
    expect(sizeRunPlan({ ...product, product_identifier: { type: 'ean', value: '1' } } as never)?.blocked).toMatch(/barcode/)
    expect(sizeRunPlan({ ...product, attributes: { size: 'M' } } as never)?.blocked).toMatch(/own size/)
  })

  it('explains each refusal in plain words', () => {
    const err = (type: string, loc?: string) => new ApiError({ type: type as never, status: 409, message: 'm', details: loc ? [{ loc, msg: 'x' } as never] : [] })
    expect(sizeRunErrorMessage(err('SKU_CONFLICT', 'sizes[0]'))).toMatch(/already used/)
    expect(sizeRunErrorMessage(err('INVALID_STATUS_TRANSITION'))).toMatch(/already on a marketplace/)
    expect(sizeRunErrorMessage(err('LISTING_BUSY'))).toMatch(/being written/)
    expect(sizeRunErrorMessage(err('VARIATION_INVALID', 'product_identifier'))).toMatch(/barcode/)
    expect(sizeRunErrorMessage(err('VALIDATION_FAILED', 'size_chart'))).toMatch(/Save the size chart/)
  })
})

describe('Make size variants (V1.1)', () => {
  it('makes only the ticked sizes after the seller confirms', async () => {
    post.mockReturnValue(answer({ product_id: 'p1', variation_theme: 'size', size_run: ['s'], created: [{ id: 'c1', sku: 'KORA-01-S', size: 'S' }] }, 201))
    setup()
    expect(post).not.toHaveBeenCalled()
    await userEvent.click(screen.getByTestId('size-run-start'))
    expect(screen.getByText('KORA-01-FREE-SIZE')).toBeTruthy()
    await userEvent.click(screen.getByTestId('size-run-pick-m'))
    await userEvent.click(screen.getByTestId('size-run-pick-free-size'))
    await userEvent.click(screen.getByRole('button', { name: 'Make 1 size variant' }))
    expect(post.mock.calls[0]![0]).toBe('/products/{product_id}/size-run')
    expect(post.mock.calls[0]![1].body).toEqual({ sizes: ['S'] })
    expect(post.mock.calls[0]![1].params.header['Idempotency-Key']).toBeTruthy()
    await waitFor(() => expect(success).toHaveBeenCalledWith('Made 1 size variant.'))
    expect(screen.queryByTestId('size-run-panel')).toBeNull()
  })

  it('keeps made sizes ticked and locked, and shows a refusal in the panel', async () => {
    post.mockReturnValue(refusal(409, 'SKU_CONFLICT', 'sizes[0]'))
    setup({ size_run: ['s'], variation_theme: 'size' as never })
    await userEvent.click(screen.getByTestId('size-run-start'))
    expect(screen.getByTestId('size-run-pick-s').hasAttribute('disabled')).toBe(true)
    await userEvent.click(screen.getByRole('button', { name: 'Make 2 size variants' }))
    expect(post.mock.calls[0]![1].body).toEqual({ sizes: ['M', 'Free Size'] })
    expect((await screen.findByTestId('size-run-error')).textContent).toMatch(/already used/)
    expect(screen.getByTestId('size-run-panel')).toBeTruthy()
  })

  it('says every size is made, or why it cannot start', () => {
    setup({ size_run: ['s', 'm', 'free size'], variation_theme: 'size' as never })
    expect(screen.getByTestId('size-run-done')).toBeTruthy()
    cleanup()
    setup({ variation_theme: 'color' as never })
    expect(screen.getByTestId('size-run-blocked').textContent).toMatch(/split by colour/)
    expect(screen.queryByTestId('size-run-start')).toBeNull()
  })
})
