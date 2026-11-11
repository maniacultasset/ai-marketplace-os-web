import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Schema } from '@/api/types'
import { TooltipProvider } from '@/components/ui/tooltip'

const post = vi.fn()
let allowed = true
vi.mock('@/api/client', async (orig) => ({ ...(await orig<typeof import('@/api/client')>()), api: { POST: (...a: unknown[]) => post(...a) } }))
vi.mock('@/lib/auth', async (orig) => ({ ...(await orig<typeof import('@/lib/auth')>()), useSession: () => ({ tenantId: 't1' }) }))
vi.mock('@/lib/permissions', async (orig) => ({ ...(await orig<typeof import('@/lib/permissions')>()), useCan: () => () => allowed }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...rest }: { to: string; children: ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}))

const { AnswerCard, AnswerResult } = await import('./answer-card')

type Task = Schema<'TaskOut'>
const IMG = '0b1c2d3e-0000-4000-8000-000000000501'

const task = (over: Partial<Task> = {}): Task => ({
  id: '0b1c2d3e-0000-4000-8000-000000001101',
  blocking: false,
  kind: 'missing_fact',
  product_id: '0b1c2d3e-0000-4000-8000-000000000101',
  target_path: 'facts.attributes.color',
  image_id: IMG,
  question: 'What is the colour of this product?',
  reason: 'The photos suggest maroon, but not clearly enough to use it.',
  expected_answer: { kind: 'enum', allowed_values: ['red', 'maroon', 'blue'] },
  suggestions: [{ value: 'maroon', label: 'maroon', source: 'ai', evidence_ref: `image:${IMG}` }],
  status: 'open',
  resume_from: 'generate',
  created_at: '2026-10-05T09:30:00Z',
  updated_at: '2026-10-05T09:30:00Z',
  ...over,
}) as Task

const ok = (body: unknown) => Promise.resolve({ data: body, error: undefined, response: new Response(JSON.stringify(body), { status: 200 }) })
const refuse = (status: number, type: string, details: unknown[] | null = null) => {
  const error = { error: { type, message: 'm', status, correlation_id: 'req-1', details, error_report: null } }
  return Promise.resolve({ data: undefined, error, response: new Response(JSON.stringify(error), { status }) })
}

function setup(t: Task) {
  const onOutcome = vi.fn()
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        <AnswerCard task={t} onOutcome={onOutcome} />
      </TooltipProvider>
    </QueryClientProvider>,
  )
  return { onOutcome }
}

const chip = (name: RegExp) => screen.getAllByTestId('answer-chip').find((c) => name.test(c.textContent ?? ''))!
const bodyOf = (i: number) => (post.mock.calls[i]![1] as { body: unknown }).body
const keyOf = (i: number) => (post.mock.calls[i]![1] as { params: { header: Record<string, string> } }).params.header['Idempotency-Key']

beforeEach(() => {
  allowed = true
  post.mockReset()
})
afterEach(cleanup)

