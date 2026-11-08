import { act, cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...rest }: { to: string; children: ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}))

const me = vi.hoisted(() => ({ data: {} as Record<string, unknown> | undefined, dataUpdatedAt: 1 }))
vi.mock('@/lib/auth', () => ({ useMe: () => me }))

const { AiPausedBanner, TrialChip } = await import('./shell-notices')
const { clearAiPausedMark, markAiPaused } = await import('./model')

afterEach(() => {
  cleanup()
  clearAiPausedMark()
})

const wrap = (ui: ReactNode) => render(<TooltipProvider>{ui}</TooltipProvider>)

describe('AiPausedBanner', () => {
  it('shows one calm line while /auth/me says AI is paused', () => {
    me.data = { ai_paused: true }
    wrap(<AiPausedBanner />)
    expect(screen.getByText('AI drafting is paused. Your work is saved.')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('shows nothing on an older backend or when AI runs', () => {
    me.data = {}
    const view = wrap(<AiPausedBanner />)
    expect(view.container.textContent).toBe('')
    me.data = { ai_paused: false }
    view.rerender(
      <TooltipProvider>
        <AiPausedBanner />
      </TooltipProvider>,
    )
    expect(screen.queryByTestId('ai-paused-banner')).toBeNull()
  })

  it('shows at once after a generate is refused, before /auth/me is read again', () => {
    me.data = { ai_paused: false }
    me.dataUpdatedAt = 1
    wrap(<AiPausedBanner />)
    expect(screen.queryByTestId('ai-paused-banner')).toBeNull()
    act(() => markAiPaused(5))
    expect(screen.getByTestId('ai-paused-banner')).toBeTruthy()
  })
})

describe('TrialChip', () => {
  it('counts the days left of the trial', () => {
    me.data = { trial_ends_at: new Date(Date.now() + 5 * 86_400_000 - 60_000).toISOString() }
    wrap(<TrialChip />)
    expect(screen.getByTestId('trial-chip').textContent).toBe('Trial: 5 days left')
  })

  it('is hidden when the brand is not on trial', () => {
    me.data = { trial_ends_at: null }
    wrap(<TrialChip />)
    expect(screen.queryByTestId('trial-chip')).toBeNull()
  })
})
