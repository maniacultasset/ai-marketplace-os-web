import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { emptyBarcode, type BarcodeDraft, type BarcodeLevel } from './barcode'
import { BarcodeField } from './barcode-field'

afterEach(cleanup)

let last: BarcodeDraft = emptyBarcode()

function Harness({ level, initial = emptyBarcode(), error, amazon, needed }: { level?: BarcodeLevel; initial?: BarcodeDraft; error?: string; amazon?: boolean; needed?: string }) {
  const [v, setV] = useState(initial)
  return (
    <BarcodeField
      id="b"
      level={level}
      value={v}
      error={error}
      amazon={amazon}
      needed={needed}
      onChange={(next) => {
        last = next
        setV(next)
      }}
    />
  )
}

describe('BarcodeField', () => {
  it('takes the type and the digits, with a number keyboard', () => {
    render(<Harness />)
    const input = screen.getByLabelText('Barcode', { selector: 'input' }) as HTMLInputElement
    expect(input.inputMode).toBe('numeric')
    expect(screen.getByLabelText('Barcode type').textContent).toContain('EAN')
    fireEvent.change(input, { target: { value: '4006381333931' } })
    expect(last).toEqual({ type: 'ean', value: '4006381333931', exempt: false })
    expect(screen.getByText(/GTIN-8, 12, 13 or 14.*Amazon needs one unless your brand has a GTIN exemption/)).toBeTruthy()
  })

  it('offers "Has a barcode" or the exemption as two explicit options', () => {
    render(<Harness initial={{ type: 'ean', value: '4006381333931', exempt: false }} />)
    expect(screen.getByRole('radiogroup', { name: 'Barcode' })).toBeTruthy()
    const has = screen.getByRole('radio', { name: 'Has a barcode' }) as HTMLInputElement
    expect(has.checked).toBe(true)
    fireEvent.click(screen.getByRole('radio', { name: 'No barcode: my brand has an Amazon GTIN exemption' }))
    expect(last.exempt).toBe(true)
    expect(screen.queryByLabelText('Barcode type')).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.getByText('Amazon approves GTIN exemptions per brand and category. Choose this only if yours is approved.')).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: 'Has a barcode' }))
    expect(last.exempt).toBe(false)
    expect(screen.getByRole('textbox')).toBeTruthy()
  })

  it('with Amazon chosen: "Needed for Amazon" beside the label, calm (no attention, no error), and no second chip', () => {
    const { container } = render(<Harness amazon needed="Amazon needs this" />)
    expect(container.querySelector('[data-slot="field-required"]')?.textContent).toBe('Needed for Amazon')
    expect(container.querySelector('[data-needs-input]')).toBeNull()
    expect(screen.queryByText('Amazon needs this')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByText(/Amazon needs one to create the listing/)).toBeTruthy()
    // Screen readers hear it in the description, the name stays "Barcode".
    const input = screen.getByRole('textbox', { name: 'Barcode' })
    expect(document.getElementById(input.getAttribute('aria-describedby')!)!.textContent).toMatch(/^Needed for Amazon\./)
  })

  it('without Amazon: no mark, and the SI12 chip still says who needs it', () => {
    const { container } = render(<Harness needed="Flipkart needs this" />)
    expect(container.querySelector('[data-slot="field-required"]')).toBeNull()
    expect(screen.getByText('Flipkart needs this')).toBeTruthy()
  })

  it('on a style shows only the exemption choice, which applies to its variants', () => {
    render(<Harness level="style" />)
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.getByRole('radio', { name: 'Variants have barcodes' })).toBeTruthy()
    expect(screen.getByText(/Each variant has its own barcode/)).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: 'No barcodes: my brand has an Amazon GTIN exemption' }))
    expect(screen.getByText(/Every variant without a barcode is marked exempt/)).toBeTruthy()
    // A change on a style is always sent, even when it matches what was read.
    expect(last.touched).toBe(true)
  })

  it('the EAN field says how many digits it takes', () => {
    render(<Harness />)
    expect(screen.getByPlaceholderText('8 or 13 digits')).toBeTruthy()
  })

  it('shows the error in place of the hint and marks the input', () => {
    render(<Harness initial={{ type: 'ean', value: '4006381333932', exempt: false }} error="The last digit doesn’t match." />)
    const input = screen.getByRole('textbox')
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByText('The last digit doesn’t match.')).toBeTruthy()
  })
})
