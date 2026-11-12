import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const post = vi.fn()
const get = vi.fn()
vi.mock('@/api/client', async (orig) => ({
  ...(await orig<typeof import('@/api/client')>()),
  api: { POST: (...a: unknown[]) => post(...a), GET: (...a: unknown[]) => get(...a) },
}))
vi.mock('@/lib/auth', async (orig) => ({ ...(await orig<typeof import('@/lib/auth')>()), useSession: () => ({ tenantId: 't1' }) }))
vi.mock('@/lib/permissions', async (orig) => ({ ...(await orig<typeof import('@/lib/permissions')>()), useCan: () => () => true }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...rest }: { to: string; children: ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}))

const { SkuField } = await import('./sku-field')
const { SKU_HINT } = await import('./sku-check')

const answer = (body: unknown, status = 200) =>
  Promise.resolve({ data: status < 400 ? body : undefined, error: status >= 400 ? body : undefined, response: new Response(JSON.stringify(body), { status }) })

function Harness({ initial = '' }: { initial?: string }) {
  const [sku, setSku] = useState(initial)
  return <SkuField id="g-sku" value={sku} onChange={setSku} category="ethnic_wear_kurta_sets" brandName="Acme" />
}

function setup(initial = '') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <Harness initial={initial} />
    </QueryClientProvider>,
  )
}

const state = () => screen.getByTestId('sku-check').getAttribute('data-state')
const input = () => screen.getByRole('textbox', { name: /SKU/ }) as HTMLInputElement

beforeEach(() => {
  post.mockReset()
  get.mockReset()
  vi.useFakeTimers({ shouldAdvanceTime: true })
})
afterEach(() => {
  vi.useRealTimers()
  cleanup()
})

describe('SkuField (client feedback 11 Nov)', () => {
  it('says which ID goes to the marketplaces', () => {
    setup()
    expect(screen.getByText(new RegExp(SKU_HINT.replace('.', '\\.')))).toBeTruthy()
    expect(state()).toBe('idle')
  })

  it('checks only once typing pauses, then says free', async () => {
    get.mockImplementation((_p: string, init: { params: { query: { sku: string } } }) => answer({ sku: init.params.query.sku, available: true }))
    setup()
    fireEvent.change(input(), { target: { value: 'K' } })
    fireEvent.change(input(), { target: { value: 'KS' } })
    fireEvent.change(input(), { target: { value: 'KS-1' } })
    expect(state()).toBe('checking')
    expect(get).not.toHaveBeenCalled()
    await act(async () => {
      vi.advanceTimersByTime(500)
    })
    await waitFor(() => expect(state()).toBe('free'))
    expect(get).toHaveBeenCalledTimes(1)
    expect(get.mock.calls[0]![1]).toEqual({ params: { query: { sku: 'KS-1' } } })
  })

  it('flags a taken SKU with a clear message and a link to its product', async () => {
    get.mockReturnValue(answer({ sku: 'KS-1', available: false, product_id: 'p9', title: 'Kurta set', is_variant: false, deleted: false }))
    setup('KS-1')
    await act(async () => {
      vi.advanceTimersByTime(500)
    })
    await waitFor(() => expect(state()).toBe('taken'))
    expect(screen.getByText('KS-1 is already used by “Kurta set”. Use another, or let Kuinn make one.')).toBeTruthy()
    expect(screen.getByText('Open the product that uses it').getAttribute('href')).toBe('/products/$productId')
  })

  it('never checks a SKU with a space, and says when the check fails', async () => {
    get.mockReturnValue(answer({ error: { type: 'INTERNAL_ERROR', message: 'm', status: 500, correlation_id: 'r', details: null, error_report: null } }, 500))
    setup('KS 1')
    await act(async () => {
      vi.advanceTimersByTime(500)
    })
    expect(state()).toBe('invalid')
    expect(get).not.toHaveBeenCalled()
    fireEvent.change(input(), { target: { value: 'KS-2' } })
    await act(async () => {
      vi.advanceTimersByTime(500)
    })
    await waitFor(() => expect(state()).toBe('unknown'))
  })

  it('makes a SKU on request, with the category and brand', async () => {
    post.mockReturnValue(answer({ sku: 'ACME-KUR-0007' }))
    get.mockImplementation((_p: string, init: { params: { query: { sku: string } } }) => answer({ sku: init.params.query.sku, available: true }))
    setup()
    fireEvent.click(screen.getByTestId('sku-make'))
    await waitFor(() => expect(input().value).toBe('ACME-KUR-0007'))
    const [path, init] = post.mock.calls[0] as [string, { body: unknown; params: { header: Record<string, string> } }]
    expect(path).toBe('/skus/suggestion')
    expect(init.body).toEqual({ category: 'ethnic_wear_kurta_sets', brand_name: 'Acme' })
    expect(init.params.header['Idempotency-Key']).toBeTruthy()
    await waitFor(() => expect(state()).toBe('free'))
  })
})
