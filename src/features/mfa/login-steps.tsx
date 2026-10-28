/**
 * The sign-in steps after the password (contract 2.0.0; docs/HANDOFF-FE.md §6): the code step
 * (`mfa_required`), forced enrolment (`mfa_enrollment_required`), the recovery codes shown once,
 * and the forced password change (`password_change_required`). Each step holds its challenge token,
 * codes and secrets in component state only, which React drops when the step unmounts (no
 * setState-on-unmount cleanups: StrictMode replays effects on a live component).
 *
 * Every refusal on the challenge routes is the same 401 (wrong code, used code, expired or burned
 * challenge, locked account), so the copy never says which: no account enumeration.
 */
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { isApiError } from '@/api/errors'
import type { LoginConfirmOut, LoginResult, TotpEnrollOut } from '@/api/types'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { FormAlert } from '@/features/public/auth-frame'
import { useCountdown } from '@/features/signup-admin/use-countdown'
import { loginConfirm, loginEnroll, loginMfa, mfaErrorMessage, passwordExpired } from './api'
import { CodeField, QrCode, RecoveryCodes, SetupKey, type FactorKind } from './components'
import { CHALLENGE_ATTEMPTS, CODE_REJECTED, isRecoveryCode, isTotp, ttlLabel, type Challenge, type RestartReason } from './login-flow'
import { PasswordForm } from './password-form'

/** Restart when the challenge's clock runs out. */
function useChallengeExpiry(challenge: Challenge, onExpire: () => void) {
  const cb = useRef(onExpire)
  useEffect(() => {
    cb.current = onExpire
  })
  useEffect(() => {
    const t = setTimeout(() => cb.current(), Math.max(0, challenge.expiresAt - Date.now()))
    return () => clearTimeout(t)
  }, [challenge.expiresAt])
}

/** Heading + intro for a step. The heading takes focus on mount when `focus` is set. */
export function StepHeader({ title, introId, children, focus }: { title: string; introId: string; children: ReactNode; focus?: boolean }) {
  const ref = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (focus) ref.current?.focus()
  }, [focus])
  return (
    <div>
      <h1 ref={ref} tabIndex={-1} className="text-h1 text-ink outline-none" data-testid="step-title">
        {title}
      </h1>
      <div id={introId} className="mt-2 text-body text-ink-2">
        {children}
      </div>
    </div>
  )
}

interface CodeAttempt {
  error: string | null
  formError: { message: string; ref: string | null } | null
}

/**
 * Shared handling for a code submit on a challenge route: 401 counts an attempt (the server burns
 * the challenge at 5), 429 waits, 501 means MFA is off, 422 is a field problem.
 */
function useCodeSubmit(onRestart: (r: RestartReason) => void) {
  const [state, setState] = useState<CodeAttempt>({ error: null, formError: null })
  const [busy, setBusy] = useState(false)
  const attempts = useRef(0)
  const countdown = useCountdown()

  async function run(call: () => Promise<void>, onRejected: () => void) {
    setBusy(true)
    setState({ error: null, formError: null })
    try {
      await call()
    } catch (e) {
      if (!isApiError(e)) {
        setState({ error: null, formError: { message: mfaErrorMessage(e), ref: null } })
      } else if (e.status === 401) {
        attempts.current += 1
        if (attempts.current >= CHALLENGE_ATTEMPTS) return onRestart('attempts')
        setState({ error: CODE_REJECTED, formError: null })
        onRejected()
      } else if (e.status === 501) {
        return onRestart('mfa-off')
      } else if (e.status === 429) {
        countdown.start(e.retryAfter ?? 60)
        setState({ error: null, formError: { message: 'Too many attempts.', ref: e.correlationId } })
      } else if (e.status === 422) {
        setState({ error: e.details[0]?.msg ?? CODE_REJECTED, formError: null })
        onRejected()
      } else {
        setState({ error: null, formError: { message: mfaErrorMessage(e), ref: e.correlationId } })
      }
    } finally {
      setBusy(false)
    }
  }
  const clear = () => setState({ error: null, formError: null })
  return { ...state, busy, waiting: countdown.left, run, clear }
}

function SubmitButton({ busy, waiting, label, busyLabel }: { busy: boolean; waiting: number; label: string; busyLabel: string }) {
  return (
    <Button type="submit" size="lg" className="w-full" disabled={busy || waiting > 0}>
      {busy ? <Spinner data-icon="inline-start" /> : null}
      {waiting > 0 ? `Try again in ${waiting} s` : busy ? busyLabel : label}
    </Button>
  )
}

