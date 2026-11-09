import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SavedPhoto } from './saved-photo'

afterEach(cleanup)

const frame = () => screen.getByTestId('photo')
const imgs = () => Array.from(frame().querySelectorAll('img'))

describe('SavedPhoto', () => {
  it('holds a placeholder at the frame size until the photo loads, then fades it in', () => {
    render(<SavedPhoto testId="photo" src="https://s/a.jpg" alt="Front photo" className="size-10" />)
    expect(frame().dataset.state).toBe('loading')
    expect(imgs()[0]!.className).toContain('opacity-0')
    fireEvent.load(imgs()[0]!)
    expect(frame().dataset.state).toBe('shown')
    expect(imgs()[0]!.className).toContain('opacity-100')
    expect(imgs()[0]!.getAttribute('alt')).toBe('Front photo')
  })

  it('keeps the shown photo while a fresh link loads, then swaps', () => {
    const { rerender } = render(<SavedPhoto testId="photo" src="https://s/a.jpg?sig=1" alt="Front photo" />)
    fireEvent.load(imgs()[0]!)
    rerender(<SavedPhoto testId="photo" src="https://s/a.jpg?sig=2" alt="Front photo" />)
    expect(imgs().map((i) => i.getAttribute('src'))).toEqual(['https://s/a.jpg?sig=1', 'https://s/a.jpg?sig=2'])
    fireEvent.load(imgs()[1]!)
    expect(imgs().map((i) => i.getAttribute('src'))).toEqual(['https://s/a.jpg?sig=2'])
  })

  it('falls back to the placeholder and asks for a fresh link once when a link fails', () => {
    const onError = vi.fn()
    render(<SavedPhoto testId="photo" src="https://s/expired.jpg" alt="Front photo" onError={onError} />)
    fireEvent.error(imgs()[0]!)
    expect(onError).toHaveBeenCalledTimes(1)
    expect(imgs()).toHaveLength(0)
    expect(frame().dataset.state).toBe('failed')
    expect(screen.getByText('Front photo').className).toContain('sr-only')
  })

  it('shows only the placeholder with no link', () => {
    render(<SavedPhoto testId="photo" alt="" />)
    expect(imgs()).toHaveLength(0)
    expect(frame().dataset.state).toBe('empty')
  })
})
