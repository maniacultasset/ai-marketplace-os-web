import { cleanup, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ISSUE, L2, P1, summary, TASK } from '@/test/home-summary'
import type { HomeSummary } from './summary-model'

type LinkArgs = { to: string; params?: Record<string, string>; search?: Record<string, string>; children: ReactNode }
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, params, search, children, ...rest }: LinkArgs) => {
    let path = to
    for (const [k, v] of Object.entries(params ?? {})) path = path.replace(`$${k}`, v)
    const q = search ? new URLSearchParams(search).toString() : ''
    return (
      <a href={q ? `${path}?${q}` : path} {...rest}>
        {children}
      </a>
    )
  },
  useNavigate: () => vi.fn(),
}))
const can = vi.hoisted(() => ({ all: true }))
vi.mock('@/lib/permissions', () => ({ useCan: () => () => can.all }))

const { DashboardBody } = await import('./home-page')

afterEach(() => {
  cleanup()
  can.all = true
})

const view = (s: HomeSummary = summary()) =>
  render(
    <TooltipProvider>
      <DashboardBody brand="Loomline" name="Priya Shah" summary={s} updatedAt={Date.now()} />
    </TooltipProvider>,
  )

const href = (el: HTMLElement) => el.getAttribute('href')

describe('Home from the summary', () => {
  it('every tile shows its exact number, says what it counts and links to its filtered list', () => {
    view()
    expect(screen.getByTestId('tile-live-value').textContent).toBe('4')
    expect(screen.getByTestId('tile-working-value').textContent).toBe('1')
    expect(screen.getByTestId('tile-needs-value').textContent).toBe('4')
    expect(href(screen.getByTestId('tile-live-link'))).toBe('/products?listing=live')
    expect(href(screen.getByTestId('tile-working-link'))).toBe('/products?listing=in_progress')
    expect(href(screen.getByTestId('tile-needs-link'))).toBe('/inbox')
    expect(href(screen.getByTestId('tile-needs-listings'))).toBe('/products?listing=ready_to_approve')
    for (const id of ['tile-live', 'tile-working', 'tile-needs']) {
      expect(screen.getByTestId(`${id}-definition`).getAttribute('aria-label')).toMatch(/^What this counts: /)
    }
    expect(screen.getByTestId('tile-needs-caption').textContent).toBe('1 blocked, 1 question, 1 to approve, 1 to publish')
  })

  it('each waiting row names the product, the issue and the action, and opens the right place', () => {
    view()
    const card = screen.getByTestId('waiting-card')
    const titles = within(card).getAllByTestId('waiting-title').map((e) => e.textContent)
    expect(titles).toEqual(['Block Print Kurta', 'Block Print Kurta', 'Block Print Kurta'])
    const issues = within(card).getAllByTestId('waiting-issue').map((e) => e.textContent)
    expect(issues[0]).toBe('The title is longer than Amazon allows. · KURTA-001 · Amazon · 2 issues')
    const actions = within(card).getAllByTestId('waiting-action')
    expect(actions.map((a) => a.textContent)).toEqual(['Fix', 'Answer', 'Review'])
    expect(actions.map(href)).toEqual([`/inbox?item=issue%3A${ISSUE}`, `/inbox?item=task%3A${TASK}`, `/listings/${L2}/review`])
    expect(href(within(card).getByTestId('waiting-view-all'))).toBe('/inbox')
  })

  it('the agent feed lists completed, failed and pending work, and keeps Open Activity', () => {
    view()
    const feed = screen.getByTestId('agent-feed')
    const rows = within(feed).getAllByTestId('agent-feed-row')
    expect(rows.map((r) => r.getAttribute('data-state'))).toEqual(['pending', 'failed', 'completed'])
    expect(rows[1]!.textContent).toContain('Could not send Block Print Kurta to Flipkart')
    expect(rows[1]!.textContent).toContain('Failed')
    expect(href(within(rows[0]!).getAllByRole('link')[0]!)).toBe(`/products/${P1}`)
    expect(within(feed).getByTestId('agent-feed-sub').textContent).toBe('1 in progress · 1 failed')
    expect(href(within(feed).getByTestId('agent-feed-activity'))).toBe('/activity')
  })

  it('a marketplace card names its blocked product and a quiet card offers its next step', () => {
    const s = summary()
    view({
      ...s,
      by_marketplace: [s.by_marketplace[0]!, { ...s.by_marketplace[1]!, problem: 0, ready_to_publish: 0 }],
      marketplaces: [s.marketplaces[0]!, { ...s.marketplaces[1]!, next_step: 'none' }],
    })
    const amazon = screen.getByTestId('home-mp-amazon')
    expect(href(within(amazon).getByTestId('mp-problem'))).toBe(`/products/${P1}`)
    const flipkart = screen.getByTestId('home-mp-flipkart')
    expect(href(within(flipkart).getByTestId('mp-next'))).toBe('/products?marketplace=flipkart')
  })

  it('a connected marketplace with nothing listed offers to add a product', () => {
    const s = summary()
    view({
      ...s,
      by_marketplace: [
        s.by_marketplace[0]!,
        { marketplace: 'flipkart', listings: 0, live: 0, partly_live: 0, in_progress: 0, problem: 0, ready_to_approve: 0, ready_to_publish: 0 },
      ],
      marketplaces: [s.marketplaces[0]!, { ...s.marketplaces[1]!, next_step: 'add_listing' }],
    })
    const link = within(screen.getByTestId('home-mp-flipkart')).getByTestId('mp-next')
    expect(link.textContent).toBe('Add a product to list here')
    expect(href(link)).toBe('/add')
  })

  it('a missing account links to connect it, or says who can', () => {
    const s = summary()
    const missing = { ...s, marketplaces: [{ ...s.marketplaces[0]!, account: 'not_connected' as const, next_step: 'connect' as const }, s.marketplaces[1]!] }
    view(missing)
    expect(href(within(screen.getByTestId('home-mp-amazon')).getByTestId('mp-connect'))).toBe('/marketplaces?mp=amazon')
    cleanup()
    can.all = false
    view(missing)
    expect(within(screen.getByTestId('home-mp-amazon')).getByTestId('mp-connect-who').textContent).toMatch(/owner or admin/)
  })
})

