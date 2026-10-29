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
import { Hash, KeyRound, QrCode, RotateCw, Smartphone, type LucideIcon } from 'lucide-react'
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { isApiError } from '@/api/errors'
import type { LoginConfirmOut, LoginResult, TotpEnrollOut } from '@/api/types'
import { Icon, IconTile } from '@/components/la/icons'
import { Stepper } from '@/components/la/progress'
import { Button } from '@/components/ui/button'
import { FormAlert } from '@/features/public/auth-frame'
import { useCountdown } from '@/features/signup-admin/use-countdown'
import { cn } from '@/lib/utils'
import { loginConfirm, loginEnroll, loginMfa, mfaErrorMessage, passwordExpired } from './api'
import { CodeField, QrPanel, RecoveryCodes, SubmitButton, type FactorKind } from './components'
import { CHALLENGE_ATTEMPTS, CODE_REJECTED, TOO_MANY, isRecoveryCode, isTotp, ttlLabel, type Challenge, type RestartReason } from './login-flow'
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

/** Heading + intro for a step, with an optional icon tile above. The heading takes focus on mount when `focus` is set. */
export function StepHeader({
  title,
  introId,
  children,
  focus,
  icon,
}: {
  title: string
  introId: string
  children: ReactNode
  focus?: boolean
  icon?: ReactNode
}) {
  const ref = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (focus) ref.current?.focus()
  }, [focus])
  return (
    <div>
      {icon ? <div className="mb-4">{icon}</div> : null}
      <h1 ref={ref} tabIndex={-1} className="text-[24px] leading-[30px] font-bold tracking-[-0.02em] text-ink outline-none sm:text-h1" data-testid="step-title">
        {title}
      </h1>
      <p id={introId} className="mt-2 max-w-[52ch] text-body text-pretty text-ink-2">
        {children}
      </p>
    </div>
  )
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

/**
 * "This step expires after 5 minutes." In the last minute it counts down ("expires in 0:45"),
 * quietly: no live region. The restart itself is `useChallengeExpiry`'s.
 */
function ExpiryNote({ challenge, className }: { challenge: Challenge; className?: string }) {
  const [left, setLeft] = useState<number | null>(null)
  useEffect(() => {
    let iv: ReturnType<typeof setInterval> | undefined
    const tick = () => setLeft(Math.max(0, Math.ceil((challenge.expiresAt - Date.now()) / 1000)))
    const t = setTimeout(
      () => {
        tick()
        iv = setInterval(tick, 1000)
      },
      Math.max(0, challenge.expiresAt - Date.now() - 60_000),
    )
    return () => {
      clearTimeout(t)
      clearInterval(iv)
    }
  }, [challenge.expiresAt])
  const urgent = left !== null && left < 60
  return (
    <p className={cn('flex items-center gap-1.5 text-caption', urgent ? 'text-attention-ink' : 'text-ink-3', className)}>
      <Icon name="clock" size={14} />
      {urgent ? `This step expires in ${clock(left)}.` : `This step expires after ${ttlLabel(challenge.ttl)}.`}
    </p>
  )
}

