import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { Task } from '@/features/inbox/model'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...rest }: { to: string; children: ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
  useNavigate: () => () => {},
}))
vi.mock('@/lib/auth', async (orig) => ({ ...(await orig<typeof import('@/lib/auth')>()), useSession: () => ({ tenantId: 't1' }) }))
vi.mock('@/lib/permissions', async (orig) => ({ ...(await orig<typeof import('@/lib/permissions')>()), useCan: () => () => true }))
vi.mock('@/features/inbox/dismiss-issue', () => ({ DismissIssueButton: () => <button type="button">Dismiss</button> }))
let productRead: { isPending: boolean; data?: unknown; error?: unknown } = { isPending: true }
vi.mock('@/features/products/api', async (orig) => ({ ...(await orig<object>()), useProduct: () => productRead }))
vi.mock('@/features/assist/category-suggestion-card', () => ({ CategorySuggestionCard: () => <div data-testid="category-suggestion" /> }))

const { InboxDetail } = await import('./inbox-detail')

afterEach(cleanup)

const ID = '0b1c2d3e-0000-4000-8000-000000004001'
const PRODUCT = '0b1c2d3e-0000-4000-8000-000000000101'
const task: Task = {
  id: ID,
  kind: 'category_review',
  status: 'open',
  question: 'Which category is this product?',
  reason: 'Kuinn was not sure about the category.',
  target_path: null,
  product_id: PRODUCT,
  resume_from: 'generate',
  expected_answer: {},
  suggestions: [],
  created_at: '2026-11-09T09:00:00Z',
  updated_at: '2026-11-09T09:00:00Z',
}

function show() {
  const item = { kind: 'task' as const, id: ID, at: task.created_at, task }
  return render(
    <TooltipProvider>
      <InboxDetail selectedKey={`task:${ID}`} items={[item]} pending={false} search={{}} products={{ map: new Map(), pending: false }} />
    </TooltipProvider>,
  )
}

const product = { id: PRODUCT, sku: 'KS-1', title: 'Kurta', category: null, category_suggest_enabled: true }

describe('Inbox category_review task (SI14)', () => {
  it('lets the seller confirm the category right in the Inbox while the switch is on', () => {
    productRead = { isPending: false, data: product }
    show()
    expect(screen.getByTestId('category-suggestion')).toBeTruthy()
    expect(screen.getByText('Category review', { exact: false })).toBeTruthy()
    expect(screen.getByTestId('task-resume').textContent).toContain('Drafts can start once the category is chosen.')
    // Never the "coming soon" answer controls.
    expect(screen.queryByTestId('answer-soon')).toBeNull()
  })

  it('shows no suggestion controls while the switch is off, only the way to the product', () => {
    productRead = { isPending: false, data: { ...product, category_suggest_enabled: false } }
    show()
    expect(screen.queryByTestId('category-suggestion')).toBeNull()
    expect(screen.getByText('Choose the category on the product page.')).toBeTruthy()
    expect(screen.getByTestId('task-open-product')).toBeTruthy()
  })

  it('says nothing more is needed once the product has a category', () => {
    productRead = { isPending: false, data: { ...product, category: 'tshirts' } }
    show()
    expect(screen.getByText('This product has a category now. Nothing else is needed here.')).toBeTruthy()
  })
})
