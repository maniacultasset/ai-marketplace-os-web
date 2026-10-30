/**
 * The sign-in state after the first factor (password or Google), shared by /login and
 * /auth/google: every `LoginResult` goes through `advance`, and a signed-in answer stores the
 * tokens and leaves for the target. The screens are `SignInSteps`.
 */
import { useRouter } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { describeError, isApiError } from '@/api/errors'
import type { LoginResult } from '@/api/types'
import { advance, type Advance, type FlowStep, type RestartReason } from '@/features/mfa/login-flow'
import { rememberDevice } from '@/features/mfa/trusted-device'
import { finishSignIn } from '@/lib/auth'
import { toast } from '@/lib/toast'

/** "20 Nov 2026" for the grace notice. */
function graceDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export interface SignInFlow {
  step: FlowStep
  setStep: (step: FlowStep) => void
  /** Apply a decided next step: store the tokens and leave, or show the step. */
  apply: (next: Advance) => Promise<void>
  /**
   * Apply one `LoginResult` now (its challenge clock starts when it arrives). A trusted-browser
   * token in it is kept for this account first (features/mfa/trusted-device.ts).
   */
  onResult: (result: LoginResult) => Promise<void>
  /** Keep (or forget) this browser's trust from an answer that is applied later. */
  remember: (result: LoginResult) => Promise<void>
  /** Back to the start, with the reason. */
  restart: (reason: RestartReason) => void
}

export function useSignInFlow({
  email,
  target,
  onRestart,
  onError,
  onStep,
}: {
  /** The account signing in, once known: where a trusted-browser token is kept. */
  email: string
  /** Where to go once signed in. */
  target: string
  onRestart: (reason: RestartReason) => void
  /** Storing the tokens or loading the account failed. */
  onError: (error: { message: string; ref: string | null }) => void
  /** A step is now showing. */
  onStep?: () => void
}): SignInFlow {
  const router = useRouter()
  const [step, setStep] = useState<FlowStep>({ kind: 'credentials' })
  // The callbacks change identity on every render of the page; the flow reads the latest ones.
  const cb = useRef({ onRestart, onError, onStep, target, email })
  useEffect(() => {
    cb.current = { onRestart, onError, onStep, target, email }
  })

  const restart = useCallback((reason: RestartReason) => {
    setStep({ kind: 'credentials' })
    cb.current.onRestart(reason)
  }, [])

  const apply = useCallback(
    async (next: Advance) => {
      if (next.kind === 'invalid') return restart('invalid')
      if (next.kind === 'step') {
        cb.current.onStep?.()
        setStep(next.step)
        return
      }
      setStep({ kind: 'credentials' })
      try {
        await finishSignIn(next.tokens)
      } catch (e) {
        cb.current.onError({ message: describeError(e), ref: isApiError(e) ? e.correlationId : null })
        return
      }
      if (next.graceUntil) {
        toast.info('Set up login codes', {
          description: `Your account needs login codes from ${graceDate(next.graceUntil)}. Set them up in Settings > Security.`,
          action: { label: 'Set up', onClick: () => void router.navigate({ to: '/settings/security' }) },
          duration: 12_000,
        })
      }
      await router.invalidate()
      router.history.push(cb.current.target)
    },
    [restart, router],
  )
  const remember = useCallback((result: LoginResult) => rememberDevice(cb.current.email, result), [])
  const onResult = useCallback(
    async (result: LoginResult) => {
      await remember(result)
      return apply(advance(result))
    },
    [apply, remember],
  )

  return { step, setStep, apply, onResult, remember, restart }
}
