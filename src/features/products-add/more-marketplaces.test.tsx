import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { MoreMarketplaces } from './product-detail-page'

afterEach(cleanup)

describe('More marketplaces', () => {
  it('shows Meesho as Coming soon, like Sell on, and keeps the others not available', () => {
    render(
      <TooltipProvider>
        <MoreMarketplaces />
      </TooltipProvider>,
    )
    const rows = screen.getByTestId('more-marketplaces').querySelectorAll('li')
    const row = (name: string) => [...rows].find((r) => r.textContent!.startsWith(name))?.textContent ?? ''
    const text: Record<string, string> = { Meesho: row('Meesho'), Myntra: row('Myntra'), AJIO: row('AJIO'), 'Nykaa Fashion': row('Nykaa') }
    expect(text.Meesho).toContain('Meesho')
    expect(screen.getByTestId('more-marketplaces-soon-meesho').textContent).toBe('Coming soon')
    expect(text.Meesho).not.toContain('Join waitlist')
    for (const name of ['Myntra', 'AJIO', 'Nykaa Fashion']) {
      expect(text[name]).toContain('Not available')
      expect(text[name]).toContain('Join waitlist')
    }
  })
})
