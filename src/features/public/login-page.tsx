/**
 * /login. Not designed in the hi-fi ("Not designed yet: Log in"); built as frame 01 without
 * column 1b, per the 01 redlines. POST /auth/login (routers/auth.py) via `signIn()` in lib/auth.
 * 401 wrong credentials (a locked account answers the same 401), 429 with Retry-After, 422 field
 * errors. The answer's `status` picks the next step (features/mfa/login-flow.ts): tokens, the code
 * step, forced enrolment, or a forced password change.
 */
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useRouter } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { applyFieldErrors, describeError, isApiError } from '@/api/errors'
import { Banner } from '@/components/la/banner'
import { fieldHintId, LaField } from '@/components/la/field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { PasswordInput } from '@/features/signup-admin/password-input'
import { LOGIN_EMAIL_MAX, statusFormSchema, type StatusFormValues } from '@/features/signup-admin/schema'
import { useCountdown } from '@/features/signup-admin/use-countdown'
import type { LoginResult } from '@/api/types'
import { advance, RESTART_MESSAGES, type FlowStep, type RestartReason } from '@/features/mfa/login-flow'
import { EnrollStep, MfaCodeStep, PasswordChangeStep, RecoveryCodesStep } from '@/features/mfa/login-steps'
import { finishSignIn, signIn, useSession } from '@/lib/auth'
import { toast } from '@/lib/toast'
import { FORM_VALIDATION_MODE } from '@/lib/validation'
import { AsideLink, AuthFootnote, AuthFrame, FormAlert } from './auth-frame'
import { useDocumentTitle } from './use-document-title'

/**
 * LoginRequest has the same shape and limits as SignupStatusRequest: email 3..320,
 * `^[^@\s]+@[^@\s]+$`, visible ASCII; password 1..1024.
 */
const loginSchema = statusFormSchema
type LoginValues = StatusFormValues

