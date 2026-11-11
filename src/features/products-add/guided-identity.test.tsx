import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...rest }: { to: string; children: ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
  useNavigate: () => vi.fn(),
}))
vi.mock('@/lib/auth', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth')>()),
  useSession: () => ({ tenantId: 't1', userId: 'u1' }),
  useMe: () => ({ data: undefined }),
}))
vi.mock('@/lib/permissions', async (orig) => ({ ...(await orig<typeof import('@/lib/permissions')>()), useCan: () => () => true }))
vi.mock('@/features/ai-credit/use-ai-paused', () => ({ useAiPaused: () => false }))
let suggestOn = false
let lampsOn = false
vi.mock('@/features/assist/flags', async (orig) => ({
  ...(await orig<object>()),
  useCategorySuggestEnabled: () => suggestOn,
  useLampsEnabled: () => ({ enabled: lampsOn, pending: false }),
}))
vi.mock('@/api/client', async (orig) => ({
  ...(await orig<typeof import('@/api/client')>()),
  api: { GET: () => new Promise(() => {}), POST: () => new Promise(() => {}) },
}))

const { GuidedForm } = await import('./guided-form')

function setup(listOn: ('amazon' | 'flipkart')[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        <GuidedForm listOn={listOn} />
      </TooltipProvider>
    </QueryClientProvider>,
  )
}

const labelOf = (id: string) => document.querySelector(`label[for="${id}"]`)!

beforeEach(() => {
  localStorage.clear()
  suggestOn = false
  lampsOn = false
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})
afterEach(cleanup)

describe('Guided form identity: required marks and the barcode', () => {
  it('marks the product name and SKU as required from the first visit, and the style number stays optional', () => {
    setup([])
    expect(labelOf('g-title').querySelector('[data-slot="field-required"]')?.textContent).toBe('Required')
    expect(labelOf('g-sku').querySelector('[data-slot="field-required"]')?.textContent).toBe('Required')
    expect(labelOf('g-style_number').querySelector('[data-slot="field-required"]')).toBeNull()
    // The accessible name stays the label; "Required" is read in the description.
    expect(screen.getByRole('textbox', { name: 'SKU' }).getAttribute('aria-describedby')).toBe('g-sku-hint')
    expect(document.getElementById('g-sku-hint')!.textContent).toMatch(/^Required\./)
  })

  it('keeps the calm first visit: leaving the empty name never turns it red', async () => {
    setup([])
    const name = screen.getByRole('textbox', { name: 'Product name' })
    await userEvent.click(name)
    await userEvent.tab()
    expect(name.getAttribute('aria-invalid')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('says "Needed for Amazon" on the barcode when Amazon is chosen, with the formats, before any save', () => {
    setup(['amazon'])
    const label = labelOf('g-barcode-value')
    expect(label.querySelector('[data-slot="field-required"]')?.textContent).toBe('Needed for Amazon')
    expect(screen.getByTestId('g-barcode-field').closest('div[data-needs-input]')).toBeNull()
    expect(screen.getByText(/GTIN-8, 12, 13 or 14: an EAN, UPC or GTIN from the pack\. Amazon needs one to create the listing\./)).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('has no Amazon mark when only Flipkart is chosen', () => {
    setup(['flipkart'])
    expect(labelOf('g-barcode-value').querySelector('[data-slot="field-required"]')).toBeNull()
  })

  it('offers the exemption as an explicit choice next to the barcode', async () => {
    setup(['amazon'])
    expect(screen.getByRole('radiogroup', { name: 'Barcode' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Has a barcode' })).toHaveProperty('checked', true)
    await userEvent.click(screen.getByRole('radio', { name: 'No barcode: my brand has an Amazon GTIN exemption' }))
    expect(document.getElementById('g-barcode-value')).toBeNull()
    expect(screen.getByText('Amazon approves GTIN exemptions per brand and category. Choose this only if yours is approved.')).toBeTruthy()
  })
})
