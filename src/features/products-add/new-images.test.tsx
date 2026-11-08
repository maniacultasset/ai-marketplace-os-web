import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PendingImage } from './new-images-model'
import { placePending } from './new-images-model'
import { NewProductImages } from './new-images'

afterEach(cleanup)

const img = (over: Partial<PendingImage>): PendingImage => ({
  localId: Math.random().toString(36),
  file: new File(['x'], 'a.jpg', { type: 'image/jpeg' }),
  previewUrl: 'blob:a',
  slot: 'main',
  role: null,
  multipartKey: 'k',
  stage: { kind: 'queued' },
  ...over,
})

const setup = (images: PendingImage[] = []) => {
  const onAdd = vi.fn()
  const onRemove = vi.fn()
  render(<NewProductImages images={images} onAdd={onAdd} onRemove={onRemove} onRetry={vi.fn()} />)
  return { onAdd, onRemove }
}

describe('guided form photos (SI12)', () => {
  it('shows the four tiles, Front first, each sending its slot and role', async () => {
    const { onAdd } = setup()
    expect(screen.getAllByTestId(/^photo-slot-(front|back|close_up|size_chart)$/).map((t) => t.dataset.testid)).toEqual([
      'photo-slot-front',
      'photo-slot-back',
      'photo-slot-close_up',
      'photo-slot-size_chart',
    ])
    // "Required" sits on the Front tile itself; the row of three has its own "Recommended" caption.
    expect(within(screen.getByTestId('photo-slot-front')).getByTestId('photo-slot-required').textContent).toBe('Required')
    expect(screen.getAllByText('Required')).toHaveLength(1)
    const caption = screen.getByTestId('photo-slots-recommended')
    expect(caption.textContent).toBe('Recommended')
    expect(caption.compareDocumentPosition(screen.getByTestId('photo-slot-front')) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy()
    expect(caption.compareDocumentPosition(screen.getByTestId('photo-slot-back')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(screen.getByTestId('photo-slot-back')).queryByText('Recommended')).toBeNull()
    const f = new File(['x'], 'back.jpg', { type: 'image/jpeg' })
    await userEvent.upload(screen.getByLabelText('Back photo file'), f)
    expect(onAdd).toHaveBeenCalledWith([f], 'secondary', 'back')
    await userEvent.upload(screen.getByLabelText('Front photo file'), f)
    expect(onAdd).toHaveBeenLastCalledWith([f], 'main', null)
    await userEvent.upload(screen.getByLabelText('Size chart photo file'), f)
    expect(onAdd).toHaveBeenLastCalledWith([f], 'size_chart', null)
  })

  it('keeps More photos collapsed until opened, then adds other kinds', async () => {
    const { onAdd } = setup()
    expect(screen.queryByLabelText('Image files')).toBeNull()
    await userEvent.click(screen.getByTestId('more-photos-toggle'))
    await userEvent.click(screen.getByRole('radio', { name: 'Lifestyle' }))
    const f = new File(['x'], 'l.jpg', { type: 'image/jpeg' })
    await userEvent.upload(screen.getByLabelText('Image files'), [f, f])
    expect(onAdd).toHaveBeenCalledWith([f, f], 'lifestyle', null)
  })

  it('shows a chosen photo in its tile with its state, and removes it', async () => {
    const back = img({ slot: 'secondary', role: 'back' })
    const { onRemove } = setup([img({ stage: { kind: 'staged', productId: 'p', storageKey: 'k' } }), back])
    expect(within(screen.getByTestId('photo-slot-front')).getByText('Ready')).toBeTruthy()
    // A filled Front no longer says Required.
    expect(screen.queryByTestId('photo-slot-required')).toBeNull()
    expect(within(screen.getByTestId('photo-slot-back')).getByText('Uploads when you save')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Remove back photo' }))
    expect(onRemove).toHaveBeenCalledWith(back.localId)
  })

  it('a new photo replaces the one in its tile; More photos keep adding', () => {
    const front = img({})
    const back = img({ slot: 'secondary', role: 'back' })
    const extra = img({ slot: 'secondary' })
    const newBack = img({ slot: 'secondary', role: 'back' })
    const { next, dropped } = placePending([front, back, extra], [newBack])
    expect(dropped).toEqual([back])
    expect(next).toEqual([front, extra, newBack])
    const another = img({ slot: 'secondary' })
    expect(placePending(next, [another]).dropped).toEqual([])
    // An unreadable file never pushes the good one out.
    expect(placePending([front], [img({ stage: { kind: 'invalid', message: 'x' } })]).dropped).toEqual([])
  })
})
