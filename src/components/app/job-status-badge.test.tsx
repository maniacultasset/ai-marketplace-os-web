import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { JobStatusBadge } from './job-status-badge'

afterEach(cleanup)

describe('JobStatusBadge', () => {
  it('reads "Waiting for a free slot" for a queued generation past the brand cap (B19)', () => {
    render(<JobStatusBadge status="queued" waitingForSlot />)
    expect(screen.getByText('Waiting for a free slot')).toBeTruthy()
  })

  it('reads Queued without the flag, and the real status once the job is promoted', () => {
    const { rerender } = render(<JobStatusBadge status="queued" />)
    expect(screen.getByText('Queued')).toBeTruthy()
    rerender(<JobStatusBadge status="running" waitingForSlot />)
    expect(screen.getByText('Running')).toBeTruthy()
  })
})
