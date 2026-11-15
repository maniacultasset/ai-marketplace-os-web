import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ErrorItem } from '@/api/types'
import { RowIssueList } from './import-rows'

afterEach(cleanup)

const item = (error_code: string, message: string, severity: 'error' | 'warning' = 'error'): ErrorItem =>
  ({ field: 'file.row', error_code, message, source: 'schema', severity, retryable: false, auto_fixable: false }) as ErrorItem

describe('import report row issues (prod bulk test, 15 Nov: W5)', () => {
  it('reads in plain words, with no codes, field or source, and the photo warning as a note', () => {
    render(
      <RowIssueList
        row={{
          status: 'failed',
          errors: [
            item('REQUIRED_FIELD_MISSING', 'no image URL; upload images in the product form', 'warning'),
            item('VALUE_NOT_ALLOWED', 'fiber_composition must list fibres whose percents add up to 100'),
          ],
        }}
      />,
    )
    const list = screen.getByTestId('error-report-list')
    expect(list.textContent).not.toMatch(/VALUE_NOT_ALLOWED|REQUIRED_FIELD_MISSING|file\.row|schema|fiber_composition/)
    expect(screen.getByRole('heading', { name: 'Why it was not imported' })).toBeTruthy()
    expect(list.textContent).toContain('Fiber composition must list fibres whose percents add up to 100.')
    const notes = screen.getByTestId('row-notes')
    expect(within(notes).getByText('No photo yet. Add photos on the product’s Media tab.')).toBeTruthy()
    // The code stays on hover for support.
    expect(list.querySelector('[data-code="VALUE_NOT_ALLOWED"]')?.getAttribute('title')).toBe('VALUE_NOT_ALLOWED')
  })

  it('shows an imported row’s warnings as notes only', () => {
    render(<RowIssueList row={{ status: 'imported', errors: [item('VALUE_NOT_ALLOWED', 'tax_rate is not a GST rate (0, 5); it was not saved, so set the GST rate on the product', 'warning')] }} />)
    expect(screen.queryByRole('heading', { name: /Why it was not imported|Problems/ })).toBeNull()
    expect(screen.getByRole('heading', { name: 'Notes' })).toBeTruthy()
    expect(screen.getByTestId('row-notes').textContent).toContain('The GST rate is not one of the GST rates')
  })
})
