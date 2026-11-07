import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { emptyBarcode, type BarcodeDraft, type BarcodeLevel } from './barcode'
import { BarcodeField } from './barcode-field'

afterEach(cleanup)

let last: BarcodeDraft = emptyBarcode()

function Harness({ level, initial = emptyBarcode(), error }: { level?: BarcodeLevel; initial?: BarcodeDraft; error?: string }) {
  const [v, setV] = useState(initial)
  return (
    <BarcodeField
      id="b"
      level={level}
      value={v}
      error={error}
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
    expect(screen.getByText(/Amazon needs one unless your brand has a GTIN exemption/)).toBeTruthy()
  })

  it('hides the digits when marked exempt, and says when that is allowed', () => {
    render(<Harness initial={{ type: 'ean', value: '4006381333931', exempt: false }} />)
    fireEvent.click(screen.getByRole('switch'))
    expect(last.exempt).toBe(true)
    expect(screen.queryByLabelText('Barcode type')).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.getByText(/Only if Amazon approved a GTIN exemption/)).toBeTruthy()
  })

  it('on a style shows only the exemption, which applies to its variants', () => {
    render(<Harness level="style" />)
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.getByText('No barcodes (exempt)')).toBeTruthy()
    expect(screen.getByText(/Each variant has its own barcode/)).toBeTruthy()
    fireEvent.click(screen.getByRole('switch'))
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
