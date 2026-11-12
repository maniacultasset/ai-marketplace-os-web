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
    expect(last).toEqual({ type: 'ean', value: '4006381333931', none: false, exempt: false })
    expect(screen.getByText('GTIN-8, 12, 13 or 14: an EAN, UPC or GTIN from the pack.')).toBeTruthy()
  })

  it('"No barcode" asks about the Amazon GTIN exemption and never assumes one (Chrome pass B5)', () => {
    render(<Harness amazon initial={{ type: 'ean', value: '4006381333931', none: false, exempt: false }} />)
    expect(screen.getByRole('radiogroup', { name: 'Barcode' })).toBeTruthy()
    const has = screen.getByRole('radio', { name: 'Has a barcode' }) as HTMLInputElement
    expect(has.checked).toBe(true)
    expect(screen.queryByRole('radiogroup', { name: 'Has Amazon granted your brand a GTIN exemption?' })).toBeNull()
    fireEvent.click(screen.getByRole('radio', { name: 'No barcode' }))
    expect(last).toMatchObject({ none: true, exempt: false })
    expect(screen.queryByLabelText('Barcode type')).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
    // The question shows, unanswered: neither Yes nor No is picked for the seller.
    const question = screen.getByRole('radiogroup', { name: 'Has Amazon granted your brand a GTIN exemption?' })
    const yes = screen.getByRole('radio', { name: 'Yes, it is approved' }) as HTMLInputElement
    const no = screen.getByRole('radio', { name: 'No' }) as HTMLInputElement
    expect(question).toBeTruthy()
    expect(yes.checked || no.checked).toBe(false)
    expect(screen.getByText(/Amazon will not create the listing without a barcode or an approved exemption/)).toBeTruthy()
    fireEvent.click(yes)
    expect(last).toMatchObject({ none: true, exempt: true })
    expect(screen.getByText(/Kuinn sends the exemption with the listing/)).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: 'No' }))
    expect(last).toMatchObject({ none: true, exempt: false })
    expect((screen.getByRole('radio', { name: 'No' }) as HTMLInputElement).checked).toBe(true)
    expect(screen.getByText(/Amazon will not create the listing without a barcode or an approved exemption/)).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: 'Has a barcode' }))
    expect(last).toMatchObject({ none: false, exempt: false })
    expect(screen.getByRole('textbox')).toBeTruthy()
  })

  it('reads a saved exemption back as "No barcode" with Yes picked', () => {
    render(<Harness amazon initial={{ type: 'ean', value: '', none: true, exempt: true }} />)
    expect((screen.getByRole('radio', { name: 'No barcode' }) as HTMLInputElement).checked).toBe(true)
    expect((screen.getByRole('radio', { name: 'Yes, it is approved' }) as HTMLInputElement).checked).toBe(true)
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

  it('without Amazon says nothing about Amazon: plain formats and a plain "No barcode"', () => {
    const { container } = render(<Harness />)
    expect(container.textContent).not.toMatch(/Amazon/)
    fireEvent.click(screen.getByRole('radio', { name: 'No barcode' }))
    // No marketplace to be exempt from: nothing is declared, and no question is asked.
    expect(last).toMatchObject({ none: true, exempt: false })
    expect(screen.queryByRole('radiogroup', { name: /GTIN exemption/ })).toBeNull()
    expect(screen.getByText('Saved without a barcode.')).toBeTruthy()
    expect(container.textContent).not.toMatch(/Amazon/)
  })

  it('on a style shows only the exemption choice, which applies to its variants', () => {
    render(<Harness level="style" amazon />)
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.getByRole('radio', { name: 'Variants have barcodes' })).toBeTruthy()
    expect(screen.getByText(/Each variant has its own barcode/)).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: 'No barcodes' }))
    expect(last).toMatchObject({ none: true, exempt: false })
    expect(screen.getByText(/Amazon will not create variants without a barcode or an approved exemption/)).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: 'Yes, it is approved' }))
    expect(last).toMatchObject({ none: true, exempt: true })
    expect(screen.getByText(/Every variant without a barcode is sent as exempt/)).toBeTruthy()
    // A change on a style is always sent, even when it matches what was read.
    expect(last.touched).toBe(true)
  })

  it('the EAN field says how many digits it takes', () => {
    render(<Harness />)
    expect(screen.getByPlaceholderText('8 or 13 digits')).toBeTruthy()
  })

  it('shows the error in place of the hint and marks the input', () => {
    render(<Harness initial={{ type: 'ean', value: '4006381333932', none: false, exempt: false }} error="The last digit doesn’t match." />)
    const input = screen.getByRole('textbox')
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByText('The last digit doesn’t match.')).toBeTruthy()
  })
  it("with Amazon chosen, links to Amazon India's GTIN exemption page next to the choice", () => {
    render(<Harness amazon />)
    const link = screen.getByRole('link', { name: /How to get a GTIN exemption/ })
    expect(link.getAttribute('href')).toBe('https://sellercentral.amazon.in/help/hub/reference/G200426310')
    expect(screen.getByTestId('b-exemption-help').textContent).toContain('Amazon asks for the brand name, the category and photos of the product and its pack.')
    fireEvent.click(screen.getByRole('radio', { name: 'No barcode' }))
    expect(screen.getByRole('link', { name: /How to get a GTIN exemption/ })).toBeTruthy()
  })

  it('without Amazon shows no exemption link', () => {
    render(<Harness />)
    expect(screen.queryByRole('link', { name: /GTIN exemption/ })).toBeNull()
  })
})
