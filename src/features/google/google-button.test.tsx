import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearSession } from '@/api/session'
import { LoginPage } from '@/features/public/login-page'
import { SignupPage } from '@/features/public/signup-page'
import { queryClient } from '@/lib/query-client'
import { envelope, installFetch, json } from '@/test/fake-api'
import { GoogleEntry } from './google-button'

vi.hoisted(() => {
  vi.stubEnv('VITE_API_ORIGIN', 'http://localhost:3000')
})

const start = vi.hoisted(() => ({ startGoogle: vi.fn(async () => undefined) }))
vi.mock('./start', async (orig) => ({ ...(await orig<typeof import('./start')>()), startGoogle: start.startGoogle }))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...rest }: { to: string; children: ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
  useRouter: () => ({ history: { push: vi.fn() }, invalidate: vi.fn(), navigate: vi.fn() }),
}))

function wrap(ui: ReactNode) {
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

describe('Google button', () => {
  afterEach(() => {
    cleanup()
    clearSession('logout')
    queryClient.clear()
    vi.unstubAllGlobals()
    start.startGoogle.mockClear()
  })

  it('is hidden when the backend does not serve the config op (older API)', async () => {
    const { calls } = installFetch({})
    wrap(<LoginPage target="/home" />)
    await waitFor(() => expect(calls.some((c) => c.path === '/auth/google/config')).toBe(true))
    expect(screen.queryByTestId('google-entry')).toBeNull()
    expect(screen.queryByText(/google/i)).toBeNull()
  })

  it('is hidden when Google sign-in is switched off, or the probe fails', async () => {
    installFetch({ 'GET /auth/google/config': () => json(200, { enabled: false }) })
    wrap(<GoogleEntry intent="login" />)
    await waitFor(() => expect(queryClient.getQueryData(['public', 'google-config'])).toEqual({ enabled: false }))
    expect(screen.queryByTestId('google-entry')).toBeNull()
    cleanup()
    queryClient.clear()
    installFetch({ 'GET /auth/google/config': () => envelope(500, 'INTERNAL') })
    wrap(<GoogleEntry intent="login" />)
    await waitFor(() => expect(queryClient.getQueryData(['public', 'google-config'])).toEqual({ enabled: false }))
    expect(screen.queryByTestId('google-entry')).toBeNull()
  })

  it('/login: "Continue with Google" above an "or" divider, and a click starts the login intent', async () => {
    const { calls } = installFetch({ 'GET /auth/google/config': () => json(200, { enabled: true }) })
    const user = userEvent.setup()
    wrap(<LoginPage target="/products/p1" />)
    const button = await screen.findByRole('button', { name: 'Continue with Google' })
    expect(button.getAttribute('type')).toBe('button')
    // The official mark: four fixed brand colours, decorative to assistive tech.
    const fills = [...button.querySelectorAll('path')].map((p) => p.getAttribute('fill'))
    expect(fills).toEqual(['#EA4335', '#4285F4', '#FBBC05', '#34A853', 'none'])
    expect(button.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
    expect(screen.getByRole('separator').textContent).toBe('or use email')
    // The button comes before the email field.
    expect(button.compareDocumentPosition(screen.getByLabelText('Email')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // The probe is public: no bearer token.
    expect(calls.find((c) => c.path === '/auth/google/config')?.auth).toBeNull()

    await user.click(button)
    expect(start.startGoogle).toHaveBeenCalledWith({ intent: 'login', returnTo: '/products/p1' })
    expect(button.getAttribute('aria-busy')).toBe('true')
    expect(button.textContent).toContain('Opening Google…')
  })

  it('/signup: "Sign up with Google" starts the sign-up intent', async () => {
    installFetch({ 'GET /auth/google/config': () => json(200, { enabled: true }) })
    // The consent checkbox measures itself.
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
    const user = userEvent.setup()
    wrap(<SignupPage />)
    await user.click(await screen.findByRole('button', { name: 'Sign up with Google' }))
    expect(start.startGoogle).toHaveBeenCalledWith({ intent: 'signup', returnTo: '/home' })
    expect(screen.getByRole('separator').textContent).toBe('or sign up with email')
  })

  it('a blocked storage shows how to carry on, and the button works again', async () => {
    const { StorageBlockedError } = await vi.importActual<typeof import('./start')>('./start')
    start.startGoogle.mockRejectedValueOnce(new StorageBlockedError())
    installFetch({ 'GET /auth/google/config': () => json(200, { enabled: true }) })
    const user = userEvent.setup()
    wrap(<GoogleEntry intent="login" />)
    const button = await screen.findByRole('button', { name: 'Continue with Google' })
    await user.click(button)
    expect((await screen.findByRole('alert')).textContent).toMatch(/blocking site storage/)
    expect(button.hasAttribute('disabled')).toBe(false)
  })

  it('/login?error=google_unavailable: a calm notice and no Google button', async () => {
    installFetch({ 'GET /auth/google/config': () => json(200, { enabled: true }) })
    wrap(<LoginPage target="/home" notice="google_unavailable" />)
    expect(await screen.findByText(/Google sign-in isn’t available right now/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Continue with Google' })).toBeNull()
  })

  it('/login?restart=expired (sent back from a Google sign-in step) explains why', async () => {
    installFetch({})
    wrap(<LoginPage target="/home" notice="expired" />)
    expect(await screen.findByText('That sign-in step timed out. Sign in again.')).toBeTruthy()
  })
})
