import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { at, attempt, resolution } from '@/test/resolution-fixtures'
import { resolutionView, type Resolution } from './resolution-model'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, params, search, children, ...rest }: { to: string; params?: Record<string, string>; search?: Record<string, string>; children: ReactNode }) => {
    const path = Object.entries(params ?? {}).reduce((p, [k, v]) => p.replace(`$${k}`, v), to)
    const q = search ? `?${new URLSearchParams(search).toString()}` : ''
    return (
      <a href={`${path}${q}`} {...rest}>
        {children}
      </a>
    )
  },
}))

const { ResolutionActionLink, ResolutionCard } = await import('./resolution-timeline')

afterEach(cleanup)

const view = (r: Resolution, marketplaceState: string | null = null) => resolutionView(r, { marketplace: 'amazon', marketplaceState })

const card = (r: Resolution, marketplaceState: string | null = null) =>
  render(
    <div style={{ width: 320 }}>
      <ResolutionCard view={view(r, marketplaceState)} marketplace="amazon" />
    </div>,
  )

describe('ResolutionCard ("What Kuinn did")', () => {
  it('0 attempts: the headline only, no steps', () => {
    card(resolution({ state: 'checking' }))
    expect(screen.getByTestId('resolution-headline').textContent).toBe('Checking with Amazon')
    expect(screen.queryAllByTestId('resolution-step')).toHaveLength(0)
    expect(screen.queryByTestId('resolution-tries')).toBeNull()
  })

  it('1 attempt: what Amazon said, what Kuinn changed, what needs you, and the tries', () => {
    card(
      resolution({
        state: 'needs_you',
        cycles_used: 2,
        attempts: [
          attempt({
            failed: [
              { field: 'attributes.fabric_type', message: 'Fabric type is required.', lane: 'seller', cause: 'seller_fact' },
              { field: 'attributes.size', message: 'XXL is not an allowed size.', lane: 'auto_repair', cause: 'mapping' },
            ],
            changed: [{ kind: 'ai_correction', field: 'content.bullets[0]', summary: 'Rewrote bullet 1 to drop a claim.' }],
          }),
        ],
      }),
    )
    expect(screen.getByTestId('resolution-tries').textContent).toBe('2 of 3 automatic tries')
    const step = screen.getByTestId('resolution-step')
    expect(within(step).getByTestId('resolution-step-title').textContent).toBe('Sent 1')
    const said = within(step).getByTestId('resolution-said')
    expect(said.textContent).toContain('What Amazon said')
    expect(said.textContent).toContain('Fabric type is required.')
    // Lane labels on the newest step.
    expect(said.textContent).toContain('Needs you')
    expect(said.textContent).toContain('Kuinn is fixing')
    const changed = within(step).getByTestId('resolution-changed')
    expect(changed.textContent).toContain('Bullet 1')
    expect(changed.textContent).toContain('Rewritten by the agent')
    expect(within(step).getByTestId('resolution-needs-you').textContent).toContain('Fabric type')
  })

  it('10 attempts: the newest three, oldest first, and the rest one click away', async () => {
    const attempts = Array.from({ length: 10 }, (_, i) => attempt({ number: 10 - i, at: at(20 - i), outcome: i === 0 ? 'pending' : 'rejected' }))
    card(resolution({ state: 'resubmitted', cycles_used: 3, attempts }))
    expect(screen.getAllByTestId('resolution-step')).toHaveLength(3)
    expect(screen.getAllByTestId('resolution-step-title').map((e) => e.textContent)).toEqual(['Sent 8', 'Sent 9', 'Sent 10'])
    await userEvent.click(screen.getByTestId('resolution-earlier'))
    expect(screen.getAllByTestId('resolution-step')).toHaveLength(10)
    expect(screen.getAllByTestId('resolution-step-title')[0]!.textContent).toBe('Sent 1')
    expect(screen.queryByTestId('resolution-earlier')).toBeNull()
  })

  it('older steps carry no lane label: only the current step says who acts now', () => {
    const failed = [{ field: 'attributes.size', message: 'XXL is not an allowed size.', lane: 'auto_repair' as const, cause: 'mapping' as const }]
    card(resolution({ state: 'resubmitted', attempts: [attempt({ number: 2, actor: 'system', outcome: 'pending', at: at(2) }), attempt({ number: 1, failed, at: at(1) })] }))
    const [older] = screen.getAllByTestId('resolution-step')
    expect(within(older!).getByTestId('resolution-said').textContent).not.toContain('Kuinn is fixing')
  })

  it('"Live" only with the marketplace\'s word', () => {
    card(resolution({ state: 'live', attempts: [attempt({ outcome: 'accepted' })] }), 'processing')
    expect(screen.getByTestId('resolution-headline').textContent).toBe('Sent to Amazon')
  })

  it('renders an action slot', () => {
    render(<ResolutionCard view={view(resolution({ state: 'needs_you' }))} marketplace="amazon" action={<button type="button">Answer</button>} />)
    expect(screen.getByRole('button', { name: 'Answer' })).toBeTruthy()
  })
})

describe('ResolutionActionLink', () => {
  it('opens the question in the Inbox', () => {
    render(<ResolutionActionLink action={{ kind: 'answer', taskId: '11111111-1111-1111-1111-111111111111' }} listingId="l1" marketplace="amazon" />)
    expect(screen.getByTestId('resolution-answer').getAttribute('href')).toBe('/inbox?item=task%3A11111111-1111-1111-1111-111111111111')
  })

  it('names the marketplace step', () => {
    render(<ResolutionActionLink action={{ kind: 'marketplace', taskId: null }} listingId="l1" marketplace="amazon" />)
    expect(screen.getByTestId('resolution-marketplace').textContent).toBe('See the Amazon step')
  })

  it('opens the product editor at the barcode choice, with Amazon\'s exemption help', () => {
    render(<ResolutionActionLink action={{ kind: 'edit_identifier' }} listingId="l1" marketplace="amazon" productId="p1" />)
    const link = screen.getByTestId('resolution-edit-identifier')
    expect(link.getAttribute('href')).toBe('/products/p1?edit=barcode')
    expect(link.textContent).toBe('Fix the barcode or exemption')
    expect(screen.getByTestId('resolution-exemption-help-link').getAttribute('href')).toBe('https://sellercentral.amazon.in/help/hub/reference/G200426310')
  })

  it('keeps the exemption help but no editor link for someone who cannot edit the product', () => {
    render(<ResolutionActionLink action={{ kind: 'edit_identifier' }} listingId="l1" marketplace="amazon" productId={null} />)
    expect(screen.queryByTestId('resolution-edit-identifier')).toBeNull()
    expect(screen.getByTestId('resolution-exemption-help')).toBeTruthy()
  })

  it('shows no Amazon exemption help on Flipkart', () => {
    render(<ResolutionActionLink action={{ kind: 'edit_identifier' }} listingId="l1" marketplace="flipkart" productId="p1" />)
    expect(screen.getByTestId('resolution-edit-identifier')).toBeTruthy()
    expect(screen.queryByTestId('resolution-exemption-help')).toBeNull()
  })

  it('renders nothing for no action', () => {
    const { container } = render(<ResolutionActionLink action={{ kind: 'none' }} listingId="l1" marketplace="amazon" />)
    expect(container.innerHTML).toBe('')
  })
})
