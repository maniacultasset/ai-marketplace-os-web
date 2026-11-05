import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MARKETPLACES, MarketplaceName, MarketplaceTile } from './marketplace'

describe('marketplace tile', () => {
  it('gives every marketplace its own bundled logo', () => {
    const logos = MARKETPLACES.map((m) => m.logo)
    expect(logos.every(Boolean)).toBe(true)
    expect(new Set(logos).size).toBe(MARKETPLACES.length)
    // bundled, never hot-linked from the marketplace's servers
    for (const logo of logos) expect(logo).not.toMatch(/^https?:\/\//)
  })

  it('renders the logo as decoration, raised for a supported marketplace', () => {
    const { container } = render(<MarketplaceTile id="amazon" />)
    const tile = container.querySelector('[data-slot="marketplace-tile"]')!
    expect(tile.getAttribute('aria-hidden')).toBe('true')
    expect(tile.className).toContain('shadow-raised-sm')
    expect(tile.hasAttribute('data-muted')).toBe(false)
    const img = tile.querySelector('img')!
    expect(img.getAttribute('alt')).toBe('')
    expect(img.className).not.toContain('saturate-50')
  })

  it('sits flat and softened when the marketplace is not available', () => {
    const { container } = render(<MarketplaceTile id="myntra" />)
    const tile = container.querySelector('[data-slot="marketplace-tile"]')!
    expect(tile.getAttribute('data-muted')).toBe('true')
    expect(tile.className).toContain('shadow-none')
    expect(tile.querySelector('img')!.className).toContain('saturate-50')
  })

  it('lets a caller mute a supported marketplace', () => {
    const { container } = render(<MarketplaceTile id="flipkart" unavailable />)
    expect(container.querySelector('[data-muted="true"]')).not.toBeNull()
  })

  it('keeps the visible name as the accessible label', () => {
    const { getByText } = render(<MarketplaceName id="nykaa" />)
    expect(getByText('Nykaa Fashion')).toBeTruthy()
  })
})
