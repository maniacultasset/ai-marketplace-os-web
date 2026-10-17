import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it } from 'vitest'
import { MARKETPLACES } from '@/components/la/marketplace'
import { HeroFinding } from './hero-finding'
import { DESCRIBES_YOU, HERO_EXAMPLE, heroFindings, heroTitleLength, MARKET_STATUS, signupChip, STAGE_CHIP } from './model'
import { Ph, POLICY_SECTIONS } from './privacy-policy'

describe('hero example (seeded kurta-set rules)', () => {
  // jsdom has no matchMedia; the length count-up asks for it. Report reduced motion so the real
  // value renders at once.
  beforeAll(() => {
    window.matchMedia ??= ((query: string) => ({
      matches: query.includes('reduce'),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as typeof window.matchMedia
  })
  it('has a title that passes Amazon’s 200 limit but breaks Flipkart’s 150', () => {
    const len = heroTitleLength()
    expect(len).toBeGreaterThan(HERO_EXAMPLE.limits.flipkart)
    expect(len).toBeLessThanOrEqual(HERO_EXAMPLE.limits.amazon)
  })
  it('derives exactly the findings the rules would raise', () => {
    const f = heroFindings()
    expect(f.map((x) => `${x.marketplace}:${x.code}`)).toEqual(['flipkart:FIELD_TOO_LONG', 'amazon:BANNED_TERM', 'flipkart:BANNED_TERM'])
    expect(f[0]?.message).toContain(String(heroTitleLength()))
  })
  it('renders as a labelled example with no interactive controls', () => {
    render(<HeroFinding />)
    expect(screen.getByText('Example')).toBeTruthy()
    expect(screen.getByText(/illustrative example/i)).toBeTruthy()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.queryAllByRole('link')).toHaveLength(0)
    expect(screen.getByText(`${heroTitleLength()} / ${HERO_EXAMPLE.limits.flipkart} characters`)).toBeTruthy()
  })
})

describe('marketplace status', () => {
  it('never claims a marketplace is live', () => {
    for (const m of MARKET_STATUS) expect(STAGE_CHIP[m.stage].status).not.toBe('live')
  })
  it('puts Amazon in setup, Flipkart pending and every unsupported marketplace under Later', () => {
    const stageOf = (id: string) => MARKET_STATUS.find((m) => m.ids.includes(id as never))?.stage
    expect(stageOf('amazon')).toBe('in-setup')
    expect(stageOf('flipkart')).toBe('pending')
    for (const m of MARKETPLACES.filter((x) => !x.supported)) expect(stageOf(m.id)).toBe('later')
  })
})

describe('sign-up', () => {
  it('maps every request status to a glyph chip with its own word', () => {
    expect(signupChip('pending')).toEqual({ status: 'working', label: 'Waiting for review' })
    expect(signupChip('approved').status).toBe('live')
    expect(signupChip('rejected').status).toBe('error')
  })
  it('keeps the five p01 options', () => {
    expect(DESCRIBES_YOU).toHaveLength(5)
  })
})

describe('privacy policy', () => {
  it('has unique anchor ids and the sections DPDP readers look for', () => {
    const ids = POLICY_SECTIONS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ['data-we-collect', 'ai-processing', 'retention', 'cookies', 'your-rights', 'grievance-officer']) {
      expect(ids).toContain(id)
    }
  })
  it('renders placeholders visibly', () => {
    render(<Ph>contact email</Ph>)
    expect(screen.getByText('[PLACEHOLDER: contact email]')).toBeTruthy()
  })
})
