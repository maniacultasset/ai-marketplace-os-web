import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { comingSoon, comingSoonReason, DRAFTS_BEFORE_CONNECT, draftClosedReason, draftOpen, openForDrafts } from '@/features/marketplaces/meta'
import { firstListable } from './catalog-model'
import { ListOnPicker } from './list-on'

afterEach(cleanup)

const picker = (connected: ('amazon' | 'flipkart')[] | null, value: ('amazon' | 'flipkart')[] = []) =>
  render(
    <TooltipProvider>
      <ListOnPicker value={value} onChange={vi.fn()} connected={connected} />
    </TooltipProvider>,
  )

describe('draftOpen', () => {
  it('Amazon drafts can start before connecting; Flipkart only once it is connected', () => {
    expect(DRAFTS_BEFORE_CONNECT).toEqual({ amazon: true, flipkart: false })
    expect(draftOpen('amazon', [])).toBe(true)
    expect(draftOpen('flipkart', [])).toBe(false)
    expect(draftOpen('flipkart', null)).toBe(false)
    expect(draftOpen('flipkart', ['flipkart'])).toBe(true)
    expect(draftClosedReason('flipkart')).toBe('Connecting Flipkart is coming soon. Flipkart drafts open once it is connected.')
  })
  it('Flipkart reads Coming soon until the brand has it connected; Amazon never does', () => {
    expect(comingSoon('flipkart', [])).toBe(true)
    expect(comingSoon('flipkart', null)).toBe(true)
    expect(comingSoon('flipkart', ['flipkart'])).toBe(false)
    expect(comingSoon('amazon', [])).toBe(false)
    expect(comingSoonReason('flipkart')).toBe('Publishing to Flipkart is coming soon. Kuinn lists on Amazon for now.')
  })
})

describe('ListOnPicker', () => {
  it('shows Flipkart as Coming soon, not choosable, while it is not connected', () => {
    picker(['amazon'])
    expect(screen.getByRole('checkbox', { name: 'Amazon' })).toBeTruthy()
    expect(screen.queryByRole('checkbox', { name: /Flipkart/ })).toBeNull()
    const closed = screen.getByTestId('list-on-closed-flipkart')
    expect(closed.textContent).toContain('Coming soon')
    expect(closed.parentElement?.getAttribute('aria-disabled')).toBe('true')
  })

  it('is titled Sell on and shows the four roadmap marketplaces the same way, never choosable', () => {
    picker(['amazon'])
    expect(screen.getByRole('group', { name: 'Sell on' })).toBeTruthy()
    for (const [id, name] of [['myntra', 'Myntra'], ['ajio', 'AJIO'], ['meesho', 'Meesho'], ['nykaa', 'Nykaa']] as const) {
      const pill = screen.getByTestId(`list-on-roadmap-${id}`)
      expect(pill.textContent).toBe(`${name}On the roadmap`)
      expect(screen.queryByRole('checkbox', { name: new RegExp(name) })).toBeNull()
    }
  })

  it('lets a brand with Flipkart connected choose it', () => {
    picker(['amazon', 'flipkart'], ['flipkart'])
    expect(screen.getByRole('checkbox', { name: 'Flipkart' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.queryByTestId('list-on-closed-flipkart')).toBeNull()
  })

  it('still offers Amazon before it is connected', () => {
    picker([])
    expect(screen.getByRole('checkbox', { name: 'Amazon (not connected)' })).toBeTruthy()
  })
})

describe('openForDrafts and firstListable', () => {
  it('drops Flipkart from a choice while it is not connected', () => {
    expect(openForDrafts(['amazon', 'flipkart'], ['amazon'])).toEqual(['amazon'])
    expect(openForDrafts(['flipkart'], null)).toEqual([])
    expect(openForDrafts(['flipkart'], ['flipkart'])).toEqual(['flipkart'])
  })
  it('the header "List on" never offers Flipkart before it is connected', () => {
    expect(firstListable({}, [])).toBe('amazon')
    expect(firstListable({ amazon: {} }, [])).toBeNull()
    expect(firstListable({ amazon: {} }, ['flipkart'])).toBe('flipkart')
  })
})
