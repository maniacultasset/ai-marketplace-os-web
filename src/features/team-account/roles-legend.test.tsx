import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  profile: { data: undefined, isPending: true, isError: false } as {
    data: { data: { owner_self_approval: boolean } } | undefined
    isPending: boolean
    isError: boolean
  },
}))
vi.mock('@/features/brand/api', () => ({ useBrandProfile: () => state.profile }))

const { RolesLegend } = await import('./roles-legend')

afterEach(() => {
  cleanup()
  state.profile = { data: undefined, isPending: true, isError: false }
})

describe('RolesLegend approvals note', () => {
  it('keeps its place but says nothing while the brand loads', () => {
    render(<RolesLegend />)
    const span = screen.getByTestId('approvals-note').querySelector('span')
    expect(span?.className).toMatch(/invisible/)
    expect(span?.getAttribute('aria-hidden')).toBe('true')
  })

  it('follows the owner approval setting once the brand is read', () => {
    state.profile = { data: { data: { owner_self_approval: true } }, isPending: false, isError: false }
    render(<RolesLegend />)
    const note = screen.getByTestId('approvals-note')
    expect(note.textContent).toMatch(/Owner approval is on/)
    expect(note.querySelector('span')?.className).not.toMatch(/invisible/)
  })

  it('leaves the note out when the brand cannot be read', () => {
    state.profile = { data: undefined, isPending: false, isError: true }
    render(<RolesLegend />)
    expect(screen.queryByTestId('approvals-note')).toBeNull()
  })
})
