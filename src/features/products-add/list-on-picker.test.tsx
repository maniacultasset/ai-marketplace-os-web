import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { DRAFTS_BEFORE_CONNECT, draftClosedReason, draftOpen } from '@/features/marketplaces/meta'
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
