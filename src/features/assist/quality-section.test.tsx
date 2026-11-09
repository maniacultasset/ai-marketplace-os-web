import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { editedFieldBars, fieldLabel, formatUsd } from './quality-model'

vi.mock('@/lib/auth', async (orig) => ({ ...(await orig<typeof import('@/lib/auth')>()), useSession: () => ({ tenantId: 't1' }) }))
let staff = false
vi.mock('@/lib/permissions', async (orig) => ({
  ...(await orig<typeof import('@/lib/permissions')>()),
  useCan: () => (a: string) => (a === 'platform:admin' ? staff : true),
}))
const get = vi.fn()
vi.mock('@/api/client', async (orig) => ({ ...(await orig<typeof import('@/api/client')>()), api: { GET: (...a: unknown[]) => get(...a) } }))

const { QualitySection } = await import('./quality-section')

const ok = (body: unknown) => Promise.resolve({ data: body, error: undefined, response: new Response(JSON.stringify(body), { status: 200 }) })
const refuse = (status: number) => {
  const error = { error: { type: status === 403 ? 'PERMISSION_DENIED' : 'NOT_FOUND', message: 'm', status, correlation_id: 'r', details: null, error_report: null } }
  return Promise.resolve({ data: undefined, error, response: new Response(JSON.stringify(error), { status }) })
}

const RANGE = { from: '2026-10-11', to: '2026-11-09' }
const summary = {
  from: RANGE.from,
  to: RANGE.to,
  listings_generated: 40,
  first_pass_rate: 0.725,
  blocked_rate: 0.1,
  edit_rate: 0.2,
  cost_per_listing_usd: 0.0123,
  by_marketplace: [{ marketplace: 'amazon', listings_generated: 40, cost_usd: 0.49, first_pass_rate: 0.725, blocked_rate: 0.1, edit_rate: 0.2, cost_per_listing_usd: 0.0123 }],
  edited_fields: [
    { path: 'content.bullets', count: 3 },
    { path: 'content.title', count: 6 },
  ],
}
const platform = { ...summary, listings_generated: 90, by_tenant: [{ tenant_id: '0b1c2d3e-0000-4000-8000-000000000001', listings_generated: 90, cost_usd: 1.2, first_pass_rate: 0.6 }] }

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        <QualitySection range={RANGE} />
      </TooltipProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  staff = false
  get.mockReset()
})
afterEach(cleanup)

describe('QualitySection (SI14)', () => {
  it('shows the four quality numbers, by marketplace and the most edited fields', async () => {
    get.mockImplementation((path: string) => (path === '/analytics/quality' ? ok(summary) : refuse(404)))
    setup()
    expect((await screen.findByTestId('quality-first_pass_rate-value')).textContent).toBe('72.5%')
    expect(screen.getByTestId('quality-blocked_rate-value').textContent).toBe('10.0%')
    expect(screen.getByTestId('quality-edit_rate-value').textContent).toBe('20.0%')
    expect(screen.getByTestId('quality-cost_per_listing_usd-value').textContent).toBe('$0.0123')
    const fields = within(screen.getByTestId('quality-edited-fields')).getAllByRole('listitem')
    expect(fields.map((f) => f.textContent)).toEqual(['Title6', 'Bullets3'])
    // A brand never sees the staff view, and it is never asked for.
    expect(screen.queryByTestId('quality-scope-platform')).toBeNull()
    expect(get.mock.calls.some((c) => c[0] === '/admin/quality')).toBe(false)
  })

  it('shows nothing on a backend without the quality read', async () => {
    get.mockImplementation(() => refuse(404))
    const { container } = setup()
    await waitFor(() => expect(get).toHaveBeenCalled())
    await waitFor(() => expect(container.innerHTML).toBe(''))
  })

  it('says when nothing was generated, instead of showing dashes', async () => {
    get.mockImplementation(() => ok({ ...summary, listings_generated: 0, first_pass_rate: null }))
    setup()
    expect(await screen.findByTestId('quality-empty')).toBeTruthy()
  })

  it('gives a platform admin the staff view across brands, by id only', async () => {
    staff = true
    get.mockImplementation((path: string) => (path === '/admin/quality' ? ok(platform) : ok(summary)))
    setup()
    await userEvent.click(await screen.findByTestId('quality-scope-platform'))
    const table = await screen.findByTestId('quality-by-tenant')
    expect(table.textContent).toContain('0b1c2d3e')
    expect(table.textContent).toContain('$1.20')
  })
})

describe('quality model', () => {
  it('formats cost truthfully and labels edited paths', () => {
    expect(formatUsd(null)).toBe('No data')
    expect(formatUsd(0)).toBe('$0.00')
    expect(formatUsd(0.0042)).toBe('$0.0042')
    expect(formatUsd(1.5)).toBe('$1.50')
    expect(fieldLabel('attributes.fabric_type')).toBe('Fabric type')
    expect(editedFieldBars([{ path: 'a', count: 2 }, { path: 'b', count: 4 }, { path: 'c', count: 0 }])).toEqual([
      { path: 'b', count: 4, share: 1 },
      { path: 'a', count: 2, share: 0.5 },
    ])
  })
})