/** "20 Nov 2026" for the grace notice. */
function graceDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export function LoginPage({ target }: { target: string }) {
  useDocumentTitle('Sign in')
  const router = useRouter()
  const session = useSession()
  const [formError, setFormError] = useState<{ message: string; ref: string | null } | null>(null)
  const [step, setStep] = useState<FlowStep>({ kind: 'credentials' })
  /** The email of this sign-in, for the password rules' name check. Never the password. */
  const [email, setEmail] = useState('')
  const countdown = useCountdown()

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
    ...FORM_VALIDATION_MODE,
  })

  // Another tab signed in: follow it.
  useEffect(() => {
    if (session.status === 'authenticated') void router.history.push(target)
  }, [session.status, router, target])

  const restart = useCallback(
    (reason: RestartReason) => {
      setStep({ kind: 'credentials' })
      setFormError({ message: RESTART_MESSAGES[reason], ref: null })
      requestAnimationFrame(() => form.setFocus(reason === 'invalid' ? 'email' : 'password'))
    },
    [form],
  )

  /** Apply one `LoginResult`: store tokens and leave, or show the next step. */
  const onResult = useCallback(
    async (result: LoginResult) => {
      const next = advance(result)
      if (next.kind === 'invalid') return restart('invalid')
      if (next.kind === 'step') {
        setFormError(null)
        setStep(next.step)
        return
      }
      setStep({ kind: 'credentials' })
      try {
        await finishSignIn(next.tokens)
      } catch (e) {
        setFormError({ message: describeError(e), ref: isApiError(e) ? e.correlationId : null })
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
      router.history.push(target)
    },
    [restart, router, target],
  )

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null)
    try {
      const result = await signIn(values.email, values.password)
      setEmail(values.email.trim())
      // The password is not needed past this point: drop it from the form.
      form.resetField('password')
      await onResult(result)
    } catch (e) {
      if (!isApiError(e)) {
        setFormError({ message: describeError(e), ref: null })
        return
      }
      if (e.status === 401) {
        setFormError({ message: 'Email or password is incorrect.', ref: e.correlationId })
        form.setFocus('password')
      } else if (e.status === 429) {
        countdown.start(e.retryAfter ?? 60)
        setFormError({ message: 'Too many attempts.', ref: e.correlationId })
      } else if (e.status === 422) {
        const rest = applyFieldErrors(e, form.setError, { fields: ['email', 'password'] })
        if (rest.length) setFormError({ message: describeError(e), ref: e.correlationId })
      } else {
        setFormError({ message: describeError(e), ref: e.correlationId })
      }
    }
  })

  if (step.kind !== 'credentials') {
    return (
      <AuthFrame aside={<>Signing in as <span className="font-semibold text-ink">{email}</span></>}>
        <div className="mx-auto flex w-full max-w-[448px] flex-1 flex-col gap-4 px-4 pt-8 pb-6 sm:pt-12" data-testid="login-card">
          {step.kind === 'mfa' ? (
            <MfaCodeStep key={step.challenge.token} challenge={step.challenge} onResult={(r) => void onResult(r)} onRestart={restart} />
          ) : step.kind === 'enroll' ? (
            <EnrollStep
              key={step.challenge.token}
              challenge={step.challenge}
              onConfirmed={(out) => setStep({ kind: 'recovery-codes', codes: out.recovery_codes, next: out.result })}
              onRestart={restart}
            />
          ) : step.kind === 'recovery-codes' ? (
            <RecoveryCodesStep codes={step.codes} email={email} onContinue={() => void onResult(step.next)} />
          ) : (
            <PasswordChangeStep key={step.challenge.token} challenge={step.challenge} email={email} onResult={(r) => void onResult(r)} onRestart={restart} />
          )}
          {step.kind === 'recovery-codes' ? null : (
            <div className="border-t border-line pt-4 text-small">
              <Button
                type="button"
                variant="link"
                onClick={() => {
                  setStep({ kind: 'credentials' })
                  setFormError(null)
                }}
                data-testid="login-start-over"
              >
                Sign in with a different account
              </Button>
            </div>
          )}
          <AuthFootnote />
        </div>
      </AuthFrame>
    )
  }

  const submitting = form.formState.isSubmitting
  const locked = countdown.left > 0
  const { errors } = form.formState

  return (
    <AuthFrame
      aside={
        <>
          New brand? <AsideLink to="/signup">Request access</AsideLink>
        </>
      }
    >
      <div className="mx-auto flex w-full max-w-[448px] flex-1 flex-col gap-4 px-4 pt-8 pb-6 sm:pt-12" data-testid="login-card">
        <div>
          <h1 className="text-h1 text-ink">Sign in</h1>
          <p className="mt-2 text-body text-ink-2">Use the email and password for your brand account.</p>
        </div>
        {session.endReason === 'expired' && !formError ? (
          <Banner tone="info" role="status">
            Your session ended. Sign in again.
          </Banner>
        ) : null}
        {formError ? (
          <FormAlert
            testId="login-error"
            reference={formError.ref}
            message={`${formError.message}${locked ? ` Try again in ${countdown.left} s.` : ''}`}
          />
        ) : null}
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <LaField label="Email" htmlFor="email" error={errors.email?.message} submitCount={form.formState.submitCount}>
            <Input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              autoFocus
              spellCheck={false}
              maxLength={LOGIN_EMAIL_MAX}
              placeholder="you@yourbrand.com"
              aria-invalid={!!errors.email}
              aria-describedby={fieldHintId('email')}
              {...form.register('email')}
            />
          </LaField>
          <LaField
            label="Password"
            htmlFor="password"
            error={errors.password?.message}
            submitCount={form.formState.submitCount}
            hint="There is no password reset yet. Your brand owner manages access. Repeated failed attempts lock the account for 15 minutes."
          >
            <PasswordInput
              id="password"
              autoComplete="current-password"
              aria-invalid={!!errors.password}
              aria-describedby={fieldHintId('password')}
              {...form.register('password')}
            />
          </LaField>
          <Button type="submit" size="lg" className="w-full" disabled={submitting || locked}>
            {submitting ? <Spinner data-icon="inline-start" /> : null}
            {locked ? `Try again in ${countdown.left} s` : submitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-line pt-4 text-small">
          <span className="text-ink-2">
            New brand?{' '}
            <Link to="/signup" className="font-semibold text-brand underline-offset-4 hover:underline" data-testid="signup-link">
              Request access
            </Link>
          </span>
          <Link to="/signup/status" className="text-ink-2 underline-offset-4 hover:text-ink hover:underline" data-testid="signup-status-link">
            Check request status
          </Link>
        </div>
        <AuthFootnote />
      </div>
    </AuthFrame>
  )
}
