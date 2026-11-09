import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { CompositionEditor, MoneyField, SizeChartEditor } from './intake-fields'
import { emptySizeChart, fromReadChart, type FibreRow, type SizeChartDraft } from './intake-model'

afterEach(cleanup)

function Composition({ initial }: { initial: FibreRow[] }) {
  const [rows, setRows] = useState(initial)
  return <CompositionEditor id="c" rows={rows} onChange={setRows} errors={{}} />
}

function Chart({ initial = emptySizeChart(), seen }: { initial?: SizeChartDraft; seen?: (v: SizeChartDraft) => void }) {
  const [v, setV] = useState<SizeChartDraft>(initial)
  return (
    <SizeChartEditor
      id="s"
      value={v}
      onChange={(next) => {
        seen?.(next)
        setV(next)
      }}
      errors={{}}
    />
  )
}

const READ_ROWS = [{ size: 'M', chest: 102 }]

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

  it('a read with no unit it could check selects none and asks the seller to choose', () => {
    let last: SizeChartDraft | undefined
    render(<Chart initial={fromReadChart({ unit: 'unknown', basis: 'garment', rows: READ_ROWS }, null)} seen={(v) => (last = v)} />)
    const group = screen.getByRole('radiogroup', { name: 'Unit, required' })
    expect(group.querySelectorAll('[aria-checked="true"]')).toHaveLength(0)
    expect(screen.getByTestId('size-chart-unit-note').textContent).toMatch(/Choose the unit printed on your size chart/)
    expect(screen.queryByTestId('size-chart-unit-confirm')).toBeNull()
    fireEvent.click(screen.getByRole('radio', { name: 'cm' }))
    expect(last).toMatchObject({ unit: 'cm', unitCheck: null })
    expect(screen.queryByTestId('size-chart-unit-note')).toBeNull()
  })

  it('a read unit is pre-selected next to its printed line until the seller confirms it', () => {
    let last: SizeChartDraft | undefined
    render(<Chart initial={fromReadChart({ unit: 'in', basis: 'garment', rows: READ_ROWS }, 'Body measurements in inches')} seen={(v) => (last = v)} />)
    expect(screen.getByRole('radio', { name: 'Inches' }).getAttribute('aria-checked')).toBe('true')
    const note = screen.getByTestId('size-chart-unit-note').textContent ?? ''
    expect(note).toContain('Read from:')
    expect(note).toContain('Body measurements in inches')
    expect(note).not.toMatch(/\u2014/)
    fireEvent.click(screen.getByRole('button', { name: 'Confirm inches' }))
    expect(last).toMatchObject({ unit: 'in', unitCheck: null })
    expect(screen.queryByTestId('size-chart-unit-note')).toBeNull()
  })

  it('choosing the other unit on a read also settles it', () => {
    let last: SizeChartDraft | undefined
    render(<Chart initial={fromReadChart({ unit: 'cm', basis: 'garment', rows: READ_ROWS }, 'Size chart (cm)')} seen={(v) => (last = v)} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Inches' }))
    expect(last).toMatchObject({ unit: 'in', unitCheck: null })
  })

  it('money field shows the rupee sign and a decimal keyboard', () => {
    render(<MoneyField id="m" label="MRP" value="" onChange={() => {}} />)
    const input = screen.getByLabelText('MRP') as HTMLInputElement
    expect(input.inputMode).toBe('decimal')
    expect(screen.getByText('₹')).toBeTruthy()
  })
})
