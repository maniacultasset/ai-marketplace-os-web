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
    expect(screen.getByLabelText('Package weight in grams')).toBeTruthy()
    expect(screen.getAllByText('cm')).toHaveLength(3)
    expect(screen.getByText('g')).toBeTruthy()
  })
})
