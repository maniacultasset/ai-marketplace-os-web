import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearStatusHandle, readStatusHandle, saveStatusHandle } from './status-handle'

const HANDLE = 'A'.repeat(21) + '_-' + 'z'.repeat(20)

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('status handle storage', () => {
  it('keeps only the handle, how to sign in and a safe return path', () => {
    expect(saveStatusHandle({ handle: HANDLE, via: 'google', returnTo: '/products' })).toBe(true)
    expect(readStatusHandle()).toEqual({ handle: HANDLE, via: 'google', returnTo: '/products' })
    const raw = JSON.parse(localStorage.getItem('kuinn.signup-status')!) as Record<string, unknown>
    expect(Object.keys(raw).sort()).toEqual(['handle', 'returnTo', 'via'])
  })

  it('drops an off-site return path and refuses a malformed handle', () => {
    saveStatusHandle({ handle: HANDLE, via: 'password', returnTo: '//evil.example' })
    expect(readStatusHandle()?.returnTo).toBeNull()
    expect(saveStatusHandle({ handle: 'short', via: 'password', returnTo: null })).toBe(false)
    localStorage.setItem('kuinn.signup-status', JSON.stringify({ handle: 'x', via: 'password' }))
    expect(readStatusHandle()).toBeNull()
    localStorage.setItem('kuinn.signup-status', '{not json')
    expect(readStatusHandle()).toBeNull()
  })

  it('clears the handle', () => {
    saveStatusHandle({ handle: HANDLE, via: 'password', returnTo: null })
    clearStatusHandle()
    expect(readStatusHandle()).toBeNull()
  })

  it('never throws when the browser blocks storage', () => {
    const blocked = () => {
      throw new DOMException('blocked', 'SecurityError')
    }
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(blocked)
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(blocked)
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(blocked)
    expect(saveStatusHandle({ handle: HANDLE, via: 'password', returnTo: null })).toBe(false)
    expect(readStatusHandle()).toBeNull()
    expect(() => clearStatusHandle()).not.toThrow()
  })
})
