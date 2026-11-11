import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { GTIN_EXEMPTION_NEEDS, GTIN_EXEMPTION_URL, GtinExemptionHelp } from './gtin-exemption'
import { isSellerCentralLink } from './seller-central'

afterEach(cleanup)

describe('isSellerCentralLink', () => {
  it('takes only an https Seller Central India link', () => {
    expect(isSellerCentralLink(GTIN_EXEMPTION_URL)).toBe(true)
    expect(isSellerCentralLink('https://sellercentral.amazon.in/help/hub/reference/G200426310')).toBe(true)
  })

  it.each([
    'http://sellercentral.amazon.in/help/hub/reference/G200426310',
    'https://sellercentral.amazon.in.evil.example/help',
    'https://evil.example/?u=https://sellercentral.amazon.in',
    'https://user@sellercentral.amazon.in/help',
    'https://sellercentral.amazon.in:8443/help',
    'https://sellercentral-europe.amazon.com/help',
    'javascript:alert(1)',
    'not a url',
    `https://sellercentral.amazon.in/${'a'.repeat(2048)}`,
  ])('refuses %s', (href) => {
    expect(isSellerCentralLink(href)).toBe(false)
  })
})

describe('GtinExemptionHelp', () => {
  it("links to Amazon India's GTIN exemption page in a new tab and says what it needs", () => {
    render(<GtinExemptionHelp />)
    const link = screen.getByRole('link', { name: /How to get a GTIN exemption/ })
    expect(link.getAttribute('href')).toBe('https://sellercentral.amazon.in/help/hub/reference/G200426310')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
    expect(link.textContent).toContain('opens Amazon Seller Central in a new tab')
    expect(screen.getByTestId('gtin-exemption-help').textContent).toContain(GTIN_EXEMPTION_NEEDS)
    expect(GTIN_EXEMPTION_NEEDS).toMatch(/brand name/)
    expect(GTIN_EXEMPTION_NEEDS).toMatch(/category/)
    expect(GTIN_EXEMPTION_NEEDS).toMatch(/photos/)
  })
})
