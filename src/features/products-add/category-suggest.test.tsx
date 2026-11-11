import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const post = vi.fn()
const get = vi.fn()
vi.mock('@/api/client', async (orig) => ({
  ...(await orig<typeof import('@/api/client')>()),
  api: { POST: (...a: unknown[]) => post(...a), GET: (...a: unknown[]) => get(...a) },
}))
vi.mock('@/lib/auth', async (orig) => ({ ...(await orig<typeof import('@/lib/auth')>()), useSession: () => ({ tenantId: 't1' }) }))

const { CategorySuggest } = await import('./category-suggest')

const answer = (body: unknown, status = 200) =>
  Promise.resolve({ data: status < 400 ? body : undefined, error: status >= 400 ? body : undefined, response: new Response(JSON.stringify(body), { status }) })
const SUGGESTED = {
  suggestion_id: 's1',
  status: 'suggested',
  candidates: [
    { category: 'ethnic_wear_kurta_sets', label: 'Kurta sets', confidence: 0.92, rationale: 'The name says kurta with dupatta.', unsure: false },
    { category: 'tshirts', label: 'T-shirts', confidence: 0.41, rationale: 'Cotton top.', unsure: true },
  ],
}

function setup(title = 'Cotton kurta set', value = '') {
  const onPick = vi.fn()
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <CategorySuggest draft={{ title, attributes: {} }} value={value} onPick={onPick} />
    </QueryClientProvider>,
  )
  return onPick
}

beforeEach(() => {
  post.mockReset()
  get.mockReset()
})
afterEach(cleanup)

describe('CategorySuggest (client feedback 11 Nov)', () => {
  it('asks only on the button, then shows ranked chips with reasons; the seller picks one', async () => {
    post.mockReturnValue(answer({ suggestion_id: 's1', status: 'queued', candidates: [] }, 202))
    get.mockReturnValue(answer(SUGGESTED))
    const onPick = setup()
    expect(post).not.toHaveBeenCalled()
    await userEvent.click(screen.getByTestId('category-suggest-ask'))
    expect(post).toHaveBeenCalledTimes(1)
    const [path, init] = post.mock.calls[0] as [string, { body: unknown; params: { header: Record<string, string> } }]
    expect(path).toBe('/catalog/category-suggestions')
    expect(init.body).toEqual({ title: 'Cotton kurta set', attributes: {} })
    expect(init.params.header['Idempotency-Key']).toBeTruthy()
    const chips = await screen.findAllByTestId('category-suggest-chip')
    expect(chips.map((c) => c.getAttribute('data-category'))).toEqual(['ethnic_wear_kurta_sets', 'tshirts'])
    expect(chips[0]!.textContent).toContain('The name says kurta with dupatta.')
    expect(chips[1]!.getAttribute('data-unsure')).toBe('true')
    expect(chips[1]!.textContent).toContain('Unsure')
    await userEvent.click(chips[0]!)
    expect(onPick).toHaveBeenCalledWith('ethnic_wear_kurta_sets')
  })

  it('waits for a name before it can ask', () => {
    setup('  ')
    expect((screen.getByTestId('category-suggest-ask') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(/Add the product name first/)).toBeTruthy()
  })

  it('says so when the suggestion is switched off, and when Kuinn is unsure of every choice', async () => {
    post.mockReturnValueOnce(answer({ suggestion_id: null, status: 'unavailable', candidates: [] }))
    setup()
    await userEvent.click(screen.getByTestId('category-suggest-ask'))
    expect(await screen.findByText(/can’t suggest a category right now/)).toBeTruthy()
    expect(get).not.toHaveBeenCalled()
    cleanup()
    post.mockReturnValueOnce(answer({ suggestion_id: 's2', status: 'queued', candidates: [] }, 202))
    get.mockReturnValue(answer({ ...SUGGESTED, candidates: [SUGGESTED.candidates[1]] }))
    setup()
    await userEvent.click(screen.getByTestId('category-suggest-ask'))
    await waitFor(() => expect(screen.getByText(/isn’t sure/)).toBeTruthy())
  })

  it('shows the chosen chip as chosen', async () => {
    post.mockReturnValue(answer({ suggestion_id: 's1', status: 'queued', candidates: [] }, 202))
    get.mockReturnValue(answer(SUGGESTED))
    setup('Kurta', 'tshirts')
    await userEvent.click(screen.getByTestId('category-suggest-ask'))
    const chips = await screen.findAllByTestId('category-suggest-chip')
    expect(chips.map((c) => c.getAttribute('aria-pressed'))).toEqual(['false', 'true'])
  })
})
