/**
 * Step-up (DPP-1, ADR-0021 §5). Under `MFA_ENFORCEMENT=all` a sensitive op answers 403
 * `MFA_STEP_UP_REQUIRED` unless the access token carries a code entered in the last 10 minutes.
 * `authFetch` (client.ts) catches that 403, asks the registered handler (the step-up dialog) for a
 * code, and replays the request once with the new access token. A 403 `MFA_ENROLLMENT_REQUIRED`
 * (no factor yet) calls the enrolment handler instead, which routes to Settings > Security.
 *
 * The handlers live in the React tree; this module only holds them, so the API layer has no React
 * or router import.
 */

/** `any`: a TOTP or a recovery code; `otp`: a TOTP code only (backend `step_up="otp"`). */
export type StepUpMode = 'any' | 'otp'

/**
 * One step-up prompt. `mode` can tighten from `any` to `otp` while the prompt is open, when a
 * TOTP-only request joins it: `subscribe` tells the dialog (a recovery code would be spent and the
 * TOTP-only request would still fail).
 */
export interface StepUpPrompt {
  readonly mode: StepUpMode
  subscribe(listener: (mode: StepUpMode) => void): () => void
}

/** Resolves true once a step-up succeeded and the new access token is in place. */
export type StepUpHandler = (prompt: StepUpPrompt) => Promise<boolean>

/**
 * Ops that need a TOTP code only (surface.py `step_up="otp"`): the account revoke and the sign-up
 * approve/reject. Every other step-up op also takes a recovery code. The contract does not mark the
 * mode, so step-up.test.ts pins this table against every op whose 403 lists the step-up code.
 */
export const STEP_UP_OPS: Readonly<Record<string, StepUpMode>> = {
  'PATCH /members/{user_id}': 'any',
  'POST /marketplaces/connect': 'any',
  'POST /auth/mfa/recovery-codes': 'any',
  'POST /auth/mfa/totp/enroll': 'any',
  'POST /auth/mfa/totp/confirm': 'any',
  'POST /marketplaces/accounts/{account_id}/revoke': 'otp',
  'POST /admin/signup-requests/{request_id}/approve': 'otp',
  'POST /admin/signup-requests/{request_id}/reject': 'otp',
}

/** Never intercepted: the step-up route itself (a wrong code there is 422, not a new dialog). */
const STEP_UP_ROUTE = '/auth/mfa/step-up'

function matches(template: string, path: string): boolean {
  const t = template.split('/')
  const p = path.split('/')
  return t.length === p.length && t.every((seg, i) => (seg.startsWith('{') && seg.endsWith('}') ? p[i] !== '' : seg === p[i]))
}

/** The mode for a request (`path` relative to /api/v1). Unknown ops default to `any`. */
export function stepUpModeFor(method: string, path: string): StepUpMode {
  const m = method.toUpperCase()
  for (const [op, mode] of Object.entries(STEP_UP_OPS)) {
    const [opMethod, template] = op.split(' ') as [string, string]
    if (opMethod === m && matches(template, path)) return mode
  }
  return 'any'
}

export const isStepUpRoute = (path: string) => path === STEP_UP_ROUTE

let handler: StepUpHandler | null = null
let enrollmentHandler: (() => void) | null = null
let pending: { promise: Promise<boolean>; tighten: () => void } | null = null

/** Register the step-up dialog. Returns the unregister function. */
export function setStepUpHandler(fn: StepUpHandler) {
  handler = fn
  return () => {
    if (handler === fn) handler = null
  }
}

/** Register what to do on `MFA_ENROLLMENT_REQUIRED` (route to enrolment). */
export function setEnrollmentHandler(fn: () => void) {
  enrollmentHandler = fn
  return () => {
    if (enrollmentHandler === fn) enrollmentHandler = null
  }
}

/**
 * Ask for a step-up. Single-flight: parallel 403s share one prompt. If any waiter needs `otp`, the
 * shared prompt switches to `otp`, so every waiter's replay can succeed. A request whose replay
 * still answers 403 surfaces that error, never a second loop.
 */
export function requestStepUp(mode: StepUpMode): Promise<boolean> {
  if (pending) {
    if (mode === 'otp') pending.tighten()
    return pending.promise
  }
  if (!handler) return Promise.resolve(false)
  let current: StepUpMode = mode
  const listeners = new Set<(m: StepUpMode) => void>()
  const prompt: StepUpPrompt = {
    get mode() {
      return current
    },
    subscribe(l) {
      listeners.add(l)
      return () => listeners.delete(l)
    },
  }
  const tighten = () => {
    if (current === 'otp') return
    current = 'otp'
    listeners.forEach((l) => l(current))
  }
  const promise = handler(prompt)
    .catch(() => false)
    .finally(() => {
      pending = null
    })
  pending = { promise, tighten }
  return promise
}

export function notifyEnrollmentRequired() {
  enrollmentHandler?.()
}
