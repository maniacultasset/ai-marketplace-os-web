/**
 * /login. Not designed in the hi-fi ("Not designed yet: Log in"); built as frame 01 without
 * column 1b, per the 01 redlines. POST /auth/login (routers/auth.py) via `signIn()` in lib/auth.
 * 401 wrong credentials (a locked account answers the same 401), 429 with Retry-After, 422 field
 * errors. The answer's `status` picks the next step (features/mfa/login-flow.ts): tokens, the code
 * step, forced enrolment, or a forced password change. Those steps are `SignInSteps`, shared with
 * /auth/google. "Continue with Google" sits above the form when the backend has it switched on.
 */
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useRouter } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { applyFieldErrors, describeError, isApiError } from '@/api/errors'
import { Banner } from '@/components/la/banner'
import { fieldHintId, LaField } from '@/components/la/field'
import { IconTile, type IconName } from '@/components/la/icons'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/features/signup-admin/password-input'
import { LOGIN_EMAIL_MAX, statusFormSchema, type StatusFormValues } from '@/features/signup-admin/schema'
import { useCountdown } from '@/features/signup-admin/use-countdown'
import { GoogleEntry } from '@/features/google/google-button'
import { SubmitButton, TOUCH_TEXT } from '@/features/mfa/components'
import { RESTART_MESSAGES, TOO_MANY, type RestartReason } from '@/features/mfa/login-flow'
import { signIn, useSession } from '@/lib/auth'
import { FORM_VALIDATION_MODE } from '@/lib/validation'
import { AsideLink, AuthCard, AuthFrame, FormAlert } from './auth-frame'
import { SignInSteps } from './sign-in-steps'
import { useSignInFlow } from './use-sign-in-flow'
import { useDocumentTitle } from './use-document-title'

/**
 * LoginRequest has the same shape and limits as SignupStatusRequest: email 3..320,
 * `^[^@\s]+@[^@\s]+$`, visible ASCII; password 1..1024.
 */
const loginSchema = statusFormSchema
type LoginValues = StatusFormValues

type Tone = 'danger' | 'attention' | 'info'
interface FormError {
  message: string
  ref: string | null
  tone?: Tone
  icon?: IconName
}

/** How each restart notice reads: a timeout is information, too many codes or MFA off need attention. */
const RESTART_TONE: Record<RestartReason, { tone: Tone; icon?: IconName }> = {
  expired: { tone: 'info', icon: 'clock' },
  attempts: { tone: 'attention' },
  'mfa-off': { tone: 'attention' },
  invalid: { tone: 'danger' },
}

/** Why the page opened with a notice: a restart sent back from /auth/google, or Google switched off. */
export type LoginNotice = RestartReason | 'google_unavailable'

const restartError = (reason: RestartReason): FormError => ({ message: RESTART_MESSAGES[reason], ref: null, ...RESTART_TONE[reason] })

export function LoginPage({ target, notice }: { target: string; notice?: LoginNotice }) {
  useDocumentTitle('Sign in')
  const router = useRouter()
  const session = useSession()
  const [formError, setFormError] = useState<FormError | null>(() => (notice && notice !== 'google_unavailable' ? restartError(notice) : null))
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

  const onRestart = useCallback(
    (reason: RestartReason) => {
      setFormError(restartError(reason))
      requestAnimationFrame(() => form.setFocus(reason === 'invalid' ? 'email' : 'password'))
    },
    [form],
  )
  const flow = useSignInFlow({ target, onRestart, onError: setFormError, onStep: () => setFormError(null) })
  const { step, setStep, onResult } = flow

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
        // Fixed text: the seconds left count down on the button, not in the (assertive) alert.
        setFormError({ message: TOO_MANY, ref: e.correlationId })
      } else if (e.status === 422) {
        const rest = applyFieldErrors(e, form.setError, { fields: ['email', 'password'] })
        if (rest.length) setFormError({ message: describeError(e), ref: e.correlationId })
      } else {
        setFormError({ message: describeError(e), ref: e.correlationId })
      }
    }
  })

  if (step.kind !== 'credentials') {
    const startOver = () => {
      setStep({ kind: 'credentials' })
      setFormError(null)
    }
    return <SignInSteps flow={flow} email={email} onSwitch={startOver} />
  }

  const submitting = form.formState.isSubmitting
  const { errors } = form.formState

  return (
    <AuthFrame
      tone="canvas"
      aside={
        <>
          New brand? <AsideLink to="/signup">Request access</AsideLink>
        </>
      }
    >
      <AuthCard size="sm">
        <div>
          <IconTile icon="lock" tone="brand" size="lg" className="mb-4" />
          <h1 className="text-[24px] leading-[30px] font-bold tracking-[-0.02em] text-ink sm:text-h1">Sign in</h1>
          <p className="mt-2 text-body text-pretty text-ink-2">Use the email and password for your brand account.</p>
        </div>
        {notice === 'google_unavailable' && !formError ? (
          <Banner tone="info" role="status">
            Google sign-in isn’t available right now. Sign in with your email and password.
          </Banner>
        ) : null}
        {session.endReason === 'expired' && !formError ? (
          <Banner tone="info" role="status">
            Your session ended. Sign in again.
          </Banner>
        ) : null}
        {session.endReason === 'password-changed' && !formError ? (
          <Banner tone="success" role="status">
            Password changed. Sign in with your new password.
          </Banner>
        ) : null}
        {formError ? (
          <FormAlert
            testId="login-error"
            reference={formError.ref}
            tone={formError.tone}
            icon={formError.icon}
            message={formError.message}
          />
        ) : null}
        {notice === 'google_unavailable' ? null : <GoogleEntry intent="login" returnTo={target} />}
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
              className={TOUCH_TEXT}
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
            hint="There's no reset link yet. If you forget it, ask your brand owner. Too many wrong tries locks the account for 15 minutes."
          >
            <PasswordInput
              id="password"
              autoComplete="current-password"
              className={TOUCH_TEXT}
              aria-invalid={!!errors.password}
              aria-describedby={fieldHintId('password')}
              {...form.register('password')}
            />
          </LaField>
          <SubmitButton busy={submitting} waiting={countdown.left} label="Sign in" busyLabel="Signing in…" />
        </form>
        <p className="border-t border-line pt-5 text-center text-small text-ink-2">
          Applied already?{' '}
          <Link to="/signup/status" className="font-semibold text-brand underline-offset-4 hover:underline" data-testid="signup-status-link">
            Check your request
          </Link>
        </p>
      </AuthCard>
    </AuthFrame>
  )
}
