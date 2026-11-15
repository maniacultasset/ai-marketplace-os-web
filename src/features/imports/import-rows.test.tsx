import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ErrorItem, Schema } from '@/api/types'
import { PhotosCell, RowIssueList } from './import-rows'

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

type Link = Schema<'PhotoLinkResult'>
const photo = (position: number, status: Link['status'], over: Partial<Link> = {}): Link => ({
  link_id: `00000000-0000-4000-8000-00000000090${position}`,
  position,
  column: position === 1 ? 'main_image' : 'additional_images',
  status,
  retryable: status === 'failed',
  ...over,
})

describe('import row photos (G2)', () => {
  const photos = [
    photo(1, 'saved', { view: 'front', image_id: 'i1' }),
    photo(2, 'failed', { problem: 'not_found', http_status: 404, message: 'The link returned 404. Check the link is right and public.' }),
    photo(3, 'queued'),
    photo(4, 'skipped', { problem: 'removed_by_seller', message: 'You removed this photo earlier, so it was not downloaded again.' }),
  ]

  it('lists each link as Photo N in the server’s words, never a code or the link', () => {
    render(<RowIssueList row={{ status: 'imported', errors: [], photos }} sheetPhotos />)
    const list = screen.getByTestId('row-photos')
    expect(within(list).getAllByTestId('row-photo').map((li) => li.textContent)).toEqual([
      'Photo 1: Saved as Front',
      'Photo 2: The link returned 404. Check the link is right and public.',
      'Photo 3: waiting to download',
      'Photo 4: You removed this photo earlier, so it was not downloaded again.',
    ])
    expect(list.textContent).not.toMatch(/not_found|removed_by_seller|https?:/)
  })

  it('reads the no-photo note as no photo link while photos are downloaded', () => {
    render(<RowIssueList row={{ status: 'imported', errors: [item('REQUIRED_FIELD_MISSING', 'no image URL; upload images in the product form', 'warning')] }} sheetPhotos />)
    expect(screen.getByTestId('row-notes').textContent).toContain('No photo link in the file. Add photos on the product’s Media tab.')
  })

  it('shows a compact saved-of-total chip, toned by what is left', () => {
    render(<PhotosCell photos={photos} />)
    const chip = screen.getByTestId('row-photos-chip')
    expect(chip.textContent).toBe('1/4')
    expect(chip.getAttribute('aria-label')).toBe('1 of 4 photos saved, 1 downloading, 2 not saved')
    expect(chip.dataset.variant).toBe('warning')
    cleanup()
    render(<PhotosCell photos={[photo(1, 'saved', { view: 'front' })]} />)
    expect(screen.getByTestId('row-photos-chip').dataset.variant).toBe('success')
    cleanup()
    render(<PhotosCell photos={[]} />)
    expect(screen.queryByTestId('row-photos-chip')).toBeNull()
  })
})
