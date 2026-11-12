import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SignupRequest } from './format'

const mutate = vi.fn()
vi.mock('./api', () => ({
  useAskSignup: () => ({ mutate, reset: vi.fn(), isPending: false, isError: false, error: null }),
}))

const { AskDialog } = await import('./ask-dialog')

afterEach(() => {
  cleanup()
  mutate.mockReset()
})

const request: SignupRequest = {
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
}

describe('AskDialog', () => {
  it('says the request stays pending and the applicant replies once', () => {
    render(<AskDialog request={request} open onClose={vi.fn()} />)
    expect(screen.getByText(/can reply once\. The request stays pending/)).toBeTruthy()
  })

  it('needs a question, then sends it trimmed', async () => {
    render(<AskDialog request={request} open onClose={vi.fn()} />)
    fireEvent.click(screen.getByTestId('ask-confirm'))
    expect(await screen.findByText('Write the one thing you need to know.')).toBeTruthy()
    expect(mutate).not.toHaveBeenCalled()
    fireEvent.change(screen.getByTestId('ask-question'), { target: { value: '  Which marketplaces do you sell on?  ' } })
    fireEvent.click(screen.getByTestId('ask-confirm'))
    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1))
    expect(mutate.mock.calls[0]![0]).toEqual({ id: request.id, body: { question: 'Which marketplaces do you sell on?' } })
  })

  it('refuses more than 1000 characters before sending', async () => {
    render(<AskDialog request={request} open onClose={vi.fn()} />)
    fireEvent.change(screen.getByTestId('ask-question'), { target: { value: 'x'.repeat(1001) } })
    fireEvent.click(screen.getByTestId('ask-confirm'))
    expect(await screen.findByText(/1000 characters or fewer/)).toBeTruthy()
    expect(mutate).not.toHaveBeenCalled()
  })
})
