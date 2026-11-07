import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { CompositionEditor, MoneyField, SizeChartEditor } from './intake-fields'
import { emptySizeChart, type FibreRow, type SizeChartDraft } from './intake-model'

afterEach(cleanup)

function Composition({ initial }: { initial: FibreRow[] }) {
  const [rows, setRows] = useState(initial)
  return <CompositionEditor id="c" rows={rows} onChange={setRows} errors={{}} />
}

function Chart() {
  const [v, setV] = useState<SizeChartDraft>(emptySizeChart())
  return <SizeChartEditor id="s" value={v} onChange={setV} errors={{}} />
}

describe('intake editors', () => {
  it('composition shows the live total and pre-fills the rest on add', () => {
    render(<Composition initial={[{ fibre: 'Cotton', percent: '60' }]} />)
    expect(screen.getByText('60% of 100%')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Add fibre/ }))
    expect((screen.getByLabelText('Percent of fibre 2') as HTMLInputElement).value).toBe('40')
    expect(screen.getByText('100% of 100%')).toBeTruthy()
    // Focus moves to the new row's fibre, ready to type.
    expect(document.activeElement).toBe(screen.getByLabelText('Fibre 2'))
  })

  it('size chart adds a common size once', () => {
    render(<Chart />)
    expect(screen.getByText(/No sizes yet/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'M' }))
    expect((screen.getByLabelText('Size 1') as HTMLInputElement).value).toBe('M')
    expect((screen.getByRole('button', { name: 'M' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByLabelText('Chest, size M')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Sleeve/ }))
    expect(screen.getByLabelText('Sleeve, size M')).toBeTruthy()
  })

  it('money field shows the rupee sign and a decimal keyboard', () => {
    render(<MoneyField id="m" label="MRP" value="" onChange={() => {}} />)
    const input = screen.getByLabelText('MRP') as HTMLInputElement
    expect(input.inputMode).toBe('decimal')
    expect(screen.getByText('₹')).toBeTruthy()
  })
})