describe('Home empty states explain how to start', () => {
  const quiet = (over: Partial<HomeSummary>) =>
    summary({
      needs_you_items: [],
      needs_you: { total: 0, blocked: 0, blocked_without_issue: 0, own_work: 0, waiting_on_account: 0, questions: 0, ready_to_approve: 0, ready_to_publish: 0, publishing_paused: 0, improve: 0 },
      activity: [],
      ...over,
    })

  it('no products: add the first one', () => {
    view(quiet({ products: 0 }))
    expect(screen.getByTestId('waiting-empty').textContent).toMatch(/Add your first product/)
    expect(href(screen.getByTestId('waiting-add'))).toBe('/add')
    expect(screen.getByTestId('agent-feed-empty').textContent).toMatch(/When you add a product/)
    expect(href(screen.getByTestId('agent-feed-activity'))).toBe('/activity')
  })

  it('no marketplace connected: connect one', () => {
    const s = summary()
    view(quiet({ marketplaces: s.marketplaces.map((m) => ({ ...m, account: 'not_connected' as const, next_step: 'connect' as const })) }))
    expect(href(screen.getByTestId('waiting-connect'))).toBe('/marketplaces')
  })

  it('all clear: nothing needs you', () => {
    view(quiet({}))
    expect(screen.getByTestId('waiting-empty').textContent).toMatch(/Nothing needs you right now/)
    expect(screen.queryByTestId('waiting-view-all')).toBeNull()
  })
})
