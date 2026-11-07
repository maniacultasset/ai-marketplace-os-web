import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SignupRequest } from './format'

const mutate = vi.fn()
vi.mock('./api', () => ({
  useApproveSignup: () => ({ mutate, reset: vi.fn(), isPending: false, isError: false, error: null }),
}))

const { ApproveDialog } = await import('./approve-dialog')

afterEach(() => {
  cleanup()
  mutate.mockReset()
})

const request = (over: Partial<SignupRequest> = {}): SignupRequest => ({
  id: '0b1c2d3e-0000-4000-8000-000000000301',
  brand_name: 'Kalakar Weaves',
  owner_name: 'Meera Iyer',
  email: 'meera@kalakar.example',
  phone: null,
  website: null,
  status: 'pending',
  reason: null,
  created_at: '2026-11-07T09:00:00Z',
  decided_at: null,
  tenant_id: null,
  user_id: '0b1c2d3e-0000-4000-8000-000000000302',
  verified_via: null,
  ...over,
})

describe('ApproveDialog', () => {
  it('sends {} when the trial length is left empty, so the backend default applies', () => {
    render(<ApproveDialog request={request()} open onClose={vi.fn()} />)
    const trial = screen.getByTestId('approve-trial-days') as HTMLInputElement
    expect(trial.value).toBe('')
    fireEvent.click(screen.getByTestId('approve-confirm'))
    expect(mutate).toHaveBeenCalledTimes(1)
    expect(mutate.mock.calls[0]![0]).toEqual({ id: request().id, body: {} })
    // The default is the backend's: the dialog never names a number for it.
    expect(screen.queryByText(/14 days/)).toBeNull()
  })

  it('sends trial_days only when a length is typed', () => {
    render(<ApproveDialog request={request()} open onClose={vi.fn()} />)
    fireEvent.change(screen.getByTestId('approve-trial-days'), { target: { value: '30' } })
    fireEvent.click(screen.getByTestId('approve-confirm'))
    expect(mutate.mock.calls[0]![0].body).toEqual({ trial_days: 30 })
  })

  it('does not tell a Google applicant to use a password', () => {
    render(<ApproveDialog request={request({ verified_via: 'google' })} open onClose={vi.fn()} />)
    expect(screen.getByText(/sign in right away with Google/)).toBeTruthy()
    expect(screen.queryByText(/password/)).toBeNull()
    expect(screen.getByTestId('approve-verified-via').textContent).toBe('Google (email verified)')
  })

  it('tells a password applicant to use the password they applied with', () => {
    render(<ApproveDialog request={request()} open onClose={vi.fn()} />)
    expect(screen.getByText(/the email and password they applied with/)).toBeTruthy()
  })
})
