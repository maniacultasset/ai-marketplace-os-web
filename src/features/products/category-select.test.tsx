import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CatalogCategory } from './catalog-categories'
import { UNMAPPED_CATEGORY_HINT } from './category-options'
import { CategoryCodes, CategorySelect, NOT_LISTED_NOTE } from './category-select'

// cmdk (the category search) measures its list; jsdom has no ResizeObserver.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver

beforeEach(() => {
  Element.prototype.scrollIntoView ??= () => {}
})
afterEach(cleanup)

function Harness({ catalog, onChange = vi.fn() }: { catalog?: CatalogCategory[] | null; onChange?: (s: string) => void }) {
  const [value, setValue] = useState('')
  const [notListed, setNotListed] = useState(false)
  return (
    <CategorySelect
      id="c"
      value={value}
      onChange={(s) => {
        setValue(s)
        setNotListed(false)
        onChange(s)
      }}
      lampsEnabled={false}
      catalog={catalog}
      notListed={notListed}
      onNotListed={() => {
        setValue('')
        setNotListed(true)
      }}
    />
  )
}

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

  it('client feedback 17 Nov: groups the list and finds a category by another word', async () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    await userEvent.click(screen.getByTestId('c-trigger'))
    const headings = [...document.querySelectorAll('[cmdk-group-heading]')].map((h) => h.textContent)
    expect(headings).toEqual(['Topwear', 'Bottomwear', 'Ethnic'])
    expect(screen.getByRole('option', { name: 'Track pants' })).toBeTruthy()
    await userEvent.type(screen.getByPlaceholderText('Search categories'), 'denim')
    const options = screen.getAllByRole('option').map((o) => o.textContent)
    expect(options).toEqual(['Jeans', 'My category isn’t here'])
    await userEvent.click(screen.getByRole('option', { name: 'Jeans' }))
    expect(onChange).toHaveBeenCalledWith('jeans')
    expect(screen.getByTestId('c-trigger').textContent).toContain('Jeans')
  })

  it('uses the backend group, and a slug map when the backend sends none', async () => {
    const catalog: CatalogCategory[] = [
      { category: 'tshirts', label: 'T-shirts', enabled: true },
      { category: 'jeans', label: 'Jeans', enabled: true },
      { category: 'sarees', label: 'Sarees', enabled: true, group: 'ethnic' },
    ]
    render(<Harness catalog={catalog} />)
    await userEvent.click(screen.getByTestId('c-trigger'))
    const groups = [...document.querySelectorAll('[cmdk-group]')].filter((g) => g.querySelector('[cmdk-group-heading]'))
    expect(groups.map((g) => [g.querySelector('[cmdk-group-heading]')!.textContent, within(g as HTMLElement).getAllByRole('option').map((o) => o.textContent)])).toEqual([
      ['Topwear', ['T-shirts']],
      ['Bottomwear', ['Jeans']],
      ['Ethnic', ['Sarees']],
    ])
  })

  it('"My category isn’t here" leaves the category empty and shows a calm note', async () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    await userEvent.click(screen.getByTestId('c-trigger'))
    await userEvent.click(screen.getByTestId('category-not-listed'))
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByTestId('c-not-listed-note').textContent).toBe(NOT_LISTED_NOTE)
    expect(screen.getByTestId('c-trigger').textContent).toContain('My category isn’t here')
    // Picking a category afterwards clears the note.
    await userEvent.click(screen.getByTestId('c-trigger'))
    await userEvent.click(screen.getByRole('option', { name: 'Shorts' }))
    expect(screen.queryByTestId('c-not-listed-note')).toBeNull()
  })

  it('offers no "My category isn’t here" unless the form can save without a category', async () => {
    render(<CategorySelect id="c" value="" onChange={vi.fn()} lampsEnabled={false} />)
    await userEvent.click(screen.getByTestId('c-trigger'))
    expect(screen.queryByTestId('category-not-listed')).toBeNull()
  })
})

describe('CategoryCodes', () => {
  it('lists the CSV code for each category, with lamps only while their switch is on', () => {
    const view = render(<CategoryCodes lampsEnabled={false} />)
    const list = screen.getByTestId('category-codes')
    expect(list.querySelectorAll('li')).toHaveLength(7)
    expect(list.textContent).toContain('Kurta setsethnic_wear_kurta_sets')
    expect(list.textContent).toContain('Track pantstrack_pants')
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