// ---------------------------------------------------------------------------------------------

/** `mfa_required`: a TOTP code, or a recovery code behind a toggle. */
export function MfaCodeStep({
  challenge,
  onResult,
  onRestart,
}: {
  challenge: Challenge
  onResult: (r: LoginResult) => void
  onRestart: (r: RestartReason) => void
}) {
  const [kind, setKind] = useState<FactorKind>('totp')
  const [value, setValue] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const introId = useId()
  const sub = useCodeSubmit(onRestart)
  useChallengeExpiry(challenge, () => onRestart('expired'))

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    const v = kind === 'totp' ? value : value.trim()
    if (kind === 'totp' ? !isTotp(v) : !isRecoveryCode(v)) {
      setLocalError(kind === 'totp' ? 'Enter the 6-digit code.' : 'Enter a recovery code.')
      inputRef.current?.focus()
      return
    }
    setLocalError(null)
    void sub.run(
      async () => onResult(await loginMfa(challenge.token, kind === 'totp' ? { code: v } : { recovery_code: v })),
      () => {
        setValue('')
        inputRef.current?.focus()
      },
    )
  }

  const toggle = () => {
    setKind((k) => (k === 'totp' ? 'recovery' : 'totp'))
    setValue('')
    setLocalError(null)
    sub.clear()
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  return (
    <div className="flex flex-col gap-4" data-testid="mfa-step">
      <StepHeader title="Enter your login code" introId={introId}>
        {kind === 'totp'
          ? 'Open your authenticator app and type the 6-digit code for Kuinn.'
          : 'Type one of the recovery codes you saved when you set up login codes. Each code works once.'}
      </StepHeader>
      {sub.formError ? (
        <FormAlert testId="mfa-error" reference={sub.formError.ref} message={`${sub.formError.message}${sub.waiting ? ` Try again in ${sub.waiting} s.` : ''}`} />
      ) : null}
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <CodeField
          id="mfa-code"
          kind={kind}
          value={value}
          onChange={(v) => {
            setValue(v)
            setLocalError(null)
          }}
          error={localError ?? sub.error}
          describedBy={introId}
          autoFocus
          inputRef={inputRef}
        />
        <SubmitButton busy={sub.busy} waiting={sub.waiting} label="Verify" busyLabel="Checking…" />
      </form>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-line pt-4 text-small">
        <Button type="button" variant="link" onClick={toggle} data-testid="toggle-recovery">
          {kind === 'totp' ? 'Use a recovery code' : 'Use your authenticator app'}
        </Button>
        <span className="text-caption text-ink-3">This step expires after {ttlLabel(challenge.ttl)}.</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------------------------

/**
 * `mfa_enrollment_required`: a new secret (POST /auth/login/mfa/enroll, once per challenge), shown
 * as a QR code and a setup key, confirmed with a code (POST /auth/login/mfa/confirm), whose answer
 * carries the recovery codes and the next `LoginResult`.
 */
export function EnrollStep({
  challenge,
  onConfirmed,
  onRestart,
}: {
  challenge: Challenge
  onConfirmed: (out: LoginConfirmOut) => void
  onRestart: (r: RestartReason) => void
}) {
  const [secret, setSecret] = useState<TotpEnrollOut | null>(null)
  const [loadError, setLoadError] = useState<{ message: string; ref: string | null } | null>(null)
  const [value, setValue] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const started = useRef<string | null>(null)
  const introId = useId()
  const sub = useCodeSubmit(onRestart)
  useChallengeExpiry(challenge, () => onRestart('expired'))

  const load = () => {
    setLoadError(null)
    loginEnroll(challenge.token)
      .then(setSecret)
      .catch((e: unknown) => {
        if (isApiError(e) && e.status === 401) return onRestart('expired')
        if (isApiError(e) && e.status === 501) return onRestart('mfa-off')
        setLoadError({ message: mfaErrorMessage(e), ref: isApiError(e) ? e.correlationId : null })
      })
  }
  // One enrol call per challenge: a second one (StrictMode, a re-render) would mint another secret.
  useEffect(() => {
    if (started.current === challenge.token) return
    started.current = challenge.token
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per challenge token
  }, [challenge.token])

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!isTotp(value)) {
      setLocalError('Enter the 6-digit code from your app.')
      inputRef.current?.focus()
      return
    }
    setLocalError(null)
    void sub.run(
      async () => onConfirmed(await loginConfirm(challenge.token, value)),
      () => {
        setValue('')
        inputRef.current?.focus()
      },
    )
  }

  return (
    <div className="flex flex-col gap-5" data-testid="enroll-step">
      <StepHeader title="Set up login codes" introId={introId} focus>
        Your account now needs a code from an authenticator app each time you sign in. This keeps marketplace data safe
        even if your password leaks.
      </StepHeader>
      {loadError ? (
        <div className="flex flex-col gap-3">
          <FormAlert testId="enroll-error" message={loadError.message} reference={loadError.ref} />
          <Button type="button" variant="outline" onClick={load} className="self-start">
            Try again
          </Button>
        </div>
      ) : null}
      <ol className="flex flex-col gap-5">
        <li className="flex flex-col gap-1">
          <p className="text-body font-semibold text-ink">1. Get an authenticator app</p>
          <p className="text-small text-ink-2">Google Authenticator, Microsoft Authenticator, 1Password or any app that shows 6-digit codes.</p>
        </li>
        <li className="flex flex-col gap-3">
          <p className="text-body font-semibold text-ink">2. Scan this QR code with the app</p>
          {secret ? (
            <div className="flex flex-col items-start gap-4">
              <QrCode uri={secret.otpauth_uri} />
              <SetupKey secret={secret.secret_b32} />
            </div>
          ) : loadError ? null : (
            <div className="flex flex-col gap-3" aria-busy="true" aria-label="Preparing your setup key">
              <Skeleton className="size-[184px] rounded-[10px]" />
              <Skeleton className="h-10 w-full" />
            </div>
          )}
        </li>
        <li className="flex flex-col gap-3">
          <p className="text-body font-semibold text-ink">3. Enter the code the app shows</p>
          {sub.formError ? (
            <FormAlert testId="enroll-confirm-error" reference={sub.formError.ref} message={`${sub.formError.message}${sub.waiting ? ` Try again in ${sub.waiting} s.` : ''}`} />
          ) : null}
          <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
            <CodeField
              id="enroll-code"
              kind="totp"
              value={value}
              onChange={(v) => {
                setValue(v)
                setLocalError(null)
              }}
              error={localError ?? sub.error}
              disabled={!secret}
              inputRef={inputRef}
            />
            <SubmitButton busy={sub.busy} waiting={sub.waiting} label="Turn on login codes" busyLabel="Checking…" />
          </form>
        </li>
      </ol>
      <p className="text-caption text-ink-3">This step expires after {ttlLabel(challenge.ttl)}.</p>
    </div>
  )
}

