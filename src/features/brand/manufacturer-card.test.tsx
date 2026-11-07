import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const party = { id: 'm1', legal_name: 'Asha Textiles', address_line1: '12 MG Road', city: 'Jaipur', state_code: 'RJ', postal_code: '302001', country_code: 'IN', inherited: false }
const query = { data: { data: { default_manufacturer: party, updated_at: null }, etag: '"v1"' }, isPending: false, error: null, refetch: vi.fn() }
const mutateAsync = vi.fn().mockResolvedValue({ data: { default_manufacturer: party }, etag: '"v2"' })

vi.mock('@/features/products/api', () => ({
  useBrandManufacturer: () => query,
  useSaveBrandManufacturer: () => ({ mutateAsync, isPending: false }),
}))
vi.mock('@/lib/toast', () => ({ toast: { success: vi.fn() } }))

const { ManufacturerCard } = await import('./manufacturer-card')

afterEach(cleanup)

describe('ManufacturerCard', () => {
  it('sends the ETag the edit started from, not one a background refetch swapped in', async () => {
    const view = render(<ManufacturerCard canEdit />)
    fireEvent.click(screen.getByTestId('manufacturer-edit'))
    // A window-focus refetch brings a newer version while the person edits.
    query.data = { ...query.data, etag: '"v9"' }
    view.rerender(<ManufacturerCard canEdit />)
    fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Jodhpur' } })
    fireEvent.click(screen.getByTestId('manufacturer-save'))
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled())
    expect(mutateAsync.mock.calls[0]![0].etag).toBe('"v1"')
  })
})
