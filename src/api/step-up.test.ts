import { afterEach, describe, expect, it, vi } from 'vitest'
import openapi from './openapi.json'
import { requestStepUp, setStepUpHandler, STEP_UP_OPS, stepUpModeFor, type StepUpPrompt } from './step-up'

type Op = { responses?: Record<string, { description?: string }> }

describe('STEP_UP_OPS', () => {
  it('lists exactly the ops whose 403 can be MFA_STEP_UP_REQUIRED in the contract', () => {
    const paths = (openapi as unknown as { paths: Record<string, Record<string, Op>> }).paths
    const contract: string[] = []
    for (const [path, methods] of Object.entries(paths))
      for (const [m, op] of Object.entries(methods)) {
        if (op.responses?.['403']?.description?.includes('MFA_STEP_UP_REQUIRED'))
          contract.push(`${m.toUpperCase()} ${path.replace(/^\/api\/v1/, '')}`)
      }
    expect(Object.keys(STEP_UP_OPS).sort()).toEqual(contract.sort())
  })

  it('maps a concrete request to its mode (TOTP only for revoke and sign-up decisions)', () => {
    expect(stepUpModeFor('POST', '/marketplaces/accounts/0b1c/revoke')).toBe('otp')
    expect(stepUpModeFor('post', '/admin/signup-requests/abc/approve')).toBe('otp')
    expect(stepUpModeFor('POST', '/admin/signup-requests/abc/reject')).toBe('otp')
    expect(stepUpModeFor('PATCH', '/members/u1')).toBe('any')
    expect(stepUpModeFor('POST', '/marketplaces/connect')).toBe('any')
    expect(stepUpModeFor('POST', '/auth/mfa/recovery-codes')).toBe('any')
    // Unknown ops (a future step-up route) still get a dialog.
    expect(stepUpModeFor('POST', '/something/new')).toBe('any')
    // A path parameter matches one non-empty segment only.
    expect(stepUpModeFor('POST', '/marketplaces/accounts//revoke')).toBe('any')
  })
})

describe('requestStepUp', () => {
  let off: (() => void) | null = null
  afterEach(() => {
    off?.()
    off = null
  })

  it('resolves false with no dialog registered', async () => {
    expect(await requestStepUp('any')).toBe(false)
  })

  it('shares one dialog between parallel requests', async () => {
    let resolve!: (ok: boolean) => void
    const handler = vi.fn<(p: StepUpPrompt) => Promise<boolean>>(() => new Promise<boolean>((r) => (resolve = r)))
    off = setStepUpHandler(handler)
    const a = requestStepUp('any')
    const b = requestStepUp('any')
    resolve(true)
    expect(await Promise.all([a, b])).toEqual([true, true])
    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler.mock.calls[0]![0].mode).toBe('any')
    // The next 403 opens a new dialog.
    const c = requestStepUp('otp')
    resolve(false)
    expect(await c).toBe(false)
    expect(handler).toHaveBeenCalledTimes(2)
  })

  it('tightens the shared prompt to otp when a TOTP-only request joins', async () => {
    let resolve!: (ok: boolean) => void
    let prompt!: StepUpPrompt
    const seen: string[] = []
    off = setStepUpHandler((p) => {
      prompt = p
      p.subscribe((m) => seen.push(m))
      return new Promise<boolean>((r) => (resolve = r))
    })
    const a = requestStepUp('any')
    expect(prompt.mode).toBe('any')
    const b = requestStepUp('otp')
    expect(prompt.mode).toBe('otp')
    expect(seen).toEqual(['otp'])
    // A later `any` waiter never loosens it.
    void requestStepUp('any')
    expect(prompt.mode).toBe('otp')
    resolve(true)
    expect(await Promise.all([a, b])).toEqual([true, true])
  })

  it('treats a throwing handler as cancelled', async () => {
    off = setStepUpHandler(() => Promise.reject(new Error('boom')))
    expect(await requestStepUp('any')).toBe(false)
  })
})
