import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { MoreMarketplaces } from './product-detail-page'

afterEach(cleanup)

describe('More marketplaces', () => {
  it('reads On the roadmap with one disabled waitlist action for all four, as on the landing page', () => {
    render(
      <TooltipProvider>
        <MoreMarketplaces />
      </TooltipProvider>,
    )
    for (const [id, name] of [['myntra', 'Myntra'], ['ajio', 'AJIO'], ['meesho', 'Meesho'], ['nykaa', 'Nykaa Fashion']] as const) {
      const row = screen.getByTestId(`more-marketplaces-${id}`)
      expect(row.textContent).toContain('On the roadmap')
      expect(row.textContent).not.toContain('Coming soon')
      expect(row.textContent).not.toContain('Not available')
      const join = screen.getByRole('button', { name: `Join waitlist for ${name}` })
      expect(join.getAttribute('aria-disabled')).toBe('true')
    }
  })
})
