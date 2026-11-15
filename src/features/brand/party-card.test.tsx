import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const packer = { id: 'p1', legal_name: 'Ravi Packers', address_line1: '4 Ring Road', city: 'Surat', state_code: 'GJ', postal_code: '395002', country_code: 'IN', inherited: false }
const query = { data: { data: { default_manufacturer: null, default_packer: packer, default_marketer: packer, updated_at: null }, etag: '"v1"' }, isPending: false, error: null, refetch: vi.fn() }
const affected = [{ listing_id: 'l1', product_id: 'p1', marketplace: 'amazon', status: 'approved', redraft: true, redraft_blocked: null, sections: ['attributes'] }]
const mutateAsync = vi.fn().mockResolvedValue({ data: { default_marketer: packer, affected_listings: affected }, etag: '"v2"' })

vi.mock('@/features/products/api', () => ({
  useBrandManufacturer: () => query,
  useSaveBrandManufacturer: () => ({ mutateAsync, isPending: false }),
}))
vi.mock('@/lib/toast', () => ({ toast: { success: vi.fn() } }))

const { BrandPartyCard } = await import('./party-card')

afterEach(() => {
  cleanup()
  mutateAsync.mockClear()
})

describe('BrandPartyCard', () => {
  it('a marketer: plain copy, sends default_marketer, and hands the save verdicts on', async () => {
    const onSaved = vi.fn()
    render(<BrandPartyCard role="marketer" canEdit onSaved={onSaved} />)
    expect(screen.getByTestId('brand-marketer-card').textContent).toContain('The company that markets your products')
    fireEvent.click(screen.getByTestId('marketer-edit'))
    fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Vadodara' } })
    fireEvent.click(screen.getByTestId('marketer-save'))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    const body = mutateAsync.mock.calls[0]![0].body
    expect(Object.keys(body)).toEqual(['default_marketer'])
    expect(body.default_marketer.city).toBe('Vadodara')
    expect(onSaved).toHaveBeenCalledWith(true, affected)
  })

  it('an unset importer: plain add copy', () => {
    render(<BrandPartyCard role="importer" canEdit />)
    expect(screen.getByTestId('brand-importer-card').textContent).toContain('Not set yet.')
    expect(screen.getByTestId('importer-edit').textContent).toBe('Add importer')
  })

  it('shows the saved packer, and removes it with null', async () => {
    const onSaved = vi.fn()
    render(<BrandPartyCard role="packer" canEdit onSaved={onSaved} />)
    expect(screen.getByTestId('brand-packer-card').textContent).toContain('Ravi Packers')
    fireEvent.click(screen.getByTestId('packer-edit'))
    fireEvent.click(screen.getByText('Remove'))
    expect(screen.getByText('Remove the brand packer?')).toBeTruthy()
    fireEvent.click(screen.getAllByText('Remove').at(-1)!)
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled())
    expect(mutateAsync.mock.calls[0]![0].body).toEqual({ default_packer: null })
    expect(onSaved.mock.calls[0]![0]).toBe(false)
  })
})
