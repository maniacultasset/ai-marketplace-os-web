import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'

// The owner approval card reads the brand; it has its own tests (team-account/owner-approval-setting.test.tsx).
vi.mock('@/features/team-account/owner-approval-setting', () => ({ OwnerApprovalSetting: () => <div data-testid="owner-approval" /> }))
// The auto-fix card reads the brand too; it has its own tests (./auto-fix-setting.test.tsx).
vi.mock('./auto-fix-setting', () => ({ AutoFixSetting: () => <div data-testid="autonomy-auto-fix" /> }))

const { AutonomySettings } = await import('./autonomy')

afterEach(cleanup)

describe('AutonomySettings', () => {
  it('describes the live auto-fix (prod QA 9 Nov: it said Coming soon while SI11 runs)', () => {
    render(
      <TooltipProvider>
        <AutonomySettings />
      </TooltipProvider>,
    )
    expect(screen.getByTestId('autonomy-auto-fix')).toBeTruthy()
    expect(screen.getByTestId('autonomy-retry').textContent).toContain('3 automatic tries, then the agent stops and asks you.')
    expect(screen.queryAllByRole('switch')).toHaveLength(0)
    expect(screen.getByTestId('owner-approval')).toBeTruthy()
  })
})
