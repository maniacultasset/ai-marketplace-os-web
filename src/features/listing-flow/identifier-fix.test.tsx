import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { identifierMissing, rollUpGates, type ErrorItem, type GateResult } from './gates'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, params, search, children, ...rest }: { to: string; params?: Record<string, string>; search?: Record<string, string>; children: ReactNode }) => {
    const path = Object.entries(params ?? {}).reduce((p, [k, v]) => p.replace(`$${k}`, v), to)
    const q = search ? `?${new URLSearchParams(search).toString()}` : ''
    return (
      <a href={`${path}${q}`} {...rest}>
        {children}
      </a>
    )
  },
}))

const { IdentifierFix } = await import('./identifier-fix')

afterEach(cleanup)

const missing = (field: string, sku = 'KS-1'): ErrorItem => ({
  field,
  error_code: 'IDENTIFIER_MISSING',
  error_class: 'identifier_error',
  severity: 'error',
  source: 'amazon_adapter',
  message: `Amazon needs a barcode (EAN, UPC or GTIN) for ${sku}, or mark it GTIN-exempt if Amazon approved an exemption for your brand.`,
  raw_code: null,
  retryable: false,
  auto_fixable: false,
})

/** The Identity gate as the review screen rolls it up from an adapter preview. */
const identity = (errors: ErrorItem[]): GateResult =>
  rollUpGates({
    listing: { status: 'draft', status_reason: null, marketplace_state: null, current_version_id: 'v1' } as never,
    validation: null,
    rules: null,
    preview: { errors, productType: 'KURTA' },
    marketplaceName: 'Amazon',
  }).find((g) => g.id === 'identity')!

describe('identifierMissing', () => {
  it('is the blocked Identity gate with IDENTIFIER_MISSING, naming the variants it lists', () => {
    expect(identifierMissing(identity([missing('facts.identifier')]))).toEqual({ skus: [] })
    expect(identifierMissing(identity([missing('variants[KS-1-M].facts.identifier'), missing('variants[KS-1-L].facts.identifier')]))).toEqual({
      skus: ['KS-1-M', 'KS-1-L'],
    })
  })

  it('is null for other identity problems or a gate that is not blocked', () => {
    expect(identifierMissing(identity([{ ...missing('facts.identifier'), error_code: 'IDENTIFIER_INVALID' }]))).toBeNull()
    expect(identifierMissing(identity([]))).toBeNull()
    expect(identifierMissing(undefined)).toBeNull()
  })
})

describe('IdentifierFix (review screen, Identity gate)', () => {
  it('says the plain reason and opens the product at the barcode choice', () => {
    render(<IdentifierFix gate={identity([missing('facts.identifier')])} productId="p1" marketplace="amazon" canEdit canEditVariants />)
    expect(screen.getByTestId('identity-fix').textContent).toContain(
      'Amazon needs a barcode (EAN, UPC or GTIN) to create this listing, or a GTIN exemption if Amazon approved one for your brand.',
    )
    const action = screen.getByRole('link', { name: 'Add barcode or exemption' })
    expect(action.getAttribute('href')).toBe('/products/p1?edit=barcode')
  })

  it('names up to three variant SKUs and counts the rest', () => {
    const skus = ['A-S', 'A-M', 'A-L', 'A-XL', 'A-XXL']
    render(<IdentifierFix gate={identity(skus.map((s) => missing(`variants[${s}].facts.identifier`, s)))} productId="p1" marketplace="amazon" canEdit canEditVariants />)
    expect(screen.getByTestId('identity-fix').textContent).toContain('Missing on A-S, A-M, A-L and 2 more.')
  })

  it('for variants opens the variants step, where each variant has its barcode cell', () => {
    render(<IdentifierFix gate={identity([missing('variants[KS-1-M].facts.identifier', 'KS-1-M')])} productId="p1" marketplace="amazon" canEdit canEditVariants />)
    const action = screen.getByRole('link', { name: 'Add barcodes or exemption' })
    expect(action.getAttribute('href')).toBe('/add/variants?product=p1&on=amazon')
  })

  it('for variants offers no action to someone who cannot change variants', () => {
    render(<IdentifierFix gate={identity([missing('variants[KS-1-M].facts.identifier', 'KS-1-M')])} productId="p1" marketplace="amazon" canEdit canEditVariants={false} />)
    expect(screen.getByTestId('identity-fix').textContent).toContain('Missing on KS-1-M.')
    expect(screen.queryByTestId('identity-fix-action')).toBeNull()
  })

  it('keeps the reason but offers no action to someone who cannot edit products', () => {
    render(<IdentifierFix gate={identity([missing('facts.identifier')])} productId="p1" marketplace="amazon" canEdit={false} canEditVariants={false} />)
    expect(screen.getByTestId('identity-fix')).toBeTruthy()
    expect(screen.queryByTestId('identity-fix-action')).toBeNull()
  })

  it("links to Amazon India's GTIN exemption page and says what it needs, even with no edit action", () => {
    render(<IdentifierFix gate={identity([missing('facts.identifier')])} productId="p1" marketplace="amazon" canEdit={false} canEditVariants={false} />)
    const link = screen.getByRole('link', { name: /How to get a GTIN exemption/ })
    expect(link.getAttribute('href')).toBe('https://sellercentral.amazon.in/help/hub/reference/G200426310')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(screen.getByTestId('identity-fix').textContent).toContain('Amazon asks for the brand name, the category and photos of the product and its pack.')
  })

  it('shows no Amazon exemption link for another marketplace', () => {
    render(<IdentifierFix gate={identity([missing('facts.identifier')])} productId="p1" marketplace="flipkart" canEdit canEditVariants />)
    expect(screen.queryByTestId('identity-fix-exemption-help')).toBeNull()
  })

  it('renders nothing when the Identity gate is not blocked by a missing barcode', () => {
    const { container } = render(<IdentifierFix gate={identity([])} productId="p1" marketplace="amazon" canEdit canEditVariants />)
    expect(container.innerHTML).toBe('')
  })
})
