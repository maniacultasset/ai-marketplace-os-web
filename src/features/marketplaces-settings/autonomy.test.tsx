import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'

// The owner approval card reads the brand; it has its own tests (team-account/owner-approval-setting.test.tsx).
vi.mock('@/features/team-account/owner-approval-setting', () => ({ OwnerApprovalSetting: () => <div data-testid="owner-approval" /> }))

const { AutonomySettings } = await import('./autonomy')

afterEach(cleanup)

describe('AutonomySettings', () => {
  it('describes the live auto-fix (prod QA 9 Nov: it said Coming soon while SI11 runs)', () => {
    render(
      <TooltipProvider>
        <AutonomySettings />
      </TooltipProvider>,
    )
    const fixes = screen.getByTestId('autonomy-auto-fix')
    expect(fixes.textContent).not.toContain('Coming soon')
    const modes = [...fixes.querySelectorAll('li')].map((li) => li.getAttribute('data-mode'))
    expect(modes).toEqual(['auto', 'auto', 'planned', 'planned', 'approval'])
    expect(fixes.textContent).toContain('On its own')
    expect(fixes.textContent).toContain('You approve')
    expect(screen.getByTestId('autonomy-retry').textContent).toContain('3 automatic tries, then the agent stops and asks you.')
    expect(screen.queryAllByRole('switch')).toHaveLength(0)
    expect(screen.getByTestId('owner-approval')).toBeTruthy()
  })
})
