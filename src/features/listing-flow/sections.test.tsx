import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { ActionState, ListingDetail } from '@/features/listings/model'
import type { ErrorItem } from './gates'
import type { ListingRequirements } from './sections-model'

const save = vi.fn()
const regenerate = vi.fn()
let paused = false
vi.mock('@/features/listings/api', () => ({
  useSaveContent: () => ({ mutate: save, isPending: false }),
  useRegenerateListing: () => ({ mutate: regenerate, isPending: false }),
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...rest }: { to: string; params?: unknown; search?: unknown; children: ReactNode }) => {
    const { params: _p, search: _s, ...attrs } = rest as Record<string, unknown>
    return (
      <a href={to} {...(attrs as object)}>
        {children}
      </a>
    )
  },
}))
vi.mock('@/features/ai-credit/use-ai-paused', () => ({ useAiPaused: () => paused }))
vi.mock('@/features/listings/job-memory', () => ({ rememberJob: vi.fn() }))
vi.mock('@/lib/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() }, toastError: vi.fn() }))

const { SectionCards } = await import('./sections')

afterEach(cleanup)
beforeEach(() => {
  save.mockReset()
  regenerate.mockReset()
  paused = false
})

const ON: ActionState = { show: true, enabled: true }

function listing(over: Partial<ListingDetail> = {}, content: Partial<NonNullable<ListingDetail['content']>> = {}): ListingDetail {
  return {
    id: 'l1',
    product_id: 'p1',
    marketplace: 'amazon',
    status: 'validated',
    marketplace_state: 'not_submitted',
    current_version_id: 'v1',
    status_changed_at: '2026-11-11T09:00:00Z',
    created_at: '2026-11-11T09:00:00Z',
    updated_at: '2026-11-11T09:00:00Z',
    locked_paths: [],
    affected_sections: [],
    content: {
      product_id: 'p1',
      marketplace: 'amazon',
      category: 'ethnic_wear_kurta_sets',
      version: 1,
      content: { title: 'Cotton kurta set', bullets: ['Soft cotton', 'Straight fit'], description: 'A cotton kurta set.' },
      keywords: { search_terms: ['kurta'], hidden_terms: ['cotton kurta'] },
      attributes: { pattern: 'solid', color: 'Blue', sleeve_count: 2 },
      attribute_sources: { color: 'color' },
      ...content,
    },
    ...over,
  } as ListingDetail
}

const REQ: ListingRequirements = {
  listing_id: 'l1',
  marketplace: 'amazon',
  category: 'ethnic_wear_kurta_sets',
  rules_version: 3,
  has_template: true,
  fields: [
    { path: 'content.title', max_chars: 200, min_chars: 5, banned_terms: ['best', 'guaranteed', 'free shipping', 'cheap', 'sale', 'offer'], banned_count: 9, rules: [] },
    { path: 'content.bullets', max_items: 5, banned_count: 0 },
    { path: 'content.bullets[*]', max_chars: 500, banned_count: 0 },
    { path: 'content.description', max_chars: 2000, banned_count: 0 },
    { path: 'keywords.hidden_terms', max_bytes: 250, banned_count: 0 },
    { path: '*', banned_count: 0, rules: ['No links, web addresses, emails or phone numbers.'] },
  ],
  attributes: [
    { key: 'color', level: 'required', allowed_count: 0 },
    { key: 'fabric_type', level: 'required', value_type: 'enum', allowed_values: ['Cotton', 'Silk'], allowed_count: 2 },
    { key: 'pattern', level: 'optional', value_type: 'enum', allowed_values: ['Solid', 'Printed'], allowed_count: 2 },
    { key: 'fit', level: 'recommended', allowed_count: 0 },
  ],
}

function show(
  l: ListingDetail,
  findings: ErrorItem[] = [],
  states: { edit?: ActionState; regenerate?: ActionState } = {},
  requirements: ListingRequirements | null | 'loading' = REQ,
) {
  const onSaved = vi.fn()
  render(
    <TooltipProvider>
      <SectionCards
        listing={l}
        etag='"v1"'
        findings={findings}
        editState={states.edit ?? ON}
        regenerateState={states.regenerate ?? ON}
        onSaved={onSaved}
        requirements={requirements === 'loading' ? undefined : requirements}
      />
    </TooltipProvider>,
  )
  return { onSaved }
}

const card = (s: string) => within(screen.getByTestId(`section-${s}`))
const lastBody = () => save.mock.calls.at(-1)![0].body

describe('Section cards', () => {
  it('shows one card per section, each with its own counter', () => {
    show(listing())
    for (const s of ['title', 'bullets', 'description', 'keywords', 'attributes']) expect(screen.getByTestId(`section-${s}`)).toBeTruthy()
    expect(screen.getByTestId('section-title-count').textContent).toBe('16 / 200')
    expect(screen.getByTestId('section-bullets-count').textContent).toBe('2 / 5')
    expect(screen.getByTestId('section-keywords-count').textContent).toBe('12 / 250 bytes')
    expect(screen.getByTestId('section-attributes-count').textContent).toBe('3 values · 1 required missing')
  })

  it('shows each section’s marketplace rules read from the backend, and no limit without them', async () => {
    show(listing())
    expect(card('title').getByTestId('section-title-rules').textContent).toContain('Up to 200 characters, at least 5 characters.')
    expect(card('title').getByTestId('section-title-rules').textContent).toContain('“best”, “guaranteed”, “free shipping”, “cheap”, “sale” and 4 more')
    expect(card('title').getByTestId('section-title-rules').textContent).toContain('No links, web addresses')
    expect(card('bullets').getByTestId('section-bullets-rules').textContent).toContain('Up to 5 key features, each up to 500 characters.')
    expect(card('keywords').getByTestId('section-keywords-rules').textContent).toContain('up to 250 bytes in all')
    expect(card('attributes').getByTestId('section-attributes-rules').textContent).toBe('Amazon needs color, fabric type for this category.')
    await userEvent.click(card('title').getByRole('button', { name: 'Show all' }))
    expect(card('title').getByTestId('section-title-rules').textContent).toContain('“offer” and 3 more')
    cleanup()
    show(listing({ marketplace: 'flipkart' }), [], {}, null)
    expect(screen.getByTestId('section-title-count').textContent).toBe('16 characters')
    expect(screen.getByTestId('section-bullets-count').textContent).toBe('2 key features')
    expect(screen.queryByTestId('section-title-rules')).toBeNull()
  })

  it('holds the counters while the rules load', () => {
    show(listing(), [], {}, 'loading')
    expect(screen.getByTestId('section-title-count').textContent).toBe('')
    expect(screen.queryByTestId('section-title-warning')).toBeNull()
  })

  it('shows each attribute’s level, its allowed values, and the required ones the listing lacks', () => {
    show(listing())
    const pattern = within(screen.getByTestId('section-attributes-row-pattern'))
    expect(pattern.getByText('Allowed: Solid, Printed.')).toBeTruthy()
    const color = within(screen.getByTestId('section-attributes-row-color'))
    expect(color.getByText('Required')).toBeTruthy()
    const fabric = within(screen.getByTestId('section-attributes-row-fabric_type'))
    expect(fabric.getByText(/Not set/)).toBeTruthy()
    expect(fabric.getByTestId('section-attributes-add-fabric_type')).toBeTruthy()
    expect(within(screen.getByTestId('section-attributes-row-fit')).getByText('Recommended')).toBeTruthy()
  })

  it('saves only the title, with the rest of the content as it is', async () => {
    const { onSaved } = show(listing())
    await userEvent.click(card('title').getByTestId('section-title-edit'))
    const input = screen.getByTestId('section-title-input')
    await userEvent.clear(input)
    await userEvent.type(input, 'Blue cotton kurta set')
    expect(screen.getByText(/The agent does not run/)).toBeTruthy()
    await userEvent.click(screen.getByTestId('section-title-save'))
    expect(lastBody()).toEqual({
      content: { title: 'Blue cotton kurta set', bullets: ['Soft cotton', 'Straight fit'], description: 'A cotton kurta set.' },
    })
    expect(save.mock.calls[0]![0].etag).toBe('"v1"')
    save.mock.calls[0]![1].onSuccess()
    expect(onSaved).toHaveBeenCalledWith('title')
  })

  it('points a blank title at the field and does not save', async () => {
    show(listing())
    await userEvent.click(screen.getByTestId('section-title-edit'))
    await userEvent.clear(screen.getByTestId('section-title-input'))
    await userEvent.click(screen.getByTestId('section-title-save'))
    expect(save).not.toHaveBeenCalled()
    const input = screen.getByTestId('section-title-input')
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(document.getElementById(input.getAttribute('aria-describedby')!)?.textContent).toBe('Write a title.')
  })

  it('warns at the marketplace limit without blocking the save', async () => {
    show(listing({}, { content: { title: 'x'.repeat(205), bullets: ['a'], description: 'd' } }))
    expect(screen.getByTestId('section-title-warning').textContent).toContain('Amazon allows 200 characters')
    await userEvent.click(screen.getByTestId('section-title-edit'))
    await userEvent.click(screen.getByTestId('section-title-save'))
    expect(save).toHaveBeenCalledOnce()
  })

  it('edits key features one input each: add, remove, and a per-feature counter', async () => {
    show(listing())
    await userEvent.click(screen.getByTestId('section-bullets-edit'))
    await userEvent.click(screen.getByLabelText('Remove key feature 1'))
    await userEvent.click(screen.getByTestId('section-bullets-add'))
    await userEvent.type(screen.getByTestId('section-bullets-input-1'), 'Machine wash')
    await userEvent.click(screen.getByTestId('section-bullets-save'))
    expect(lastBody().content.bullets).toEqual(['Straight fit', 'Machine wash'])
    expect(lastBody().content.title).toBe('Cotton kurta set')
  })

  it('flags a key feature over the hard cap at that input', async () => {
    show(listing())
    await userEvent.click(screen.getByTestId('section-bullets-edit'))
    const input = screen.getByTestId('section-bullets-input-0')
    await userEvent.clear(input)
    await userEvent.click(input)
    await userEvent.paste('y'.repeat(1001))
    await userEvent.click(screen.getByTestId('section-bullets-save'))
    expect(save).not.toHaveBeenCalled()
    expect(input.getAttribute('aria-invalid')).toBe('true')
  })

  it('saves search terms and backend keywords, and counts the backend bytes', async () => {
    show(listing())
    await userEvent.click(screen.getByTestId('section-keywords-edit'))
    const hidden = screen.getByTestId('section-keywords-hidden')
    await userEvent.clear(hidden)
    await userEvent.type(hidden, 'kurta, ethnic')
    expect(screen.getByTestId('section-keywords-count').textContent).toBe('12 / 250 bytes')
    await userEvent.click(screen.getByTestId('section-keywords-save'))
    expect(lastBody().keywords).toEqual({ search_terms: ['kurta'], hidden_terms: ['kurta', 'ethnic'] })
    expect(lastBody().content.title).toBe('Cotton kurta set')
  })

  it('edits attribute values in their own type and keeps product values read-only', async () => {
    show(listing())
    expect(card('attributes').getByText('· from your product')).toBeTruthy()
    await userEvent.click(screen.getByTestId('section-attributes-edit'))
    expect(screen.queryByTestId('section-attributes-input-color')).toBeNull()
    const count = screen.getByTestId('section-attributes-input-sleeve_count')
    await userEvent.clear(count)
    await userEvent.type(count, 'two')
    await userEvent.click(screen.getByTestId('section-attributes-save'))
    expect(save).not.toHaveBeenCalled()
    await userEvent.clear(count)
    await userEvent.type(count, '3')
    await userEvent.click(screen.getByTestId('section-attributes-save'))
    expect(lastBody().attributes).toEqual({ pattern: 'solid', color: 'Blue', sleeve_count: 3 })
  })

  it('sends an untouched attribute value exactly as stored', async () => {
    const blend = ['Cotton, polyester blend', ' Viscose ']
    show(listing({}, { attributes: { material_mix: blend, pattern: ' solid ', sleeve_count: 2 }, attribute_sources: {} }))
    await userEvent.click(screen.getByTestId('section-attributes-edit'))
    const count = screen.getByTestId('section-attributes-input-sleeve_count')
    await userEvent.clear(count)
    await userEvent.type(count, '3')
    await userEvent.click(screen.getByTestId('section-attributes-save'))
    expect(lastBody().attributes).toEqual({ material_mix: blend, pattern: ' solid ', sleeve_count: 3 })
  })

  it('names the attribute the server refused as a product value', async () => {
    const { ApiError } = await import('@/api/errors')
    show(listing())
    await userEvent.click(screen.getByTestId('section-attributes-edit'))
    await userEvent.click(screen.getByTestId('section-attributes-save'))
    save.mock.calls[0]![1].onError(
      new ApiError({ type: 'VALIDATION_FAILED', status: 422, message: 'Invalid', details: [{ loc: ['body', 'attributes', 'pattern'], msg: 'x' }] }),
    )
    expect((await screen.findByRole('alert')).textContent).toContain('Pattern comes from your product.')
  })

  it('regenerates only its own section', async () => {
    show(listing())
    await userEvent.click(screen.getByTestId('section-description-regenerate'))
    expect(regenerate.mock.calls[0]![0]).toMatchObject({ instructions: null, sections: ['description'] })
  })

  it('shows a lock, unlocks with the content unchanged, and asks for an unlock before a rewrite', async () => {
    show(listing({ locked_paths: ['content.title'] }))
    expect(screen.getByTestId('section-title-locked').textContent).toContain('Locked: your edit is kept.')
    expect(screen.queryByTestId('section-description-locked')).toBeNull()
    // the rewrite is refused while every path of the section is locked
    expect(screen.getByTestId('section-title-regenerate').getAttribute('aria-disabled')).toBe('true')
    await userEvent.click(screen.getByTestId('section-title-unlock'))
    expect(lastBody()).toEqual({
      content: { title: 'Cotton kurta set', bullets: ['Soft cotton', 'Straight fit'], description: 'A cotton kurta set.' },
      unlock: ['content.title'],
    })
  })

  it('keeps a partly locked keywords section rewritable', () => {
    show(listing({ locked_paths: ['keywords.search_terms'] }))
    expect(screen.getByTestId('section-keywords-locked')).toBeTruthy()
    expect(screen.getByTestId('section-keywords-regenerate').getAttribute('aria-disabled')).toBeNull()
  })

  it('shows each finding beside its field, and keeps it there while editing', async () => {
    const bullet = { field: 'content.bullets[1]', error_code: 'FIELD_TOO_LONG', message: 'Bullet 2 is too long.', severity: 'error' } as ErrorItem
    const title = { field: 'content.title', error_code: 'BANNED_TERM', message: 'Title contains the banned term best.', severity: 'error' } as ErrorItem
    const hidden = { field: 'keywords.hidden_terms', error_code: 'BYTE_BUDGET_EXCEEDED', message: 'Backend keywords are over 250 bytes.', severity: 'error' } as ErrorItem
    const attr = { field: 'attributes.fabric_type', error_code: 'MISSING_ATTRIBUTE', message: 'missing', severity: 'error' } as ErrorItem
    const general = { field: 'keywords.language', error_code: 'PATTERN_MISMATCH', message: 'Keywords look odd.', severity: 'warning' } as ErrorItem
    show(listing(), [bullet, title, hidden, attr, general])
    expect(screen.getByTestId('section-bullets-notes-1').textContent).toContain('too long')
    expect(screen.queryByTestId('section-bullets-notes-0')).toBeNull()
    expect(screen.getByTestId('section-title-notes').textContent).toContain('banned term')
    expect(screen.getByTestId('section-keywords-hidden-notes').textContent).toContain('over 250 bytes')
    expect(screen.queryByTestId('section-keywords-search-notes')).toBeNull()
    expect(screen.getByTestId('section-attributes-notes-fabric_type').textContent).toContain('Fabric type is required')
    // only what no field shows is listed on the card
    expect(card('bullets').queryByTestId('section-bullets-findings')).toBeNull()
    expect(card('keywords').getByTestId('section-keywords-findings').textContent).toContain('Keywords look odd.')
    await userEvent.click(screen.getByTestId('section-title-edit'))
    expect(screen.getByTestId('section-title-input')).toBeTruthy()
    expect(screen.getByTestId('section-title-notes').textContent).toContain('banned term')
    await userEvent.click(screen.getByTestId('section-bullets-edit'))
    expect(screen.getByTestId('section-bullets-notes-1').textContent).toContain('too long')
  })

  it('puts a 422 refusal on the field it names', async () => {
    const { ApiError } = await import('@/api/errors')
    show(listing())
    await userEvent.click(screen.getByTestId('section-bullets-edit'))
    await userEvent.click(screen.getByTestId('section-bullets-save'))
    save.mock.calls[0]![1].onError(
      new ApiError({ type: 'VALIDATION_FAILED', status: 422, message: 'Invalid', details: [{ loc: ['body', 'content', 'bullets', 1], msg: 'too long' }] }),
    )
    const notes = await screen.findByTestId('section-bullets-notes-1')
    expect(within(notes).getByRole('alert')).toBeTruthy()
    expect(screen.getByTestId('section-bullets-input-1').getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByTestId('section-bullets-input-0').getAttribute('aria-invalid')).toBe('false')
  })

  it('holds the rewrite while AI is paused and hides it for a role without the right', () => {
    paused = true
    show(listing(), [], { regenerate: { show: true, enabled: true } })
    expect(screen.getByTestId('section-title-regenerate').getAttribute('aria-disabled')).toBe('true')
    cleanup()
    paused = false
    show(listing(), [], { regenerate: { show: false, enabled: false } })
    expect(screen.queryByTestId('section-title-regenerate')).toBeNull()
  })
})
