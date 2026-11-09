import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProductThumb } from './products-page'

afterEach(cleanup)

describe('ProductThumb', () => {
  it('shows the signed main photo at its fixed size and asks again when the link fails', () => {
    const onError = vi.fn()
    render(<ProductThumb size={64} src="https://s/main.jpg" alt="Kurta main photo" onError={onError} />)
    const img = screen.getByAltText('Kurta main photo')
    expect(img.getAttribute('src')).toBe('https://s/main.jpg')
    expect((img.closest('[style]') as HTMLElement).style.width).toBe('64px')
    fireEvent.error(img)
    expect(onError).toHaveBeenCalledOnce()
  })

  it('keeps the placeholder, hidden from screen readers, with no photo', () => {
    const { container } = render(<ProductThumb />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.firstElementChild?.getAttribute('aria-hidden')).toBe('true')
  })
})
