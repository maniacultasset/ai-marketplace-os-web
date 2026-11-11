import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { envelope, installFetch, json } from '@/test/fake-api'
import { readStatusHandle, saveStatusHandle } from '@/features/signup-admin/status-handle'
import { questionState, useWaitingStatus, viewChip, viewCopy, waitingCopy, waitingTitle, type StatusView } from './waiting'

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
    expect(waitingCopy('pending', 'google', true)).toMatch(/updates by itself, so you can close it and check again later on this device from Check your request/)
    expect(waitingCopy('pending', 'password', false)).toMatch(/updates by itself while it stays open\.$/)
    expect(waitingCopy('pending', 'google', true)).not.toMatch(/Continue with Google again/)
  })

  it('pending with nothing polling: says how to check again, promises no updates', () => {
    expect(waitingCopy('pending', 'google', false, false)).toMatch(/To check on it later, use Continue with Google again\.$/)
    expect(waitingCopy('pending', 'password', false, false)).not.toMatch(/updates by itself/)
  })

  it('approved: says plainly why one sign-in is needed, the way the person signs in', () => {
    expect(waitingCopy('approved', 'google', true)).toBe(
      'Your workspace is ready. This page can only show your status, so sign in once with the same Google account to open it.',
    )
    expect(waitingCopy('approved', 'password', true)).toMatch(/can only show your status, so sign in once with the email and password/)
  })

  it('rejected: the next step is support', () => {
    expect(waitingCopy('rejected', 'password', true)).toBe('If you have a question about the reason, write to us at mukul@kuinn.in.')
  })
})

describe('the reviewer’s one question', () => {
  const base: StatusView = { status: 'pending', brand_name: 'Acme Naturals', created_at: '2026-11-11T09:00:00Z' }
  const asked: StatusView = { ...base, question: 'Which marketplaces?', asked_at: '2026-11-11T10:00:00Z' }
  const replied: StatusView = { ...asked, reply: 'Amazon India.', replied_at: '2026-11-11T11:00:00Z' }

  it('is none, asked or replied, and only while pending', () => {
    expect(questionState(base)).toBe('none')
    expect(questionState(asked)).toBe('asked')
    expect(questionState(replied)).toBe('replied')
    expect(questionState({ ...replied, status: 'approved' })).toBe('none')
  })

  it('an open question gets its own title, copy and chip; a reply goes back to waiting', () => {
    expect(waitingTitle(asked)).toBe('One question for you')
    expect(viewCopy(asked, 'password', true)).toMatch(/one more detail before approving/)
    expect(viewChip(asked)).toEqual({ status: 'needs-you', label: 'Needs your reply' })
    expect(waitingTitle(replied)).toBe('Waiting for approval')
    expect(viewCopy(replied, 'google', true)).toMatch(/Your reply is with our team/)
    expect(viewChip(replied).label).toBe('Waiting for review')
    expect(viewCopy(base, 'password', true)).toBe(waitingCopy('pending', 'password', true))
  })
})
