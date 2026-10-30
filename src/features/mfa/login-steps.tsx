/**
 * The sign-in steps after the password (contract 2.0.0; docs/HANDOFF-FE.md §6): the code step
 * (`mfa_required`), forced enrolment (`mfa_enrollment_required`), the recovery codes shown once,
 * and the forced password change (`password_change_required`). Each step holds its challenge token,
 * codes and secrets in component state only, which React drops when the step unmounts (no
 * setState-on-unmount cleanups: StrictMode replays effects on a live component).
 *
 * A code step may offer "Trust this browser" (contract 2.1.0) when the API sends
 * `device_trust_days`: checked by default, hidden for a recovery code. The token it earns is kept by
 * the sign-in flow (features/mfa/trusted-device.ts), never here.
 *
 * Every refusal on the challenge routes is the same 401 (wrong code, used code, expired or burned
 * challenge, locked account), so the copy never says which: no account enumeration.
 */
import { ArrowRight, KeyRound, RotateCw, Smartphone } from 'lucide-react'
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { isApiError } from '@/api/errors'
import type { LoginConfirmOut, LoginResult, TotpEnrollOut } from '@/api/types'
import { Banner } from '@/components/la/banner'
import { Icon, IconTile } from '@/components/la/icons'
import { Button } from '@/components/ui/button'
import { FormAlert } from '@/features/public/auth-frame'
import { useCountdown } from '@/features/signup-admin/use-countdown'
import { cn } from '@/lib/utils'
import { loginConfirm, loginEnroll, loginMfa, mfaErrorMessage, passwordExpired } from './api'
import { CodeField, QrPanel, RecoveryCodes, SubmitButton, TrustBrowserField, type FactorKind } from './components'
import { BackButton, EnrolWizard, GetAppBody, QrAgain } from './enrol-wizard'
import { PRIMARY } from './enrol-steps'
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
  const [trust, setTrust] = useState(true)
  const inputRef = useRef<HTMLInputElement>(null)
  const introId = useId()
  const sub = useCodeSubmit(onRestart)
  useChallengeExpiry(challenge, () => onRestart('expired'))
  // A recovery code is the lost-phone path: the browser is not remembered on it (the API agrees).
  const offerTrust = challenge.trustDays !== null && kind === 'totp'

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
      async () =>
        onResult(await loginMfa(challenge.token, kind === 'totp' ? { code: v } : { recovery_code: v }, offerTrust ? trust : undefined)),
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
      {challenge.trustLapsed && !sub.formError ? (
        <Banner tone="info" role="status" className="text-small">
          This browser is no longer trusted, so enter a code this time.
        </Banner>
      ) : null}
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
        {offerTrust ? (
          <TrustBrowserField id="mfa-trust" days={challenge.trustDays!} checked={trust} onChange={setTrust} disabled={sub.busy} />
        ) : null}
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
 * `mfa_enrollment_required`: a new secret (POST /auth/login/mfa/enroll, once per challenge, as the
 * step opens), then four short steps: get the app, scan, enter the code (POST
 * /auth/login/mfa/confirm, whose answer carries the recovery codes and the next `LoginResult`),
 * and the recovery codes (`RecoveryCodesStep`). Back and Continue between the first three are
 * client-only: the challenge and the secret stay the same.
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
  const [step, setStep] = useState<0 | 1 | 2>(0)
  const [secret, setSecret] = useState<TotpEnrollOut | null>(null)
  const [loadError, setLoadError] = useState<{ message: string; ref: string | null } | null>(null)
  const [value, setValue] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const [trust, setTrust] = useState(true)
  const inputRef = useRef<HTMLInputElement>(null)
  const started = useRef<string | null>(null)
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
      async () => onConfirmed(await loginConfirm(challenge.token, value, challenge.trustDays !== null ? trust : undefined)),
      () => {
        setValue('')
        inputRef.current?.focus()
      },
    )
  }

  const retry = loadError ? (
    <div className="flex flex-col gap-4">
      <FormAlert testId="enroll-error" message={loadError.message} reference={loadError.ref} />
      <Button type="button" variant="secondary" size="lg" onClick={load} className="w-full sm:w-auto sm:self-start">
        <RotateCw data-icon="inline-start" />
        Try again
      </Button>
    </div>
  ) : null
  const note = <ExpiryNote challenge={challenge} />

  if (step === 0) {
    return (
      <EnrolWizard
        step={0}
        title="Set up login codes"
        intro="Your account now needs a code from an authenticator app each time you sign in. It keeps your marketplace data safe even if your password leaks."
        testId="enroll-step"
        actions={
          <Button type="button" size="lg" className={PRIMARY} onClick={() => setStep(1)} data-testid="enrol-continue">
            Continue
            <ArrowRight data-icon="inline-end" />
          </Button>
        }
        note={note}
      >
        <GetAppBody>{retry}</GetAppBody>
      </EnrolWizard>
    )
  }
  if (step === 1) {
    return (
      <EnrolWizard
        step={1}
        title="Scan the QR code"
        intro="Open your authenticator app, add an account and scan this code with your phone's camera."
        testId="enroll-step"
        actions={
          <>
            <BackButton onClick={() => setStep(0)} />
            <Button type="button" size="lg" className={PRIMARY} onClick={() => setStep(2)} disabled={!secret} data-testid="enrol-continue">
              Continue
              <ArrowRight data-icon="inline-end" />
            </Button>
          </>
        }
        note={note}
      >
        {retry ?? <QrPanel secret={secret} />}
      </EnrolWizard>
    )
  }
  return (
    <EnrolWizard
      step={2}
      title="Enter the 6-digit code"
      intro="Type the code your app now shows for Kuinn."
      testId="enroll-step"
      onSubmit={onSubmit}
      error={sub.formError ? <FormAlert testId="enroll-confirm-error" reference={sub.formError.ref} message={sub.formError.message} /> : null}
      actions={
        <>
          <BackButton onClick={() => setStep(1)} disabled={sub.busy} />
          <SubmitButton busy={sub.busy} waiting={sub.waiting} label="Turn on login codes" busyLabel="Checking…" disabled={!secret} className={PRIMARY} />
        </>
      }
      note={note}
    >
      {retry ?? (
        <div className="flex flex-col gap-4">
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
          {challenge.trustDays !== null ? (
            <TrustBrowserField id="enroll-trust" days={challenge.trustDays} checked={trust} onChange={setTrust} disabled={sub.busy || !secret} />
          ) : null}
          <QrAgain uri={secret?.otpauth_uri ?? null} />
        </div>
      )}
    </EnrolWizard>
  )
}

// ---------------------------------------------------------------------------------------------

/** Step 4: the 10 recovery codes after enrolment, shown once; Continue goes on with `next`. */
export function RecoveryCodesStep({ codes, email, onContinue }: { codes: string[]; email: string; onContinue: () => void }) {
  return (
    <EnrolWizard
      step={3}
      title="Save your recovery codes"
      intro="Login codes are on. If you lose your phone, sign in with one of these codes instead."
      testId="recovery-step"
    >
      <RecoveryCodes codes={codes} account={email} onContinue={onContinue} bar="page" continueClassName={cn(PRIMARY, 'sm:self-end')} />
    </EnrolWizard>
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
    // The wide card has no bottom padding on a phone (the other wide steps end in a sticky bar).
    <div className="flex flex-col gap-6 max-sm:pb-6" data-testid="password-step">
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
