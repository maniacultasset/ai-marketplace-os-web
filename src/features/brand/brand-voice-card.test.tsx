import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/errors'

type Profile = { default_manufacturer: null; brand_description: string | null; brand_voice: Record<string, unknown> | null; updated_at: null }
const empty: Profile = { default_manufacturer: null, brand_description: null, brand_voice: null, updated_at: null }
const savedVoice = {
  audience: 'Students',
  price_segment: 'budget',
  positioning: null,
  differentiators: [],
  words_to_use: ['comfy'],
  words_to_avoid: [],
  claim_limits: [],
  example_copy: null,
}
const query: { data: { data: Profile; etag: string } | undefined; isPending: boolean; error: unknown; refetch: ReturnType<typeof vi.fn> } = {
  data: undefined,
  isPending: false,
  error: null,
  refetch: vi.fn(),
}
const mutateAsync = vi.fn()
const tenant: { data: { data: { tone: string | null }; etag: string } | undefined; isPending: boolean; refetch: ReturnType<typeof vi.fn> } = {
  data: undefined,
  isPending: false,
  refetch: vi.fn(),
}
const saveTone = vi.fn()

vi.mock('@/features/products/api', () => ({
  useBrandManufacturer: () => query,
  useSaveBrandManufacturer: () => ({ mutateAsync, isPending: false }),
}))
vi.mock('./api', () => ({
  useBrandProfile: () => tenant,
  useSaveProfile: () => ({ mutateAsync: saveTone, isPending: false }),
}))
vi.mock('@/lib/toast', () => ({ toast: { success: vi.fn() } }))

const { BrandVoiceCard } = await import('./brand-voice-card')

beforeEach(() => {
  query.data = { data: { ...empty }, etag: '"v1"' }
  mutateAsync.mockReset().mockResolvedValue({ data: empty, etag: '"v2"' })
  query.refetch.mockReset()
  tenant.data = { data: { tone: null }, etag: '"t1"' }
  tenant.refetch.mockReset()
  saveTone.mockReset().mockResolvedValue({ data: { tone: null }, etag: '"t2"' })
})
afterEach(cleanup)

const dialog = () => screen.getByTestId('voice-dialog')
const next = () => fireEvent.click(within(dialog()).getByTestId('voice-next'))

