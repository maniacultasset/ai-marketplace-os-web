import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { CountryField } from './seller-field-inputs'
import { countryMatch } from './seller-fields'

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
  Element.prototype.scrollIntoView ??= () => {}
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
})
afterEach(cleanup)

function Field({ initial = '', onChange = () => {}, allowClear }: { initial?: string; onChange?: (v: string) => void; allowClear?: boolean }) {
  const [value, setValue] = useState(initial)
  return (
    <CountryField
      id="g-country"
      value={value}
      allowClear={allowClear}
      onChange={(v) => {
        setValue(v)
        onChange(v)
      }}
    />
  )
}

const options = () => within(screen.getByRole('listbox')).getAllByRole('option').map((o) => o.textContent)
const highlighted = () => screen.getByRole('listbox').querySelector('[data-selected="true"]')?.textContent

describe('countryMatch', () => {
  it('finds a name by its start, then a later word, then the code, ignoring case and accents', () => {
    expect(countryMatch('India', 'IN', 'Ind')).toBe(1)
    expect(countryMatch('Iceland', 'IS', 'Ind')).toBe(0)
    expect(countryMatch('British Indian Ocean Territory', 'IO', 'ind')).toBe(0.8)
    expect(countryMatch('Åland Islands', 'AX', 'aland')).toBe(1)
    expect(countryMatch('United Kingdom', 'GB', 'gb')).toBe(0.6)
    expect(countryMatch('India', 'IN', '')).toBe(1)
  })
})

describe('CountryField search (prod 16 Nov: typing India landed on Iceland)', () => {
  it('typing "Ind" finds India first, and Enter chooses it', async () => {
    const onChange = vi.fn()
    render(<Field onChange={onChange} />)
    await userEvent.click(screen.getByTestId('g-country'))
    await userEvent.type(screen.getByTestId('g-country-search'), 'Ind')
    await waitFor(() => expect(options()).toEqual(['India', 'Indonesia', 'British Indian Ocean Territory']))
    expect(options()).not.toContain('Iceland')
    expect(highlighted()).toBe('India')
    await userEvent.keyboard('{Enter}')
    expect(onChange).toHaveBeenCalledWith('IN')
    expect(screen.getByTestId('g-country').textContent).toBe('India')
    expect(screen.queryByRole('listbox')).toBeNull()
  }, 30_000)

  it('typing on the closed field opens the search with that letter, India already chosen', async () => {
    const onChange = vi.fn()
    render(<Field initial="IN" onChange={onChange} />)
    expect(screen.getByTestId('g-country').textContent).toBe('India')
    screen.getByTestId('g-country').focus()
    await userEvent.keyboard('India')
    expect((screen.getByTestId('g-country-search') as HTMLInputElement).value).toBe('India')
    await waitFor(() => expect(options()).toEqual(['India', 'British Indian Ocean Territory']))
    expect(highlighted()).toBe('India')
    await userEvent.keyboard('{Enter}')
    expect(onChange).toHaveBeenLastCalledWith('IN')
  }, 30_000)

  it('a click chooses any country, and "Not set" clears it', async () => {
    const onChange = vi.fn()
    render(<Field initial="IN" allowClear onChange={onChange} />)
    await userEvent.click(screen.getByTestId('g-country'))
    expect(options()[0]).toBe('Not set')
    expect(options()[1]).toBe('India')
    await userEvent.click(screen.getByRole('option', { name: 'Not set' }))
    expect(onChange).toHaveBeenLastCalledWith('')
    expect(screen.getByTestId('g-country').textContent).toBe('Choose')
    await userEvent.click(screen.getByTestId('g-country'))
    await userEvent.type(screen.getByTestId('g-country-search'), 'icel')
    await userEvent.click(screen.getByRole('option', { name: 'Iceland' }))
    expect(onChange).toHaveBeenLastCalledWith('IS')
  }, 30_000)

  it('a stored code not in the list still shows', () => {
    render(<Field initial="xk" />)
    expect(screen.getByTestId('g-country').textContent).toBe('XK')
  })
})