describe('AnswerCard, enum', () => {
  it('puts the photo suggestion first, checks before sending, then sends the picked value', async () => {
    const { onOutcome } = setup(task())
    expect(screen.getByTestId('answer-context').textContent).toMatch(/Photo suggests\s*Maroon/)
    expect(screen.getAllByTestId('answer-chip')[0]!.textContent).toBe('Maroon· photo')
    fireEvent.click(screen.getByTestId('answer-submit'))
    expect(screen.getByTestId('answer-error').textContent).toBe('Pick one.')
    expect(post).not.toHaveBeenCalled()

    post.mockReturnValueOnce(ok({ ...task(), status: 'applied' }))
    fireEvent.click(chip(/Maroon/).querySelector('input')!)
    expect(screen.queryByTestId('answer-error')).toBeNull()
    fireEvent.click(screen.getByTestId('answer-submit'))
    await waitFor(() => expect(onOutcome).toHaveBeenCalled())
    expect(post.mock.calls[0]![0]).toBe('/tasks/{task_id}/answer')
    expect(bodyOf(0)).toEqual({ value: 'maroon' })
    expect(keyOf(0)).toMatch(/^[\x21-\x7E]{1,255}$/)
    expect(onOutcome.mock.calls[0]![0]).toMatchObject({ kind: 'answered', body: { value: 'maroon' }, task: { status: 'applied' } })
  })

  it('shows the seller’s current value for a conflict', () => {
    setup(
      task({
        kind: 'conflicting_facts',
        suggestions: [
          { value: 'red', label: 'red', source: 'seller' },
          { value: 'maroon', label: 'maroon', source: 'ai', evidence_ref: `image:${IMG}` },
        ],
      }),
    )
    expect(screen.getByTestId('answer-context').textContent).toMatch(/On the product now\s*Red\s*You/)
    const labels = screen.getAllByTestId('answer-chip').map((c) => c.textContent)
    expect(labels.slice(0, 2)).toEqual(['Red· yours now', 'Maroon· photo'])
  })

  it('maps a 422 at value onto the field and starts a new key for the next try', async () => {
    post.mockReturnValueOnce(refuse(422, 'VALIDATION_FAILED', [{ loc: ['body', 'value'], msg: 'bad' }])).mockReturnValueOnce(ok({ ...task(), status: 'applied' }))
    const { onOutcome } = setup(task())
    fireEvent.click(chip(/Red/).querySelector('input')!)
    fireEvent.click(screen.getByTestId('answer-submit'))
    await waitFor(() => expect(screen.getByTestId('answer-error').textContent).toMatch(/doesn’t fit the question/))
    expect(onOutcome).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('answer-submit'))
    await waitFor(() => expect(onOutcome).toHaveBeenCalled())
    expect(keyOf(1)).not.toBe(keyOf(0))
  })

  it('a question closed meanwhile is reported, not shown as an error', async () => {
    post.mockReturnValueOnce(refuse(409, 'INVALID_STATUS_TRANSITION'))
    const { onOutcome } = setup(task())
    fireEvent.click(chip(/Blue/).querySelector('input')!)
    fireEvent.click(screen.getByTestId('answer-submit'))
    await waitFor(() => expect(onOutcome).toHaveBeenCalled())
    expect(onOutcome.mock.calls[0]![0].kind).toBe('closed')
  })

  it('skip sends skip and nothing else', async () => {
    post.mockReturnValueOnce(ok({ ...task(), status: 'applied' }))
    const { onOutcome } = setup(task())
    fireEvent.click(screen.getByTestId('answer-skip'))
    await waitFor(() => expect(onOutcome).toHaveBeenCalled())
    expect(bodyOf(0)).toEqual({ skip: true })
  })
})

