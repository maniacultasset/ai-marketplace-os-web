import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PhotoLink } from './photo-links'

const post = vi.fn()
const del = vi.fn()
vi.mock('@/api/client', async (orig) => ({
  ...(await orig<typeof import('@/api/client')>()),
  api: { POST: (...a: unknown[]) => post(...a), DELETE: (...a: unknown[]) => del(...a), GET: () => new Promise(() => {}) },
}))
vi.mock('@/lib/auth', async (orig) => ({ ...(await orig<typeof import('@/lib/auth')>()), useSession: () => ({ tenantId: 't1' }) }))
const toast = { success: vi.fn(), info: vi.fn(), error: vi.fn() }
const toastError = vi.fn()
vi.mock('@/lib/toast', () => ({ toast, toastError: (...a: unknown[]) => toastError(...a) }))

const { PhotoLinksPanel } = await import('./photo-links-panel')
const { keysFor } = await import('@/lib/query-keys')
const KEYS = keysFor('t1')

const P = '22222222-2222-4222-8222-222222222222'
const ok = (body: unknown, status = 200) => Promise.resolve({ data: body, error: undefined, response: new Response(status === 204 ? null : JSON.stringify(body), { status }) })
const refuse = (status: number, type: string) => {
  const error = { error: { type, message: 'm', status, correlation_id: 'req-1', details: null, error_report: null } }
  return Promise.resolve({ data: undefined, error, response: new Response(JSON.stringify(error), { status }) })
}
let n = 0
const link = (over: Partial<PhotoLink>): PhotoLink => ({
  link_id: `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
  position: 1,
  column: 'main_image',
  status: 'queued',
  retryable: false,
  ...over,
})
const failed404 = () =>
  link({ position: 2, column: 'additional_images', status: 'failed', retryable: true, problem: 'not_found', http_status: 404, message: 'The link returned 404. Check the link is right and public.' })

function setup(links: PhotoLink[], canAct = true) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const invalidate = vi.spyOn(qc, 'invalidateQueries')
  render(
    <QueryClientProvider client={qc}>
      <PhotoLinksPanel productId={P} links={links} canAct={canAct} />
    </QueryClientProvider>,
  )
  return { invalidate }
}

beforeEach(() => {
  post.mockReset()
  del.mockReset()
  toastError.mockReset()
  Object.values(toast).forEach((f) => f.mockReset())
})
afterEach(cleanup)

describe('PhotoLinksPanel (G2)', () => {
  it('shows nothing when every link was saved', () => {
    setup([link({ status: 'saved', view: 'front', image_id: 'i1' })])
    expect(screen.queryByTestId('photo-links')).toBeNull()
  })

  it('says how many photos still download', () => {
    setup([link({ status: 'queued' }), link({ status: 'downloading', position: 2 }), link({ status: 'saved', position: 3 })])
    expect(screen.getByTestId('photo-links-pending').textContent).toBe('Downloading 2 photos from your file…')
    expect(screen.queryByTestId('photo-links-retry')).toBeNull()
  })

  it('lists each failed link in the server’s words with Dismiss, and Retry when one can be retried', () => {
    setup([failed404(), link({ position: 3, status: 'skipped', problem: 'removed_by_seller', message: 'You removed this photo earlier, so it was not downloaded again.' })])
    const rows = screen.getAllByTestId('photo-link-problem')
    expect(rows.map((r) => r.textContent?.replace('Dismiss', ''))).toEqual([
      'Photo 2: The link returned 404. Check the link is right and public.',
      'Photo 3: You removed this photo earlier, so it was not downloaded again.',
    ])
    expect(screen.getByTestId('photo-links').textContent).not.toMatch(/not_found|removed_by_seller/)
    expect(screen.getByTestId('photo-links-retry')).toBeTruthy()
  })

  it('offers no Retry when no link can be retried, and no actions to a role that cannot import', () => {
    setup([link({ status: 'skipped', problem: 'removed_by_seller', message: 'You removed this photo earlier, so it was not downloaded again.' })])
    expect(screen.queryByTestId('photo-links-retry')).toBeNull()
    cleanup()
    setup([failed404()], false)
    expect(screen.queryByTestId('photo-links-retry')).toBeNull()
    expect(screen.queryByTestId('photo-link-dismiss')).toBeNull()
  })

  it('retries the product’s links with an Idempotency-Key and reads the product again', async () => {
    post.mockReturnValue(ok({ job_id: 'j1', status: 'queued', poll_url: '/api/v1/jobs/j1' }, 202))
    const { invalidate } = setup([failed404()])
    await userEvent.click(screen.getByTestId('photo-links-retry'))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Downloading the photos again', expect.anything()))
    const [path, init] = post.mock.calls[0] as [string, { params: { path: { product_id: string }; header: Record<string, string> } }]
    expect(path).toBe('/products/{product_id}/photo-links/retry')
    expect(init.params.path.product_id).toBe(P)
    expect(init.params.header['Idempotency-Key']).toMatch(/^[\x21-\x7E]{1,255}$/)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: KEYS.products.detail(P) })
  })

  it('says there is nothing to retry on a 409, and hides Retry on a 501 (the switch was turned off)', async () => {
    post.mockReturnValueOnce(refuse(409, 'INVALID_STATUS_TRANSITION'))
    setup([failed404()])
    await userEvent.click(screen.getByTestId('photo-links-retry'))
    await waitFor(() => expect(toast.info).toHaveBeenCalledWith('No failed photos to retry'))
    expect(toastError).not.toHaveBeenCalled()
    post.mockReturnValueOnce(refuse(501, 'NOT_IMPLEMENTED'))
    await userEvent.click(screen.getByTestId('photo-links-retry'))
    await waitFor(() => expect(screen.queryByTestId('photo-links-retry')).toBeNull())
    expect(toastError).not.toHaveBeenCalled()
  })

  it('dismisses one link', async () => {
    del.mockReturnValue(ok(undefined, 204))
    const l = failed404()
    const { invalidate } = setup([l])
    await userEvent.click(within(screen.getByTestId('photo-link-problem')).getByRole('button', { name: 'Dismiss photo 2' }))
    await waitFor(() => expect(del).toHaveBeenCalledWith('/photo-links/{link_id}', { params: { path: { link_id: l.link_id } } }))
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: KEYS.products.detail(P) }))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: KEYS.imports.all() })
  })
})
