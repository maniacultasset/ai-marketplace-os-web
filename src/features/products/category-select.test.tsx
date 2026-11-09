import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { UNMAPPED_CATEGORY_HINT } from './category-options'
import { CategoryCodes, CategorySelect } from './category-select'

afterEach(cleanup)

describe('CategorySelect', () => {
  it('is a dropdown, not a text field, with a plain placeholder', () => {
    render(<CategorySelect id="c" value="" onChange={vi.fn()} lampsEnabled={false} />)
    const trigger = screen.getByRole('combobox', { name: /Category/ })
    expect(trigger.textContent).toContain('Choose a category')
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('shows the plain name of the chosen category', () => {
    render(<CategorySelect id="c" value="tshirts" onChange={vi.fn()} lampsEnabled={false} />)
    expect(screen.getByRole('combobox', { name: /Category/ }).textContent).toContain('T-shirts')
  })

  it('says when an old value has no template', () => {
    render(<CategorySelect id="c" value="kurtas" onChange={vi.fn()} lampsEnabled={false} />)
    expect(screen.getByText(UNMAPPED_CATEGORY_HINT)).toBeTruthy()
  })
})

describe('CategoryCodes', () => {
  it('lists the CSV code for each category, with lamps only while their switch is on', () => {
    const view = render(<CategoryCodes lampsEnabled={false} />)
    const list = screen.getByTestId('category-codes')
    expect(list.querySelectorAll('li')).toHaveLength(2)
    expect(list.textContent).toContain('Kurta setsethnic_wear_kurta_sets')
    expect(list.textContent).toContain('T-shirtstshirts')
    expect(list.textContent).not.toContain('home_decor_lamps')
    view.rerender(<CategoryCodes lampsEnabled />)
    expect(screen.getByTestId('category-codes').textContent).toContain('home_decor_lamps')
  })

  it('holds its place while the lamps switch is read', () => {
    render(<CategoryCodes lampsEnabled={null} />)
    const list = screen.getByTestId('category-codes')
    expect(list.getAttribute('aria-busy')).toBe('true')
    expect(list.querySelectorAll('li')).toHaveLength(2)
  })
})