describe('AnswerCard, other kinds', () => {
  it('number of pieces: a whole number within 1..50, sent as a number', async () => {
    post.mockReturnValueOnce(ok({ ...task(), status: 'applied' }))
    const { onOutcome } = setup(task({ target_path: 'facts.attributes.number_of_pieces', expected_answer: { kind: 'number', min: 1, max: 50 }, suggestions: [] }))
    const input = screen.getByTestId('answer-input')
    fireEvent.change(input, { target: { value: '0' } })
    fireEvent.click(screen.getByTestId('answer-submit'))
    await waitFor(() => expect(screen.getByText('Enter 1 or more.')).toBeTruthy())
    expect(post).not.toHaveBeenCalled()
    fireEvent.change(input, { target: { value: '3' } })
    fireEvent.click(screen.getByTestId('answer-submit'))
    await waitFor(() => expect(onOutcome).toHaveBeenCalled())
    expect(bodyOf(0)).toEqual({ value: 3 })
  })

  it('text: keeps to its max length', async () => {
    setup(task({ target_path: 'facts.attributes.occasion', expected_answer: { kind: 'text', max_length: 10 }, suggestions: [] }))
    const input = screen.getByTestId('answer-input') as HTMLInputElement
    expect(input.maxLength).toBe(10)
    fireEvent.change(input, { target: { value: 'a long festive answer' } })
    fireEvent.click(screen.getByTestId('answer-submit'))
    await waitFor(() => expect(screen.getByText('Keep it to 10 characters or fewer.')).toBeTruthy())
    expect(post).not.toHaveBeenCalled()
  })

  it('boolean: Yes or No chips', async () => {
    post.mockReturnValueOnce(ok({ ...task(), status: 'applied' }))
    const { onOutcome } = setup(task({ target_path: 'facts.attributes.handmade', expected_answer: { kind: 'boolean' }, suggestions: [] }))
    expect(screen.getAllByTestId('answer-chip').map((c) => c.textContent)).toEqual(['Yes', 'No'])
    fireEvent.click(chip(/No/).querySelector('input')!)
    fireEvent.click(screen.getByTestId('answer-submit'))
    await waitFor(() => expect(onOutcome).toHaveBeenCalled())
    expect(bodyOf(0)).toEqual({ value: false })
  })

  it('money_inr: a ₹ field, sent as the backend’s decimal string', async () => {
    post.mockReturnValueOnce(ok({ ...task(), status: 'applied' }))
    const { onOutcome } = setup(task({ target_path: 'facts.attributes.mrp', expected_answer: { kind: 'money_inr' }, suggestions: [] }))
    expect(screen.getByText('₹')).toBeTruthy()
    fireEvent.change(screen.getByTestId('answer-input'), { target: { value: '1,299' } })
    fireEvent.click(screen.getByTestId('answer-submit'))
    await waitFor(() => expect(onOutcome).toHaveBeenCalled())
    expect(bodyOf(0)).toEqual({ value: '1299' })
  })

  it('acknowledge: one button', async () => {
    post.mockReturnValueOnce(ok({ ...task(), status: 'applied' }))
    const { onOutcome } = setup(task({ expected_answer: { kind: 'acknowledge' }, suggestions: [] }))
    expect(screen.queryByTestId('answer-input')).toBeNull()
    expect(screen.getByTestId('answer-submit').textContent).toBe('Got it')
    fireEvent.click(screen.getByTestId('answer-submit'))
    await waitFor(() => expect(onOutcome).toHaveBeenCalled())
    expect(bodyOf(0)).toEqual({ skip: true })
  })

  it('multi_enum: read only, with a short note, and it can still be skipped', async () => {
    post.mockReturnValueOnce(ok({ ...task(), status: 'applied' }))
    const { onOutcome } = setup(task({ expected_answer: { kind: 'multi_enum', allowed_values: ['festive', 'party'] }, suggestions: [] }))
    expect(screen.getByTestId('answer-read-only').textContent).toMatch(/can’t be answered here yet/)
    expect(screen.getByText('Festive')).toBeTruthy()
    expect(screen.queryByTestId('answer-submit')).toBeNull()
    fireEvent.click(screen.getByTestId('answer-skip'))
    await waitFor(() => expect(onOutcome).toHaveBeenCalled())
    expect(bodyOf(0)).toEqual({ skip: true })
  })

  it('an enum without options and an unknown kind can be skipped too', () => {
    setup(task({ expected_answer: { kind: 'enum', allowed_values: [] }, suggestions: [] }))
    expect(screen.getByTestId('answer-skip')).toBeTruthy()
    cleanup()
    setup(task({ expected_answer: { kind: 'file' }, suggestions: [] }))
    expect(screen.getByTestId('answer-read-only')).toBeTruthy()
    expect(screen.getByTestId('answer-skip')).toBeTruthy()
  })

  it('without permission: no input and no buttons, with the reason', () => {
    allowed = false
    setup(task())
    // product:import: owners and operators; admins do not hold it.
    expect(screen.getByTestId('answer-no-permission').textContent).toBe('Only people who can edit products can answer this. Ask an owner or operator.')
    expect(screen.queryByTestId('answer-submit')).toBeNull()
    expect(screen.queryAllByTestId('answer-chip')).toHaveLength(0)
  })
})

describe('AnswerResult', () => {
  it('says what was saved and the next step', () => {
    render(<AnswerResult outcome={{ kind: 'answered', task: task({ status: 'applied' }), body: { value: 'maroon' } }} />)
    expect(screen.getByTestId('answer-result').textContent).toMatch(/Colour is now Maroon\. Regenerate the listing to use your answer\./)
    expect(screen.getByTestId('task-open-product').getAttribute('href')).toBe('/products/$productId')
  })
  it('puts the Regenerate control first after an answer (prod demo 9 Nov)', () => {
    render(
      <AnswerResult
        outcome={{ kind: 'answered', task: task({ status: 'applied' }), body: { value: 'maroon' } }}
        regenerate={<button type="button" data-testid="answer-regenerate">Regenerate listing</button>}
      />,
    )
    const result = screen.getByTestId('answer-result')
    expect(result.textContent).toContain('It stays a draft until it is approved.')
    expect(screen.getByTestId('answer-regenerate')).toBeTruthy()
    expect(screen.getByTestId('task-open-product').className).not.toContain('bg-brand ')
  })
  it('an answer Kuinn applies itself offers no Regenerate', () => {
    render(
      <AnswerResult
        auto
        outcome={{ kind: 'answered', task: task({ status: 'applied' }), body: { value: 'maroon' } }}
        regenerate={<button type="button" data-testid="answer-regenerate">Regenerate listing</button>}
      />,
    )
    expect(screen.queryByTestId('answer-regenerate')).toBeNull()
    expect(screen.getByTestId('answer-result').textContent).toContain('Kuinn adds it to a new version and checks it.')
  })
  it('a skip says nothing changed', () => {
    render(<AnswerResult outcome={{ kind: 'answered', task: task({ status: 'applied' }), body: { skip: true } }} />)
    expect(screen.getByTestId('answer-result').dataset.result).toBe('skipped')
    expect(screen.getByText('Nothing changed on the product.')).toBeTruthy()
  })
})
