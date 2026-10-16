import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { formatConfidence, sourceLabel } from './source-badge'
import { CHIP_META, StatusChip } from './status-chip'
import { Stepper } from './progress'

describe('status chip', () => {
  it('pairs every status with a glyph and a word', () => {
    for (const meta of Object.values(CHIP_META)) {
      expect(meta.glyph.length).toBeGreaterThan(0)
      expect(meta.label.length).toBeGreaterThan(0)
    }
    expect(new Set(Object.values(CHIP_META).map((m) => m.glyph)).size).toBe(Object.keys(CHIP_META).length)
  })
  it('names the icon-only variant for assistive tech', () => {
    render(
      <TooltipProvider>
        <StatusChip status="error" iconOnly label="Amazon: Error" />
      </TooltipProvider>,
    )
    expect(screen.getByRole('img', { name: 'Amazon: Error' })).toBeTruthy()
  })
})

describe('source badge', () => {
  it('always shows the agent confidence', () => {
    expect(sourceLabel({ kind: 'agent', confidence: 0.82, detail: 'from photos' })).toBe('Agent · from photos · 82%')
    expect(formatConfidence(94)).toBe('94%')
    expect(formatConfidence(0.5)).toBe('50%')
    expect(formatConfidence(140)).toBe('100%')
  })
})

describe('stepper', () => {
  it('marks done, current and upcoming steps', () => {
    render(<Stepper steps={[{ label: 'Brand' }, { label: 'Compliance' }, { label: 'Marketplaces' }]} current={1} />)
    const items = screen.getAllByRole('listitem')
    expect(items[0]!.textContent).toContain('(done)')
    expect(items[1]!.getAttribute('aria-current')).toBe('step')
    expect(items[2]!.textContent).toContain('3')
  })

  it('checks an earlier step only when `done` says so', () => {
    const { container } = render(
      <Stepper steps={[{ label: 'Brand' }, { label: 'Compliance' }, { label: 'Marketplaces' }]} current={2} done={[true, false, false]} />,
    )
    const items = Array.from(container.querySelectorAll('li'))
    expect(items[0]!.textContent).toContain('(done)')
    expect(items[1]!.textContent).not.toContain('(done)')
    expect(items[1]!.textContent).toContain('(not done yet)')
    expect(items[1]!.textContent).toContain('2')
    expect(items[2]!.getAttribute('aria-current')).toBe('step')
  })
})
