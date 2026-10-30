import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEVICE_KEY_PREFIX,
  deviceKey,
  forgetDeviceToken,
  liveDeviceTokens,
  MAX_ACCOUNTS,
  readDeviceToken,
  rememberDevice,
  writeDeviceToken,
} from './trusted-device'

const T = (c: string) => c.repeat(43)
// Relative to the real clock: `rememberDevice` reads it.
const NOW = Date.now()
const LATER = new Date(NOW + 30 * 86_400_000).toISOString()
const PAST = new Date(NOW - 86_400_000).toISOString()
const keys = () => Object.keys(localStorage).filter((k) => k.startsWith(DEVICE_KEY_PREFIX))

describe('trusted-browser storage', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('keys each account by a hash of its trimmed, lower-cased email, never the email itself', async () => {
    const a = await deviceKey('Meera@Acme.test ')
    expect(a).toBe(await deviceKey('meera@acme.test'))
    expect(a).toMatch(/^kuinn\.dt\.[A-Za-z0-9_-]{43}$/)
    expect(a).not.toContain('meera')
    expect(await deviceKey('ravi@acme.test')).not.toBe(a)
    expect(await deviceKey('   ')).toBeNull()
  })

  it('reads back only the token of the same account', async () => {
    await writeDeviceToken('meera@acme.test', T('a'), LATER, NOW)
    expect(await readDeviceToken('MEERA@acme.test', NOW)).toBe(T('a'))
    expect(await readDeviceToken('ravi@acme.test', NOW)).toBeNull()
    expect(JSON.stringify(localStorage)).not.toContain('meera')
  })

  it('treats an expired entry as absent and deletes it', async () => {
    await writeDeviceToken('meera@acme.test', T('a'), LATER, NOW)
    expect(await readDeviceToken('meera@acme.test', Date.parse(LATER))).toBeNull()
    expect(keys()).toEqual([])
  })

  it('never keeps a malformed token or expiry, and drops the old entry it replaced', async () => {
    await writeDeviceToken('meera@acme.test', T('a'), LATER, NOW)
    await writeDeviceToken('meera@acme.test', 'short', LATER, NOW)
    expect(keys()).toEqual([])
    await writeDeviceToken('meera@acme.test', T('a'), 'not a date', NOW)
    await writeDeviceToken('meera@acme.test', `${T('a').slice(1)}!`, LATER, NOW)
    await writeDeviceToken('meera@acme.test', T('a'), PAST, NOW)
    expect(keys()).toEqual([])
  })

  it('ignores an entry edited by hand into something unusable', async () => {
    const key = (await deviceKey('meera@acme.test'))!
    for (const raw of ['{', '"x"', JSON.stringify({ token: T('a') }), JSON.stringify({ token: 'x', expiresAt: NOW + 1000 })]) {
      localStorage.setItem(key, raw)
      expect(await readDeviceToken('meera@acme.test', NOW)).toBeNull()
    }
  })

  it(`keeps the newest ${MAX_ACCOUNTS} accounts and lists live tokens newest first`, async () => {
    for (let i = 0; i < MAX_ACCOUNTS + 2; i++) await writeDeviceToken(`u${i}@acme.test`, T(String.fromCharCode(97 + i)), LATER, NOW + i)
    expect(keys()).toHaveLength(MAX_ACCOUNTS)
    expect(await readDeviceToken('u0@acme.test', NOW)).toBeNull()
    expect(await readDeviceToken('u1@acme.test', NOW)).toBeNull()
    expect(liveDeviceTokens(NOW + 10)).toEqual(['g', 'f', 'e', 'd', 'c'].map(T))
    // Expired entries are left out (and cleaned up).
    expect(liveDeviceTokens(Date.parse(LATER))).toEqual([])
    expect(keys()).toEqual([])
  })

  it('never lists the same token twice (a repeat would fail the whole Google sign-in)', async () => {
    await writeDeviceToken('meera@acme.test', T('a'), LATER, NOW)
    await writeDeviceToken('ravi@acme.test', T('a'), LATER, NOW + 1)
    await writeDeviceToken('asha@acme.test', T('b'), LATER, NOW + 2)
    expect(liveDeviceTokens(NOW + 10)).toEqual([T('b'), T('a')])
  })

  it('forgets one account and leaves the others', async () => {
    await writeDeviceToken('meera@acme.test', T('a'), LATER, NOW)
    await writeDeviceToken('ravi@acme.test', T('b'), LATER, NOW)
    await forgetDeviceToken('Meera@acme.test')
    expect(await readDeviceToken('meera@acme.test', NOW)).toBeNull()
    expect(await readDeviceToken('ravi@acme.test', NOW)).toBe(T('b'))
  })

  it('blocked storage means no trust, never an error', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'key').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    await expect(writeDeviceToken('meera@acme.test', T('a'), LATER, NOW)).resolves.toBeUndefined()
    await expect(readDeviceToken('meera@acme.test', NOW)).resolves.toBeNull()
    await expect(forgetDeviceToken('meera@acme.test')).resolves.toBeUndefined()
    expect(liveDeviceTokens(NOW)).toEqual([])
  })

  it('without WebCrypto (an insecure page) nothing is stored or sent', async () => {
    vi.spyOn(crypto.subtle, 'digest').mockRejectedValue(new Error('no subtle'))
    await writeDeviceToken('meera@acme.test', T('a'), LATER, NOW)
    expect(keys()).toEqual([])
    expect(await readDeviceToken('meera@acme.test', NOW)).toBeNull()
  })
})

describe('rememberDevice (what a sign-in answer says about this browser)', () => {
  beforeEach(() => localStorage.clear())

  it('keeps a new or rotated token from a signed-in answer', async () => {
    await rememberDevice('meera@acme.test', { status: 'signed_in', device_token: T('a'), device_expires_at: LATER })
    expect(await readDeviceToken('meera@acme.test', NOW)).toBe(T('a'))
    await rememberDevice('meera@acme.test', { status: 'signed_in', device_token: T('b'), device_expires_at: LATER })
    expect(await readDeviceToken('meera@acme.test', NOW)).toBe(T('b'))
  })

  it('forgets the token when the API says it no longer counts', async () => {
    await writeDeviceToken('meera@acme.test', T('a'), LATER, NOW)
    await rememberDevice('meera@acme.test', { status: 'mfa_required', challenge_token: 'c', device_token_invalid: true })
    expect(await readDeviceToken('meera@acme.test', NOW)).toBeNull()
  })

  it('ignores a token on a non-signed-in answer, an answer without device fields, and an unknown account', async () => {
    await rememberDevice('meera@acme.test', { status: 'mfa_required', challenge_token: 'c', device_token: T('a'), device_expires_at: LATER })
    await rememberDevice('meera@acme.test', { status: 'signed_in' })
    await rememberDevice('', { status: 'signed_in', device_token: T('a'), device_expires_at: LATER })
    await rememberDevice(null, { status: 'signed_in', device_token: T('a'), device_expires_at: LATER })
    await rememberDevice('meera@acme.test', null)
    expect(keys()).toEqual([])
  })
})
