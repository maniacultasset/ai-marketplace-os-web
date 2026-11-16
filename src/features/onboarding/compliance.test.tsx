import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const query = { data: { data: { default_manufacturer: null, updated_at: null }, etag: '"v1"' }, isPending: false, error: null, refetch: vi.fn() }
vi.mock('@/features/products/api', () => ({
  useBrandManufacturer: () => query,
  useSaveBrandManufacturer: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/lib/permissions', async (orig) => ({ ...(await orig<typeof import('@/lib/permissions')>()), useCan: () => () => true }))

const { BrandParties } = await import('./compliance')

afterEach(cleanup)

describe('Settings > Compliance brand parties', () => {
  it('shows the manufacturer, marketer, packer and importer cards, each editable', () => {
    render(<BrandParties />)
    for (const role of ['manufacturer', 'marketer', 'packer', 'importer']) {
      expect(screen.getByTestId(`brand-${role}-card`)).toBeTruthy()
      expect(screen.getByTestId(`${role}-edit`)).toBeTruthy()
    }
    expect(screen.getByTestId('packer-edit').textContent).toBe('Add packer')
  })
})
