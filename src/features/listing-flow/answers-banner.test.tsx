import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { ActionState, ListingDetail } from '@/features/listings/model'

const regenerate = vi.fn()
vi.mock('@/features/listings/api', async (real) => ({
  ...(await real<typeof import('@/features/listings/api')>()),
  useRegenerateListing: () => ({ mutate: regenerate, isPending: false }),
}))
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }))
vi.mock('@/features/ai-credit/use-ai-paused', () => ({ useAiPaused: () => false }))
vi.mock('@/features/listings/job-memory', () => ({ rememberJob: vi.fn() }))
vi.mock('@/lib/toast', () => ({ toastError: vi.fn() }))

const { AnswersBanner } = await import('./answers-banner')
const { regenerateBody } = await import('@/features/listings/api')

afterEach(cleanup)
beforeEach(() => regenerate.mockReset())

const ON: ActionState = { show: true, enabled: true }
const LISTING = { id: 'l1', status: 'validated' } as ListingDetail

function show(affected: ('title' | 'bullets' | 'description' | 'keywords' | 'attributes')[], listing = LISTING) {
  render(
    <TooltipProvider>
      <AnswersBanner listing={listing} affected={affected} state={ON} />
    </TooltipProvider>,
  )
}

const sent = (call: number) => {
  const vars = regenerate.mock.calls[call]![0] as { instructions: string | null; sections?: never[]; forAnswers?: boolean }
  return regenerateBody(vars.instructions, vars.sections, vars.forAnswers)
}

describe('Answers banner', () => {
  it('names the sections the answers affect and updates only those', async () => {
    show(['title', 'bullets'])
    expect(screen.getByTestId('answered-regenerate').textContent).toContain('They affect: Title and Key features.')
    await userEvent.click(screen.getByTestId('answered-update-sections'))
    expect(sent(0)).toEqual({ sections: ['title', 'bullets'], for_answers: true })
  })

  it('keeps the full "Generate again" as the second button, with the whole body', async () => {
    show(['title', 'bullets'])
    const update = screen.getByTestId('answered-update-sections')
    const whole = screen.getByTestId('answered-regenerate-button')
    expect(whole.textContent).toContain('Generate again')
    expect(update.compareDocumentPosition(whole) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    await userEvent.click(whole)
    expect(sent(0)).toEqual({})
  })

  it('offers only "Generate again" when the server names no section', () => {
    show([], { ...LISTING, status: 'blocked' } as ListingDetail)
    expect(screen.queryByTestId('answered-update-sections')).toBeNull()
    expect(screen.getByTestId('answered-regenerate').textContent).toContain('Until then it stays blocked.')
  })
})
