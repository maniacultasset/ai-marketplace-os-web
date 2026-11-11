import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { formatConfidence, sourceLabel } from './source-badge'
import { CHIP_META, StatusChip } from './status-chip'
import { Stepper } from './progress'
import { LaField } from './field'

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
    expect(sourceLabel({ kind: 'photo' })).toBe('From photo')
    expect(sourceLabel({ kind: 'photo', unconfirmed: true })).toBe('From photo, not confirmed')
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

describe('field required mark', () => {
  it('shows a quiet "Required" beside the label from the start, and keeps the accessible name the label', () => {
    const { container } = render(
      <LaField label="SKU" htmlFor="sku" hint="Unique in this brand." required>
        <input id="sku" aria-describedby="sku-hint" />
      </LaField>,
    )
    const mark = container.querySelector('[data-slot="field-required"]')!
    expect(mark.textContent).toBe('Required')
    expect(mark.getAttribute('aria-hidden')).toBe('true')
    // Never red: the mark is ink-3, not danger, and nothing is an error yet.
    expect(mark.className).toContain('text-ink-3')
    expect(mark.className).not.toContain('danger')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('textbox', { name: 'SKU' })).toBeTruthy()
    expect(document.getElementById('sku-hint')!.textContent).toMatch(/^Required\.Unique in this brand\./)
  })

  it('takes other words, and shows nothing when not required', () => {
    const { container, rerender } = render(
      <LaField label="Barcode" htmlFor="b" required="Needed for Amazon">
        <input id="b" />
      </LaField>,
    )
    expect(container.querySelector('[data-slot="field-required"]')!.textContent).toBe('Needed for Amazon')
    rerender(
      <LaField label="Barcode" htmlFor="b">
        <input id="b" />
      </LaField>,
    )
    expect(container.querySelector('[data-slot="field-required"]')).toBeNull()
  })
})