describe('BrandVoiceCard', () => {
  it('walks the questions, reads the answers back, and saves them with the ETag it opened from', async () => {
    render(<BrandVoiceCard canEdit />)
    fireEvent.click(screen.getByTestId('voice-start'))
    expect(within(dialog()).getByTestId('voice-progress').textContent).toBe('Question 1 of 8')
    // an empty question offers Skip; an answered one offers Next
    expect(within(dialog()).getByTestId('voice-next').textContent).toBe('Skip')
    fireEvent.change(screen.getByLabelText('About your brand'), { target: { value: 'Cotton wear from Jaipur.' } })
    expect(within(dialog()).getByTestId('voice-next').textContent).toBe('Next')
    next()
    fireEvent.change(screen.getByLabelText('Who buys it'), { target: { value: 'Women 25 to 40' } })
    next()
    fireEvent.click(screen.getByRole('radio', { name: /Premium/ }))
    next()
    next() // skip the tone
    next() // skip "what makes it different"
    const use = screen.getByLabelText('Words to use')
    fireEvent.change(use, { target: { value: 'breathable' } })
    fireEvent.keyDown(use, { key: 'Enter' })
    fireEvent.change(use, { target: { value: 'Breathable' } })
    fireEvent.keyDown(use, { key: 'Enter' })
    expect(within(screen.getByRole('list', { name: 'Words to use' })).getAllByRole('listitem')).toHaveLength(1)
    const avoid = screen.getByLabelText('Words to avoid')
    fireEvent.change(avoid, { target: { value: 'cheap' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add to words to avoid' }))
    next()
    next() // no claims
    next() // no example
    const summary = within(dialog()).getByTestId('voice-summary')
    expect(summary.textContent).toContain('Writes for')
    expect(summary.textContent).toContain('Women 25 to 40')
    expect(summary.textContent).toContain('Premium')
    expect(summary.textContent).toContain('“cheap”')
    expect(dialog().textContent).toContain('Product facts always win')
    // a background refetch brings a newer ETag while the dialog is open: the save keeps the first
    query.data = { data: { ...empty }, etag: '"v9"' }
    fireEvent.click(within(dialog()).getByTestId('voice-save'))
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1))
    const sent = mutateAsync.mock.calls[0]![0]
    expect(sent.etag).toBe('"v1"')
    expect(sent.body).toEqual({
      brand_description: 'Cotton wear from Jaipur.',
      brand_voice: {
        audience: 'Women 25 to 40',
        price_segment: 'premium',
        positioning: null,
        differentiators: [],
        words_to_use: ['breathable'],
        words_to_avoid: ['cheap'],
        claim_limits: [],
        example_copy: null,
      },
    })
    await waitFor(() => expect(screen.queryByTestId('voice-dialog')).toBeNull())
    expect(saveTone).not.toHaveBeenCalled() // the tone was not changed
  })

  it('asks for the tone and saves it to the brand’s tone field, apart from the voice', async () => {
    render(<BrandVoiceCard canEdit variant="setup" />)
    fireEvent.click(screen.getByTestId('voice-start'))
    next()
    next()
    next()
    expect(within(dialog()).getByTestId('voice-step-tone')).toBeTruthy()
    expect(within(dialog()).getByText('How should it sound?')).toBeTruthy()
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Warm' }))
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Calm' }))
    expect((screen.getByLabelText('Tone of voice') as HTMLTextAreaElement).value).toBe('Warm, Calm')
    expect(within(dialog()).getByRole('button', { name: 'Warm' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(within(dialog()).getByTestId('voice-to-summary'))
    expect(within(dialog()).getByTestId('voice-summary').textContent).toContain('Warm, Calm')
    fireEvent.click(within(dialog()).getByTestId('voice-save'))
    await waitFor(() => expect(saveTone).toHaveBeenCalledTimes(1))
    expect(saveTone.mock.calls[0]![0]).toEqual({ body: { tone: 'Warm, Calm' }, etag: '"t1"' })
    expect(mutateAsync).not.toHaveBeenCalled() // only the tone changed
  })

  it('reads the saved tone back and keeps a stale tone save', async () => {
    tenant.data = { data: { tone: 'Calm and clear' }, etag: '"t3"' }
    saveTone.mockRejectedValueOnce(new ApiError({ type: 'STALE_VERSION', status: 409, message: 'stale' }))
    tenant.refetch.mockResolvedValue({ data: { data: { tone: 'Bold' }, etag: '"t4"' } })
    render(<BrandVoiceCard canEdit />)
    expect(screen.getByTestId('voice-summary').textContent).toContain('Calm and clear')
    fireEvent.click(screen.getByRole('button', { name: 'Change tone' }))
    fireEvent.change(screen.getByLabelText('Tone of voice'), { target: { value: 'Warm' } })
    fireEvent.click(within(dialog()).getByTestId('voice-to-summary'))
    fireEvent.click(within(dialog()).getByTestId('voice-save'))
    await waitFor(() => expect(within(dialog()).getByText('Someone saved a newer version')).toBeTruthy())
    fireEvent.click(within(dialog()).getByTestId('voice-save'))
    await waitFor(() => expect(saveTone).toHaveBeenCalledTimes(2))
    expect(saveTone.mock.calls[1]![0]).toEqual({ body: { tone: 'Warm' }, etag: '"t4"' })
  })

  it('setup: "Do this later" folds the card to one line and saves nothing', () => {
    render(<BrandVoiceCard canEdit variant="setup" />)
    fireEvent.click(screen.getByTestId('voice-later'))
    expect(screen.getByTestId('voice-later-note').textContent).toContain('Skipped for now')
    expect(screen.queryByTestId('brand-voice-card')).toBeNull()
    expect(mutateAsync).not.toHaveBeenCalled()
  })

  it('skipping every question saves nothing and closes', async () => {
    render(<BrandVoiceCard canEdit />)
    fireEvent.click(screen.getByTestId('voice-start'))
    fireEvent.click(within(dialog()).getByTestId('voice-to-summary'))
    expect(within(dialog()).getByTestId('voice-summary-empty')).toBeTruthy()
    fireEvent.click(within(dialog()).getByTestId('voice-save'))
    await waitFor(() => expect(screen.queryByTestId('voice-dialog')).toBeNull())
    expect(mutateAsync).not.toHaveBeenCalled()
  })

  it('shows saved answers as the read-back; Change opens that question', () => {
    query.data = { data: { ...empty, brand_voice: savedVoice }, etag: '"v3"' }
    render(<BrandVoiceCard canEdit />)
    expect(screen.getByTestId('voice-summary').textContent).toContain('Students')
    expect(screen.getByText('How Kuinn will write for you')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Change price' }))
    expect(within(dialog()).getByRole('radio', { name: /Budget/ }).getAttribute('aria-checked')).toBe('true')
  })

  it('edit: changes a saved answer and sends the whole voice', async () => {
    query.data = { data: { ...empty, brand_voice: savedVoice }, etag: '"v3"' }
    render(<BrandVoiceCard canEdit />)
    fireEvent.click(screen.getByTestId('voice-edit'))
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Change uses words like' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove comfy' }))
    fireEvent.click(within(dialog()).getByTestId('voice-to-summary'))
    fireEvent.click(within(dialog()).getByTestId('voice-save'))
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1))
    expect(mutateAsync.mock.calls[0]![0]).toEqual({
      etag: '"v3"',
      body: { brand_description: null, brand_voice: { ...savedVoice, words_to_use: [] } },
    })
  })

  it('a stale save keeps the answers, loads the latest, and saves again with its ETag', async () => {
    query.data = { data: { ...empty, brand_voice: savedVoice }, etag: '"v3"' }
    mutateAsync.mockRejectedValueOnce(new ApiError({ type: 'STALE_VERSION', status: 409, message: 'stale' }))
    query.refetch.mockResolvedValue({ data: { data: { ...empty, brand_voice: savedVoice }, etag: '"v4"' } })
    render(<BrandVoiceCard canEdit />)
    fireEvent.click(screen.getByTestId('voice-edit'))
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Change writes for' }))
    fireEvent.change(screen.getByLabelText('Who buys it'), { target: { value: 'Office goers' } })
    fireEvent.click(within(dialog()).getByTestId('voice-to-summary'))
    fireEvent.click(within(dialog()).getByTestId('voice-save'))
    await waitFor(() => expect(within(dialog()).getByText('Someone saved a newer version')).toBeTruthy())
    expect(within(dialog()).getByTestId('voice-summary').textContent).toContain('Office goers')
    fireEvent.click(within(dialog()).getByTestId('voice-save'))
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(2))
    expect(mutateAsync.mock.calls[1]![0].etag).toBe('"v4"')
  })

  it('read only: shows the answers with no way to edit', () => {
    query.data = { data: { ...empty, brand_voice: savedVoice }, etag: '"v3"' }
    render(<BrandVoiceCard canEdit={false} />)
    expect(screen.getByTestId('voice-summary').textContent).toContain('Students')
    expect(screen.queryByTestId('voice-edit')).toBeNull()
    expect(screen.queryByRole('button', { name: /Change/ })).toBeNull()
  })
})
