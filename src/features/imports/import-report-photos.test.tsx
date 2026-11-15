import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}))
const get = vi.fn()
const post = vi.fn()
vi.mock('@/api/client', async (orig) => ({
  ...(await orig<typeof import('@/api/client')>()),
  api: { GET: (...a: unknown[]) => get(...a), POST: (...a: unknown[]) => post(...a) },
}))
vi.mock('@/lib/auth', async (orig) => ({ ...(await orig<typeof import('@/lib/auth')>()), useSession: () => ({ tenantId: 't1' }) }))
const toast = { success: vi.fn(), info: vi.fn(), error: vi.fn() }
const toastError = vi.fn()
vi.mock('@/lib/toast', () => ({ toast, toastError: (...a: unknown[]) => toastError(...a) }))

const { ImportPhotosLine, useImportReport } = await import('./import-report')
const { keysFor } = await import('@/lib/query-keys')

const IMP = '55555555-5555-4555-8555-555555555555'
const ok = (body: unknown, status = 200) => Promise.resolve({ data: body, error: undefined, response: new Response(JSON.stringify(body), { status }) })
const refuse = (status: number, type: string) => {
  const error = { error: { type, message: 'm', status, correlation_id: 'req-1', details: null, error_report: null } }
  return Promise.resolve({ data: undefined, error, response: new Response(JSON.stringify(error), { status }) })
}

function wrap(node: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const invalidate = vi.spyOn(qc, 'invalidateQueries')
  render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>)
  return { invalidate }
}

beforeEach(() => {
  get.mockReset()
  post.mockReset()
  toastError.mockReset()
  Object.values(toast).forEach((f) => f.mockReset())
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('ImportPhotosLine (G2)', () => {
  it('sums up the file’s photos and offers Retry only when some failed', () => {
    wrap(<ImportPhotosLine importId={IMP} totals={{ total: 50, saved: 40, failed: 2, waiting: 8 }} canRetry />)
    expect(screen.getByTestId('import-photos-text').textContent).toBe('40 saved · 2 failed · 8 downloading')
    expect(screen.getByTestId('retry-photos')).toBeTruthy()
    cleanup()
    wrap(<ImportPhotosLine importId={IMP} totals={{ total: 3, saved: 3, failed: 0, waiting: 0 }} canRetry />)
    expect(screen.queryByTestId('retry-photos')).toBeNull()
    cleanup()
    wrap(<ImportPhotosLine importId={IMP} totals={{ total: 3, saved: 1, failed: 2, waiting: 0 }} canRetry={false} />)
    expect(screen.queryByTestId('retry-photos')).toBeNull()
  })

  it('retries the failed photos with an Idempotency-Key, toasts the count and reads the report again', async () => {
    post.mockReturnValue(ok({ queued: 2, products: 1 }, 202))
    const { invalidate } = wrap(<ImportPhotosLine importId={IMP} totals={{ total: 4, saved: 2, failed: 2, waiting: 0 }} canRetry />)
    await userEvent.click(screen.getByTestId('retry-photos'))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('2 photos downloading again', expect.anything()))
    const [path, init] = post.mock.calls[0] as [string, { params: { path: { import_id: string }; header: Record<string, string> } }]
    expect(path).toBe('/imports/{import_id}/photo-links/retry')
    expect(init.params.path.import_id).toBe(IMP)
    expect(init.params.header['Idempotency-Key']).toBeTruthy()
    expect(invalidate).toHaveBeenCalledWith({ queryKey: keysFor('t1').imports.detail(IMP) })
  })

  it('says there is nothing to retry on a 409, and hides the button on a 501', async () => {
    const onMessage = vi.fn()
    post.mockReturnValueOnce(refuse(409, 'INVALID_STATUS_TRANSITION'))
    wrap(<ImportPhotosLine importId={IMP} totals={{ total: 4, saved: 2, failed: 2, waiting: 0 }} canRetry onMessage={onMessage} />)
    await userEvent.click(screen.getByTestId('retry-photos'))
    await waitFor(() => expect(onMessage).toHaveBeenCalledWith('No failed photos to retry.'))
    post.mockReturnValueOnce(refuse(501, 'NOT_IMPLEMENTED'))
    await userEvent.click(screen.getByTestId('retry-photos'))
    await waitFor(() => expect(screen.queryByTestId('retry-photos')).toBeNull())
    expect(toastError).not.toHaveBeenCalled()
  })
})

function Report() {
  const r = useImportReport(IMP, { final: true })
  return <p data-testid="waiting">{r.data?.photos?.waiting ?? '-'}</p>
}

describe('useImportReport while photos download (G2)', () => {
  it('reads the report every 5 s after the import has settled, until no photo waits', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let waiting = 3
    get.mockImplementation(() => ok({ import_id: IMP, total_rows: 2, imported: 2, failed: 0, schema_version: '2.1.0', photos: { total: 3, saved: 3 - waiting, failed: 0, waiting } }))
    wrap(<Report />)
    await act(() => vi.advanceTimersByTimeAsync(100))
    expect(get).toHaveBeenCalledTimes(1)
    await act(() => vi.advanceTimersByTimeAsync(5_100))
    expect(get).toHaveBeenCalledTimes(2)
    waiting = 0
    await act(() => vi.advanceTimersByTimeAsync(5_100))
    expect(get).toHaveBeenCalledTimes(3)
    await act(() => vi.advanceTimersByTimeAsync(20_000))
    expect(get).toHaveBeenCalledTimes(3)
    expect(screen.getByTestId('waiting').textContent).toBe('0')
  })
})