const ENROL_STEPS = [{ label: 'Connect app' }, { label: 'Save recovery codes' }] as const

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
        // A fixed message: the alert is assertive, so a ticking count in it would be read out each
        // second. The seconds left show on the disabled button.
        setState({ error: null, formError: { message: TOO_MANY, ref: e.correlationId } })
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
    <div className="flex flex-col gap-5" data-testid="mfa-step">
      <StepHeader
        title="Enter your login code"
        introId={introId}
        icon={<IconTile icon={kind === 'totp' ? Smartphone : KeyRound} tone="brand" size="lg" />}
      >
        {kind === 'totp'
          ? 'Open your authenticator app and type the 6-digit code for Kuinn.'
          : 'Type one of the recovery codes you saved when you set up login codes. Each code works once.'}
      </StepHeader>
      {sub.formError ? (
        <FormAlert testId="mfa-error" reference={sub.formError.ref} message={sub.formError.message} />
      ) : null}
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
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
          canAutoSubmit={!sub.busy && sub.waiting === 0}
          busy={sub.busy}
        />
        <SubmitButton busy={sub.busy} waiting={sub.waiting} label="Verify" busyLabel="Checking…" />
      </form>
      <div className="flex flex-col items-center gap-2 border-t border-line pt-5">
        <Button type="button" variant="link" className="min-h-11" onClick={toggle} data-testid="toggle-recovery">
          {kind === 'totp' ? <KeyRound data-icon="inline-start" /> : <Smartphone data-icon="inline-start" />}
          {kind === 'totp' ? 'Use a recovery code' : 'Use your authenticator app'}
        </Button>
        <ExpiryNote challenge={challenge} />
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

  const steps: { title: string; icon: LucideIcon; body: ReactNode; content: ReactNode }[] = [
    {
      title: 'Get an authenticator app',
      icon: Smartphone,
      body: (
        <>
          Google Authenticator, Microsoft Authenticator, 1Password or any app that shows{' '}
          <span className="whitespace-nowrap">6-digit codes</span>.
        </>
      ),
      content: null,
    },
    {
      title: 'Scan the QR code',
      icon: QrCode,
      body: null,
      content: <QrPanel secret={secret} />,
    },
    {
      title: 'Enter the code the app shows',
      icon: Hash,
      body: null,
      // As wide as the code slots, so the field, the alert and the button share one right edge.
      content: (
        <div className="flex max-w-[392px] flex-col gap-4">
          {sub.formError ? (
            <FormAlert testId="enroll-confirm-error" reference={sub.formError.ref} message={sub.formError.message} />
          ) : null}
          <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
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
              canAutoSubmit={!sub.busy && sub.waiting === 0}
              busy={sub.busy}
            />
            <SubmitButton busy={sub.busy} waiting={sub.waiting} label="Turn on login codes" busyLabel="Checking…" disabled={!secret} />
          </form>
        </div>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-6" data-testid="enroll-step">
      <Stepper steps={ENROL_STEPS} current={0} className="text-small sm:text-body" />
      <StepHeader title="Set up login codes" introId={introId} focus icon={<IconTile icon="shield" tone="brand" size="lg" />}>
        Your account now needs a code from an authenticator app each time you sign in. It keeps your marketplace data safe
        even if your password leaks.
      </StepHeader>
      {loadError ? (
        <div className="flex flex-col gap-4">
          <FormAlert testId="enroll-error" message={loadError.message} reference={loadError.ref} />
          <Button type="button" variant="secondary" size="lg" onClick={load} className="w-full sm:w-auto sm:self-start">
            <RotateCw data-icon="inline-start" />
            Try again
          </Button>
        </div>
      ) : (
        <ol className="flex flex-col gap-6">
          {/* Icons, not numbers: the stepper above already numbers the sign-in steps. */}
          {steps.map((st) => (
            <li key={st.title} className="grid grid-cols-[28px_minmax(0,1fr)] gap-x-3 gap-y-3">
              <IconTile icon={st.icon} tone="brand" size="sm" className="mt-0.5" />
              <div className="min-w-0 self-center">
                <p className="text-body font-semibold text-ink">{st.title}</p>
                {st.body ? <p className="mt-0.5 text-small text-ink-2">{st.body}</p> : null}
              </div>
              {st.content ? <div className="col-span-2 min-w-0 sm:col-span-1 sm:col-start-2">{st.content}</div> : null}
            </li>
          ))}
        </ol>
      )}
      <ExpiryNote challenge={challenge} className={loadError ? undefined : 'pl-10'} />
    </div>
  )
}

// ---------------------------------------------------------------------------------------------

/** The 10 recovery codes after enrolment, shown once; Continue goes on with `next`. */
export function RecoveryCodesStep({ codes, email, onContinue }: { codes: string[]; email: string; onContinue: () => void }) {
  const introId = useId()
  return (
    <div className="flex flex-col gap-6" data-testid="recovery-step">
      <Stepper steps={ENROL_STEPS} current={1} className="text-small sm:text-body" />
      <StepHeader title="Save your recovery codes" introId={introId} focus icon={<IconTile icon="lock" tone="warn" size="lg" />}>
        If you lose your phone, sign in with one of these codes instead.
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
    <div className="flex flex-col gap-6" data-testid="password-step">
      <StepHeader title="Choose a new password" introId={introId} focus icon={<IconTile icon="lock" tone="brand" size="lg" />}>
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
      <ExpiryNote challenge={challenge} />
    </div>
  )
}
