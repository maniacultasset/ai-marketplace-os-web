import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const query = {
  data: { data: { default_manufacturer: null, website_url: 'https://kalakar.in' as string | null, updated_at: null }, etag: '"v1"' },
  isPending: false,
  error: null,
  refetch: vi.fn(),
}
const mutateAsync = vi.fn().mockResolvedValue({ data: {}, etag: '"v2"' })

vi.mock('@/features/products/api', () => ({
  useBrandManufacturer: () => query,
  useSaveBrandManufacturer: () => ({ mutateAsync, isPending: false }),
}))
vi.mock('@/lib/toast', () => ({ toast: { success: vi.fn() } }))

const { WebsiteCard, WEBSITE_HINT } = await import('./website-card')

afterEach(cleanup)
beforeEach(() => {
  mutateAsync.mockClear()
  query.data.data.website_url = 'https://kalakar.in'
  query.data.etag = '"v1"'
})

describe('WebsiteCard', () => {
  it('shows the saved website with the optional hint', () => {
    render(<WebsiteCard canEdit />)
    expect(screen.getByText('Website')).toBeTruthy()
    expect(screen.getByText(WEBSITE_HINT)).toBeTruthy()
    expect(WEBSITE_HINT).toBe('Optional. Saved on your brand profile.')
    expect(screen.getByTestId('brand-website-value').textContent).toBe('https://kalakar.in')
  })

  it('offers "Add website" when none is saved, and nothing to a reader', () => {
    query.data.data.website_url = null
    const view = render(<WebsiteCard canEdit />)
    expect(screen.getByTestId('website-edit').textContent).toBe('Add website')
    view.rerender(<WebsiteCard canEdit={false} />)
    expect(screen.queryByTestId('website-edit')).toBeNull()
    expect(screen.getByText(/An owner or admin can add it/)).toBeTruthy()
  })

  it('saves the trimmed website with the ETag the edit started from', async () => {
    const view = render(<WebsiteCard canEdit />)
    fireEvent.click(screen.getByTestId('website-edit'))
    query.data = { ...query.data, etag: '"v9"' }
    view.rerender(<WebsiteCard canEdit />)
    fireEvent.change(screen.getByLabelText('Website'), { target: { value: '  https://kalakar.in/shop ' } })
    fireEvent.click(screen.getByTestId('website-save'))
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled())
    expect(mutateAsync.mock.calls[0]![0]).toEqual({ body: { website_url: 'https://kalakar.in/shop' }, etag: '"v1"' })
  })

  it('clears with null when emptied (the website stays optional)', async () => {
    render(<WebsiteCard canEdit />)
    fireEvent.click(screen.getByTestId('website-edit'))
    fireEvent.change(screen.getByLabelText('Website'), { target: { value: '' } })
    fireEvent.click(screen.getByTestId('website-save'))
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled())
    expect(mutateAsync.mock.calls[0]![0].body).toEqual({ website_url: null })
  })

  it('keeps a bad address on screen with a plain reason and sends nothing', async () => {
    render(<WebsiteCard canEdit />)
    fireEvent.click(screen.getByTestId('website-edit'))
    fireEvent.change(screen.getByLabelText('Website'), { target: { value: 'kalakar.in' } })
    fireEvent.click(screen.getByTestId('website-save'))
    expect(await screen.findByText(/Start with https:\/\//)).toBeTruthy()
    expect(mutateAsync).not.toHaveBeenCalled()
  })
})
