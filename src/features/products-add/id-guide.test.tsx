import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { IdGuide } from './id-guide'
import { ID_HINT, idRows } from './identifiers'

afterEach(cleanup)

describe('which identifier goes where (client feedback 11 Nov, item 3)', () => {
  it('names every identifier and says the product ID is never sent', () => {
    expect(idRows().map((r) => r.name)).toEqual(['Product ID', 'SKU', 'Style number', 'Variant SKUs', 'Barcode'])
    expect(ID_HINT.productId).toMatch(/Never sent/)
    expect(ID_HINT.sku).toMatch(/seller SKU/)
    expect(ID_HINT.styleNumber).toMatch(/model and part number/)
    expect(ID_HINT.variantSku).toMatch(/seller SKU/)
    expect(ID_HINT.barcode).toMatch(/Amazon/)
  })

  it('leaves out the style-only rows for a variant', () => {
    expect(idRows({}, { variant: true }).map((r) => r.key)).toEqual(['productId', 'sku', 'barcode'])
  })

  it('shows the product’s own values next to each name', () => {
    render(<IdGuide values={{ productId: 'p-123', sku: 'KS-1', styleNumber: 'KS-1042' }} />)
    expect(screen.getByText('Which IDs go to the marketplace')).toBeTruthy()
    expect(screen.getByTestId('id-guide-productId').textContent).toBe(`Product IDp-123 · ${ID_HINT.productId}`)
    expect(screen.getByTestId('id-guide-styleNumber').textContent).toContain('KS-1042')
    expect(screen.getByTestId('id-guide-variantSku').textContent).toBe(`Variant SKUs · ${ID_HINT.variantSku}`)
  })
})
