import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { envelope, installFetch, json } from '@/test/fake-api'
import { readStatusHandle, saveStatusHandle } from '@/features/signup-admin/status-handle'
import { useWaitingStatus, waitingCopy } from './waiting'

vi.hoisted(() => {
  vi.stubEnv('VITE_API_ORIGIN', 'http://localhost:3000')
})

const HANDLE = 'H'.repeat(43)
const answer = (status: string, extra: Record<string, unknown> = {}) => () =>
  json(200, { status, brand_name: 'Acme Naturals', requested_at: '2026-11-11T09:00:00Z', decided_at: null, reason: null, ...extra })

function Probe({ handle }: { handle: string | null }) {
  const { view, gone } = useWaitingStatus(handle, null)
  return (
    <p data-testid="probe">
      {gone ? 'gone' : (view?.status ?? 'none')}
      {view?.reason ? ` ${view.reason}` : ''}
    </p>
  )
}

function mount(handle: string | null = HANDLE) {
  const client = new QueryClient()
  render(
    <QueryClientProvider client={client}>
      <Probe handle={handle} />
    </QueryClientProvider>,
  )
}

const polls = (calls: { path: string }[]) => calls.filter((c) => c.path === '/signup/status/poll').length

describe('the waiting status poll', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    focusManager.setFocused(true)
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    focusManager.setFocused(undefined)
    localStorage.clear()
  })

  it('reads every 15 s with the handle in the body only, and stops once approved', async () => {
    const { calls } = installFetch({ 'POST /signup/status/poll': [answer('pending'), answer('pending'), answer('approved')] })
    mount()
    await waitFor(() => expect(screen.getByTestId('probe').textContent).toBe('pending'))
    expect(calls[0]).toMatchObject({ path: '/signup/status/poll', body: { status_handle: HANDLE }, auth: null })
    await act(() => vi.advanceTimersByTimeAsync(15_000))
    await waitFor(() => expect(polls(calls)).toBe(2))
    await act(() => vi.advanceTimersByTimeAsync(15_000))
    await waitFor(() => expect(screen.getByTestId('probe').textContent).toBe('approved'))
    await act(() => vi.advanceTimersByTimeAsync(60_000))
    expect(polls(calls)).toBe(3)
  })

  it('stops once rejected and shows the reason', async () => {
    const { calls } = installFetch({ 'POST /signup/status/poll': answer('rejected', { reason: 'No GSTIN', decided_at: '2026-11-11T10:00:00Z' }) })
    mount()
    await waitFor(() => expect(screen.getByTestId('probe').textContent).toBe('rejected No GSTIN'))
    await act(() => vi.advanceTimersByTimeAsync(60_000))
    expect(polls(calls)).toBe(1)
  })

  it('never polls while the tab is hidden, and reads again when it comes back', async () => {
    const { calls } = installFetch({ 'POST /signup/status/poll': answer('pending') })
    mount()
    await waitFor(() => expect(polls(calls)).toBe(1))
    act(() => focusManager.setFocused(false))
    await act(() => vi.advanceTimersByTimeAsync(60_000))
    expect(polls(calls)).toBe(1)
    act(() => focusManager.setFocused(true))
    await waitFor(() => expect(polls(calls)).toBe(2))
  })

  it('a handle that names nothing (404) stops the poll and drops the stored handle', async () => {
    saveStatusHandle({ handle: HANDLE, via: 'password', returnTo: null })
    const { calls } = installFetch({ 'POST /signup/status/poll': () => envelope(404, 'NOT_FOUND') })
    mount()
    await waitFor(() => expect(screen.getByTestId('probe').textContent).toBe('gone'))
    expect(readStatusHandle()).toBeNull()
    await act(() => vi.advanceTimersByTimeAsync(60_000))
    expect(polls(calls)).toBe(1)
  })

  it('waits Retry-After after a 429 before reading again', async () => {
    const { calls } = installFetch({
      'POST /signup/status/poll': [answer('pending'), () => envelope(429, 'RATE_LIMITED'), answer('pending')],
    })
    mount()
    await waitFor(() => expect(polls(calls)).toBe(1))
    await act(() => vi.advanceTimersByTimeAsync(15_000))
    await waitFor(() => expect(polls(calls)).toBe(2))
    // no Retry-After header: 60 s, so nothing at 15 or 30 s
    await act(() => vi.advanceTimersByTimeAsync(30_000))
    expect(polls(calls)).toBe(2)
    expect(screen.getByTestId('probe').textContent).toBe('pending')
    await act(() => vi.advanceTimersByTimeAsync(31_000))
    await waitFor(() => expect(polls(calls)).toBe(3))
  })

  it('does nothing without a handle', async () => {
    const { calls } = installFetch({})
    mount(null)
    await act(() => vi.advanceTimersByTimeAsync(30_000))
    expect(polls(calls)).toBe(0)
  })
})

describe('waiting copy', () => {
  it('pending: updates by itself; promises a later visit only when the handle is kept', () => {
    expect(waitingCopy('pending', 'google', true)).toMatch(/updates by itself, so you can close it and come back to it later on this device/)
    expect(waitingCopy('pending', 'password', false)).toMatch(/updates by itself while it stays open\.$/)
    expect(waitingCopy('pending', 'google', true)).not.toMatch(/Continue with Google again/)
  })

  it('approved: continue to the workspace the way the person signs in', () => {
    expect(waitingCopy('approved', 'google', true)).toBe('Continue to your workspace with the same Google account.')
    expect(waitingCopy('approved', 'password', true)).toMatch(/^Continue to your workspace with the email and password/)
  })

  it('rejected: the next step is support', () => {
    expect(waitingCopy('rejected', 'password', true)).toBe('If you have a question about the reason, write to us at mukul@kuinn.in.')
  })
})
