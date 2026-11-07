import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AutoFix } from './auto-fix-model'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, params, hash, children, ...rest }: { to: string; params?: Record<string, string>; hash?: string; children: ReactNode }) => {
    const path = Object.entries(params ?? {}).reduce((p, [k, v]) => p.replace(`$${k}`, v), to)
    return (
      <a href={`${path}${hash ? `#${hash}` : ''}`} {...rest}>
        {children}
      </a>
    )
  },
}))

const { FixedForYouCard, AutoFixedChip } = await import('./auto-fix')

afterEach(cleanup)

const fix = (n: number, over: Partial<AutoFix> = {}): AutoFix => ({
  id: `f${n}`,
  problem: 'Title is 212 characters; the limit is 200.',
  change: 'Shortened the title at a word boundary from 212 to 198 characters to fit the 200-character limit.',
  field: 'Title',
  fieldPath: 'content.title',
  at: '2026-11-07T09:00:01Z',
  rewritten: false,
  ...over,
})

describe('FixedForYouCard', () => {
  it('is absent when Kuinn fixed nothing', () => {
    const { container } = render(<FixedForYouCard fixes={[]} />)
    expect(container.innerHTML).toBe('')
    expect(screen.queryByTestId('fixed-for-you')).toBeNull()
  })

  it('starts as one summary line, and opens to the full trail', async () => {
    render(<FixedForYouCard fixes={[fix(1), fix(2, { field: 'Bullet 2', rewritten: true, change: 'Rewrote bullet 2 to fit the limit.' })]} />)
    const toggle = screen.getByTestId('fixed-for-you-toggle')
    expect(screen.getByTestId('fixed-for-you-summary').textContent).toBe('2 issues fixed for you')
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(screen.getByTestId('fixed-for-you-list').closest('[hidden]')).not.toBeNull()

    await userEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByTestId('fixed-for-you-list').closest('[hidden]')).toBeNull()
    const items = screen.getAllByTestId('fixed-for-you-item')
    expect(items).toHaveLength(2)
    expect(items[0]!.textContent).toContain('Title')
    expect(items[0]!.textContent).toContain('Title is 212 characters; the limit is 200.')
    expect(items[0]!.textContent).toContain('Shortened the title at a word boundary')
    // Only the AI rewrite carries the agent label.
    expect(items[0]!.textContent).not.toContain('Rewritten by the agent')
    expect(items[1]!.textContent).toContain('Rewritten by the agent')
  })

  it('opens at once when linked to from a chip', () => {
    render(<FixedForYouCard fixes={[fix(1)]} defaultOpen />)
    expect(screen.getByTestId('fixed-for-you-toggle').getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByTestId('fixed-for-you-summary').textContent).toBe('1 issue fixed for you')
    expect(screen.getByTestId('fixed-for-you').id).toBe('fixed-for-you')
  })

  it('says when the trail could not be read, with a retry', async () => {
    const retry = vi.fn()
    render(<FixedForYouCard fixes={[]} error={new Error('boom')} onRetry={retry} />)
    expect(screen.getByTestId('fixed-for-you-error').textContent).toContain('Couldn’t load what Kuinn fixed')
    await userEvent.click(screen.getByRole('button', { name: /try again|retry/i }))
    expect(retry).toHaveBeenCalled()
  })
})

describe('AutoFixedChip', () => {
  it('renders nothing for zero fixes', () => {
    const { container } = render(<AutoFixedChip listingId="l1" count={0} />)
    expect(container.innerHTML).toBe('')
  })

  it('links to the review’s Fixed for you section', () => {
    render(<AutoFixedChip listingId="l1" count={2} />)
    const chip = screen.getByTestId('auto-fixed-chip')
    expect(chip.textContent).toBe('2 auto-fixed')
    expect(chip.getAttribute('href')).toBe('/listings/l1/review#fixed-for-you')
    expect(chip.getAttribute('aria-label')).toBe('2 issues fixed for you. See what changed.')
  })
})
