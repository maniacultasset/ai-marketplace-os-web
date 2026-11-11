import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { queryClient } from '@/lib/query-client'
import { envelope, installFetch, json, type Call, type Handler } from '@/test/fake-api'
import { readStatusHandle, saveStatusHandle } from '@/features/signup-admin/status-handle'
import { SignupPage } from './signup-page'
import { SignupStatusPage } from './signup-status'

vi.hoisted(() => {
  vi.stubEnv('VITE_API_ORIGIN', 'http://localhost:3000')
})

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, search, state, children, ...rest }: { to: string; search?: Record<string, string>; state?: unknown; children: ReactNode }) => (
    <a
      href={search && Object.keys(search).length ? `${to}?${new URLSearchParams(search).toString()}` : to}
      data-state={state ? JSON.stringify(state) : undefined}
      {...rest}
    >
      {children}
    </a>
  ),
  useRouter: () => ({ history: { push: vi.fn() }, invalidate: vi.fn(), navigate: vi.fn() }),
}))

const HANDLE = 'p'.repeat(43)
const NEXT = 'q'.repeat(43)
const EMAIL = 'founder@kalakar.example'
const PASSWORD = 'Brass-Lantern-Path-0123'
const poll = (status: string, extra: Record<string, unknown> = {}): Handler => () =>
  json(200, { status, brand_name: 'Kalakar Weaves', requested_at: '2026-11-11T09:00:00Z', decided_at: null, reason: null, ...extra })
const STATUS = { request_id: 'r1', brand_name: 'Kalakar Weaves', status: 'pending', created_at: '2026-11-11T09:00:00Z' }

function mount(ui: ReactNode, routes: Record<string, Handler | Handler[]>) {
  const api = installFetch({ 'GET /auth/google/config': () => json(200, { enabled: false }), ...routes })
  render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
  return { ...api, user: userEvent.setup() }
}

const polled = (calls: Call[]) => calls.filter((c) => c.path === '/signup/status/poll')

async function fillSignup(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Brand name'), 'Kalakar Weaves')
  await user.type(screen.getByLabelText('Your name'), 'Meera Iyer')
  await user.type(screen.getByLabelText('Work email'), EMAIL)
  await user.type(screen.getByLabelText('Password'), PASSWORD)
  await user.click(screen.getByTestId('signup-agree'))
  await user.click(screen.getByTestId('signup-submit'))
}

