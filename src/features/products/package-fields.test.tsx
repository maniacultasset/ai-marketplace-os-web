import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { PackageFields } from './seller-field-inputs'
import { emptyPackage } from './seller-fields'

afterEach(cleanup)

describe('PackageFields copy', () => {
  it('says it is the packed box as shipped, not the product, and why Amazon needs it', () => {
    render(<PackageFields id="p" value={emptyPackage()} onChange={() => {}} errors={{}} />)
    const size = screen.getByText(/The packed box as you ship it, not the product itself/)
    expect(size.textContent).toMatch(/in cm/)
    expect(size.textContent).toMatch(/Amazon uses it for shipping and fees/)
    const weight = screen.getByText(/The packed box with the product inside, in grams/)
    expect(weight.textContent).toMatch(/Amazon uses it for shipping and fees/)
    expect(screen.getByLabelText('Packed box weight in grams')).toBeTruthy()
    expect(screen.getByText('Packed box: size')).toBeTruthy()
    expect(screen.getAllByText('cm')).toHaveLength(3)
    expect(screen.getByText('g')).toBeTruthy()
  })
})

describe('PackageFields plausibility (item 15)', () => {
  it('warns under the field for a likely unit slip, without an error', () => {
    const box = { length: '140', breadth: '120', height: '30', weight: '25000' }
    render(<PackageFields id="p" value={box} onChange={() => {}} errors={{}} category="tshirts" />)
    expect(screen.getByText('A 140 cm side is 1.4 m long. Did you mean 140 mm (14 cm)?')).toBeTruthy()
    expect(screen.getByText('This box weighs 25 kg. Did you mean 25 g?')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByLabelText('Packed box weight in grams').getAttribute('aria-invalid')).toBeNull()
  })
  it('stays quiet for a sensible box', () => {
    const box = { length: '30', breadth: '25', height: '3', weight: '250' }
    const { container } = render(<PackageFields id="p" value={box} onChange={() => {}} errors={{}} category="tshirts" />)
    expect(container.querySelector('[data-package-warning]')).toBeNull()
  })
})

describe('PackageFields for the product itself (item 15)', () => {
  it('labels the product apart from the packed box, keys its errors item.*, and never warns about a box', () => {
    const item = { length: '140', breadth: '120', height: '30', weight: '25000' }
    render(<PackageFields kind="item" id="i" value={item} onChange={() => {}} errors={{ 'item.weight': 'Enter the weight in whole grams, from 1 to 20,00,000.' }} category="tshirts" />)
    expect(screen.getByText('Product itself: size')).toBeTruthy()
    expect(screen.getByText('Product itself: weight')).toBeTruthy()
    expect(screen.getByText(/The product out of its box/)).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Product size in cm' })).toBeTruthy()
    expect(screen.getByLabelText('Product weight in grams').getAttribute('aria-invalid')).toBe('true')
    expect(screen.queryByText(/Packed box/)).toBeNull()
    expect(document.querySelector('[data-package-warning]')).toBeNull()
  })
})