// ---------------------------------------------------------------------------------------------

/** The 10 recovery codes after enrolment, shown once; Continue goes on with `next`. */
export function RecoveryCodesStep({ codes, email, onContinue }: { codes: string[]; email: string; onContinue: () => void }) {
  const introId = useId()
  return (
    <div className="flex flex-col gap-4" data-testid="recovery-step">
      <StepHeader title="Save your recovery codes" introId={introId} focus>
        If you lose your phone, sign in with one of these codes instead. Each code works once, and you will not see them
        again.
      </StepHeader>
      <RecoveryCodes codes={codes} account={email} onContinue={onContinue} />
    </div>
  )
}

// ---------------------------------------------------------------------------------------------

/**
 * `password_change_required` (expired, set by staff, or failing the current rules): a new password
 * through POST /auth/password/expired with the challenge.
 */
export function PasswordChangeStep({
  challenge,
  email,
  onResult,
  onRestart,
}: {
  challenge: Challenge
  email: string
  onResult: (r: LoginResult) => void
  onRestart: (r: RestartReason) => void
}) {
  const introId = useId()
  useChallengeExpiry(challenge, () => onRestart('expired'))
  return (
    <div className="flex flex-col gap-4" data-testid="password-step">
      <StepHeader title="Choose a new password" introId={introId} focus>
        Your password needs to change before you continue. It may be a year old, set by our support team, or not meet
        the current rules.
      </StepHeader>
      <PasswordForm
        email={email}
        requireCurrent={false}
        submitLabel="Save and continue"
        idPrefix="expired"
        onSubmit={async ({ new_password }) => {
          try {
            onResult(await passwordExpired(challenge.token, new_password))
          } catch (e) {
            if (isApiError(e) && e.status === 401) return onRestart('expired')
            if (isApiError(e) && e.status === 501) return onRestart('mfa-off')
            throw e
          }
        }}
      />
      <p className="text-caption text-ink-3">This step expires after {ttlLabel(challenge.ttl)}.</p>
    </div>
  )
}