describe('the password waiting screens', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  })
  afterEach(() => {
    cleanup()
    queryClient.clear()
    localStorage.clear()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('after sending: polls with the handle, never re-sends the password, then continues to sign in', async () => {
    const { calls, user } = mount(<SignupPage />, {
      'POST /signup': () => json(202, { request_id: 'r1', status: 'pending', status_handle: HANDLE }),
      'POST /signup/status/poll': [poll('pending'), poll('approved', { decided_at: '2026-11-11T10:00:00Z' })],
    })
    await fillSignup(user)
    expect(await screen.findByTestId('signup-sent')).toBeTruthy()
    expect(screen.getByText(/Your status is on the right and updates by itself\./)).toBeTruthy()
    expect(readStatusHandle()).toEqual({ handle: HANDLE, via: 'password', returnTo: null })
    await waitFor(() => expect(screen.getByTestId('signup-live-chip').textContent).toBe('Waiting for review'))
    expect(screen.getByText(/close it and check again later on this device from Check your request on the sign-in page/)).toBeTruthy()
    expect(polled(calls)[0]).toMatchObject({ body: { status_handle: HANDLE }, auth: null })
    await queryClient.refetchQueries({ queryKey: ['signup', 'status-poll'] })
    expect(await screen.findByTestId('signup-live-continue')).toBeTruthy()
    expect(screen.getByTestId('signup-live-continue').getAttribute('href')).toBe('/login')
    expect(calls.some((c) => c.path === '/signup/status')).toBe(false)
    await user.click(screen.getByTestId('signup-live-continue'))
    expect(readStatusHandle()).toBeNull()
  })

  it('after sending, the first poll fails (500): the card says so and offers a check, then shows the status', async () => {
    const { calls, user } = mount(<SignupPage />, {
      'POST /signup': () => json(202, { request_id: 'r1', status: 'pending', status_handle: HANDLE }),
      'POST /signup/status/poll': [() => envelope(500, 'INTERNAL'), poll('pending')],
    })
    await fillSignup(user)
    expect((await screen.findByTestId('signup-live-error')).textContent).toMatch(/Couldn’t check your request/)
    await user.click(screen.getByTestId('signup-live-refresh'))
    await waitFor(() => expect(screen.getByTestId('signup-live-chip').textContent).toBe('Waiting for review'))
    expect(screen.queryByTestId('signup-live-error')).toBeNull()
    expect(calls.some((c) => c.path === '/signup/status')).toBe(false)
  })

  it('a handle that names nothing (an email that had an account): one status read with the typed credentials', async () => {
    const { calls, user } = mount(<SignupPage />, {
      'POST /signup': () => json(202, { request_id: 'r1', status: 'pending', status_handle: HANDLE }),
      'POST /signup/status/poll': [() => envelope(404, 'NOT_FOUND'), poll('pending')],
      'POST /signup/status': () => json(200, { ...STATUS, status_handle: NEXT }),
    })
    await fillSignup(user)
    await waitFor(() => expect(calls.filter((c) => c.path === '/signup/status')).toHaveLength(1))
    expect(calls.find((c) => c.path === '/signup/status')?.body).toEqual({ email: EMAIL, password: PASSWORD })
    // the fresh handle from that read is kept and polled
    await waitFor(() => expect(polled(calls).at(-1)?.body).toEqual({ status_handle: NEXT }))
    expect(readStatusHandle()?.handle).toBe(NEXT)
  })

  it('/signup/status with a kept handle: the live card at once, no password asked', async () => {
    saveStatusHandle({ handle: HANDLE, via: 'password', returnTo: '/products' })
    const { calls } = mount(<SignupStatusPage />, { 'POST /signup/status/poll': poll('pending') })
    expect(await screen.findByTestId('signup-status-result')).toBeTruthy()
    expect(screen.getByTestId('signup-status-title').textContent).toBe('Waiting for approval')
    expect(screen.getByText('Kalakar Weaves')).toBeTruthy()
    expect(screen.getByText(/This page updates by itself, so you can close it/)).toBeTruthy()
    expect(screen.queryByLabelText('Password')).toBeNull()
    expect(screen.queryByTestId('signup-status-refresh')).toBeNull()
    expect(polled(calls)).toHaveLength(1)
  })

  it('approved: one button into the workspace, the intended page kept', async () => {
    saveStatusHandle({ handle: HANDLE, via: 'password', returnTo: '/products' })
    mount(<SignupStatusPage />, { 'POST /signup/status/poll': poll('approved', { decided_at: '2026-11-11T10:00:00Z' }) })
    expect((await screen.findByTestId('signup-status-title')).textContent).toBe('You’re approved')
    const go = screen.getByTestId('waiting-continue')
    expect(go.textContent).toBe('Continue to your workspace')
    expect(go.getAttribute('href')).toBe('/login?redirect=%2Fproducts')
    expect(screen.getByText(/This page can only show your status, so sign in once/)).toBeTruthy()
    // no email known on this page: the sign-in opens as approved, with nothing filled in
    expect(JSON.parse(go.getAttribute('data-state')!)).toEqual({ approvedSignIn: {} })
  })

  it('approved: the email this page was opened with is filled in on the sign-in, never in the URL', async () => {
    saveStatusHandle({ handle: HANDLE, via: 'password', returnTo: null })
    mount(<SignupStatusPage initialEmail={EMAIL} />, { 'POST /signup/status/poll': poll('approved', { decided_at: '2026-11-11T10:00:00Z' }) })
    const go = await screen.findByTestId('waiting-continue')
    expect(go.getAttribute('href')).toBe('/login')
    expect(JSON.parse(go.getAttribute('data-state')!)).toEqual({ approvedSignIn: { email: EMAIL } })
  })

  it('a question from the reviewer: read it, send one reply with the handle, then see it sent', async () => {
    saveStatusHandle({ handle: HANDLE, via: 'password', returnTo: null })
    const question = { question: 'Which marketplaces do you sell on?', asked_at: '2026-11-11T10:00:00Z' }
    const { calls, user } = mount(<SignupStatusPage />, {
      'POST /signup/status/poll': poll('pending', question),
      'POST /signup/status/reply': poll('pending', { ...question, reply: 'Amazon India.', replied_at: '2026-11-11T11:00:00Z' }),
    })
    expect((await screen.findByTestId('signup-status-title')).textContent).toBe('One question for you')
    expect(screen.getByTestId('signup-question-text').textContent).toBe('Which marketplaces do you sell on?')
    expect(screen.getByTestId('signup-status-badge').textContent).toBe('Needs your reply')
    await user.click(screen.getByTestId('signup-reply-send'))
    expect(await screen.findByText('Write your reply.')).toBeTruthy()
    expect(calls.some((c) => c.path === '/signup/status/reply')).toBe(false)
    await user.type(screen.getByTestId('signup-reply'), '  Amazon India.  ')
    await user.click(screen.getByTestId('signup-reply-send'))
    expect(await screen.findByTestId('signup-reply-sent')).toBeTruthy()
    const sent = calls.find((c) => c.path === '/signup/status/reply')
    expect(sent).toMatchObject({ body: { status_handle: HANDLE, reply: 'Amazon India.' }, auth: null })
    expect(calls.every((c) => !c.path.includes(HANDLE))).toBe(true)
    expect(screen.queryByTestId('signup-reply')).toBeNull()
    expect(screen.getByTestId('signup-status-title').textContent).toBe('Waiting for approval')
  })

  it('a reply refused as stale says so and reads the status again', async () => {
    saveStatusHandle({ handle: HANDLE, via: 'password', returnTo: null })
    const question = { question: 'Which marketplaces?', asked_at: '2026-11-11T10:00:00Z' }
    const { calls, user } = mount(<SignupStatusPage />, {
      'POST /signup/status/poll': poll('pending', question),
      'POST /signup/status/reply': () => envelope(409, 'INVALID_STATUS_TRANSITION'),
    })
    await user.type(await screen.findByTestId('signup-reply'), 'Amazon India.')
    await user.click(screen.getByTestId('signup-reply-send'))
    expect((await screen.findByTestId('signup-reply-error')).textContent).toMatch(/This request has changed, so the reply was not sent/)
    await waitFor(() => expect(polled(calls).length).toBeGreaterThan(1))
  })

  it('rejected: the reason, then support and apply again', async () => {
    saveStatusHandle({ handle: HANDLE, via: 'password', returnTo: null })
    mount(<SignupStatusPage />, {
      'POST /signup/status/poll': poll('rejected', { reason: 'Send your GSTIN.', decided_at: '2026-11-11T10:00:00Z' }),
    })
    expect((await screen.findByTestId('signup-status-reason')).textContent).toBe('Send your GSTIN.')
    expect(screen.getByTestId('waiting-support').getAttribute('href')).toBe('mailto:mukul@kuinn.in')
    expect(screen.getByTestId('signup-status-reapply')).toBeTruthy()
  })

  it('a kept handle that names nothing: dropped, and the email and password form', async () => {
    saveStatusHandle({ handle: HANDLE, via: 'password', returnTo: null })
    mount(<SignupStatusPage />, { 'POST /signup/status/poll': () => envelope(404, 'NOT_FOUND') })
    expect(await screen.findByTestId('signup-status-card')).toBeTruthy()
    expect(readStatusHandle()).toBeNull()
  })

  it.each([
    ['500', () => envelope(500, 'INTERNAL')],
    ['429', () => envelope(429, 'RATE_LIMITED')],
  ])('/signup/status with a kept handle, first poll %s: an error with a retry and another email, never an endless skeleton', async (code, fail) => {
    saveStatusHandle({ handle: HANDLE, via: 'password', returnTo: null })
    const { calls, user } = mount(<SignupStatusPage initialEmail={EMAIL} />, { 'POST /signup/status/poll': [fail, poll('pending')] })
    expect(await screen.findByTestId('signup-status-poll-error')).toBeTruthy()
    expect(screen.queryByTestId('signup-status-loading')).toBeNull()
    expect(screen.getByTestId('signup-status-error').textContent).toMatch(code === '429' ? /Too many checks/ : /Couldn’t check your request/)
    expect(readStatusHandle()?.handle).toBe(HANDLE)
    await user.click(screen.getByTestId('signup-status-retry'))
    expect(await screen.findByTestId('signup-status-result')).toBeTruthy()
    expect(polled(calls)).toHaveLength(2)
  })

  it('/signup/status first poll fails: "Use another email" drops the handle and shows the form', async () => {
    saveStatusHandle({ handle: HANDLE, via: 'password', returnTo: null })
    const { user } = mount(<SignupStatusPage initialEmail={EMAIL} />, { 'POST /signup/status/poll': () => envelope(500, 'INTERNAL') })
    await user.click(await screen.findByTestId('signup-status-another'))
    expect(await screen.findByTestId('signup-status-card')).toBeTruthy()
    expect(readStatusHandle()).toBeNull()
  })

  it('a pending check keeps the new handle and the card updates by itself from then on', async () => {
    const { calls, user } = mount(<SignupStatusPage initialEmail={EMAIL} />, {
      'POST /signup/status': () => json(200, { ...STATUS, status_handle: NEXT }),
      'POST /signup/status/poll': poll('pending'),
    })
    await user.type(screen.getByLabelText('Password'), PASSWORD)
    await user.click(screen.getByTestId('signup-status-submit'))
    expect(await screen.findByTestId('signup-status-another')).toBeTruthy()
    expect(readStatusHandle()?.handle).toBe(NEXT)
    await waitFor(() => expect(polled(calls)[0]?.body).toEqual({ status_handle: NEXT }))
    await user.click(screen.getByTestId('signup-status-another'))
    expect(readStatusHandle()).toBeNull()
    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe(EMAIL)
  })

  it('storage blocked: the page works, polls while open and promises nothing more', async () => {
    const blocked = () => {
      throw new DOMException('blocked', 'SecurityError')
    }
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(blocked)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(blocked)
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(blocked)
    const { calls, user } = mount(<SignupStatusPage initialEmail={EMAIL} />, {
      'POST /signup/status': () => json(200, { ...STATUS, status_handle: NEXT }),
      'POST /signup/status/poll': poll('pending'),
    })
    await user.type(screen.getByLabelText('Password'), PASSWORD)
    await user.click(screen.getByTestId('signup-status-submit'))
    expect(await screen.findByText(/updates by itself while it stays open/)).toBeTruthy()
    await waitFor(() => expect(polled(calls)).toHaveLength(1))
  })
})
