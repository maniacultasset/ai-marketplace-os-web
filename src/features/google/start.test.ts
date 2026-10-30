import { afterEach, describe, expect, it, vi } from 'vitest'
import { bindingHash, GOOGLE_START_PATH, startGoogle, StorageBlockedError, takeTicket } from './start'

const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0))

describe('startGoogle / takeTicket', () => {
  afterEach(() => {
    sessionStorage.clear()
    vi.restoreAllMocks()
  })

  it('keeps the secret in sessionStorage and sends only its SHA-256, on a relative path', async () => {
    const go = vi.fn()
    await startGoogle({ intent: 'signup', returnTo: '/products?x=1' }, go)
    const ticket = JSON.parse(sessionStorage.getItem('gsi')!) as { bind: string; returnTo: string; intent: string }
    expect(ticket.bind).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(ticket).toMatchObject({ returnTo: '/products?x=1', intent: 'signup' })

    const url = go.mock.calls[0]![0] as string
    expect(url.startsWith(`${GOOGLE_START_PATH}?b=`)).toBe(true)
    const b = url.split('?b=')[1]!
    expect(b).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(url).not.toContain(ticket.bind)
    expect(fromB64url(ticket.bind)).toHaveLength(32)
    expect(b).toBe(await bindingHash(ticket.bind))
  })

  it('hashes the secret text the way the API does (sha256 of its ASCII, base64url)', async () => {
    // Vectors computed with the API's own helper: base64url(sha256(secret.encode("ascii"))).
    expect(await bindingHash('A'.repeat(43))).toBe('DwBzhbb51LfusnSGBa_hqYSgo7-j8BTQnip4TOnlzRo')
    expect(await bindingHash('0123456789abcdefghijklmnopqrstuvwxyzABCDEFG')).toBe('g0tuZ6q412zO9IRkeAUs8HN6MQeXPsGce37J3Rsc8wQ')
  })

  it('a fresh secret every time', async () => {
    const go = vi.fn()
    await startGoogle({ intent: 'login' }, go)
    const first = sessionStorage.getItem('gsi')
    await startGoogle({ intent: 'login' }, go)
    expect(sessionStorage.getItem('gsi')).not.toBe(first)
    expect(go.mock.calls[0]![0]).not.toBe(go.mock.calls[1]![0])
  })

  it('drops an unsafe return path', async () => {
    await startGoogle({ intent: 'login', returnTo: '//evil.example' }, vi.fn())
    expect(JSON.parse(sessionStorage.getItem('gsi')!).returnTo).toBeNull()
  })

  it('takeTicket is one use and re-checks what it reads', async () => {
    await startGoogle({ intent: 'login', returnTo: '/home' }, vi.fn())
    const t = takeTicket()
    expect(t).toMatchObject({ intent: 'login', returnTo: '/home' })
    expect(sessionStorage.getItem('gsi')).toBeNull()
    expect(takeTicket()).toBeNull()

    sessionStorage.setItem('gsi', JSON.stringify({ bind: 'short', intent: 'login' }))
    expect(takeTicket()).toBeNull()
    sessionStorage.setItem('gsi', '{not json')
    expect(takeTicket()).toBeNull()
    sessionStorage.setItem('gsi', JSON.stringify({ bind: 'a'.repeat(43), returnTo: 'https://evil.example', intent: 'admin' }))
    expect(takeTicket()).toEqual({ bind: 'a'.repeat(43), returnTo: null, intent: 'login' })
  })

  it('refuses to leave when storage is blocked', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    const go = vi.fn()
    await expect(startGoogle({ intent: 'login' }, go)).rejects.toBeInstanceOf(StorageBlockedError)
    expect(go).not.toHaveBeenCalled()
  })
})
