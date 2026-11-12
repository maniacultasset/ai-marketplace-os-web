import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { SizeFlags } from './size-flags'

afterEach(cleanup)

describe('SizeFlags (feedback 8)', () => {
  it('says which variant sizes the chart lacks and which chart sizes no variant has', () => {
    render(<SizeFlags missing={['L', 'XL']} unused={['XS']} />)
    expect(screen.getByTestId('size-flags-missing').textContent).toBe('No chart row for L and XL. Add them before approval.')
    expect(screen.getByTestId('size-flags-unused').textContent).toBe('No variant in XS yet.')
  })

  it('shows nothing when the chart matches the variants', () => {
    render(<SizeFlags missing={[]} unused={[]} />)
    expect(screen.queryByTestId('size-flags')).toBeNull()
  })
})
