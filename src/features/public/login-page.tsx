/**
 * /login. Not designed in the hi-fi ("Not designed yet: Log in"); built as frame 01 without
 * column 1b, per the 01 redlines. POST /auth/login (routers/auth.py) via `login()` in lib/auth.
 * 401 wrong credentials, 429 with Retry-After, 422 field errors.
 */
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useRouter } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
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
import { login, useSession } from '@/lib/auth'
import { FORM_VALIDATION_MODE } from '@/lib/validation'
import { AsideLink, AuthFootnote, AuthFrame, FormAlert } from './auth-frame'
import { useDocumentTitle } from './use-document-title'

/**
 * LoginRequest has the same shape and limits as SignupStatusRequest: email 3..320,
 * `^[^@\s]+@[^@\s]+$`, visible ASCII; password 1..1024.
 */
const loginSchema = statusFormSchema
type LoginValues = StatusFormValues

export function LoginPage({ target }: { target: string }) {
  useDocumentTitle('Sign in')
  const router = useRouter()
  const session = useSession()
  const [formError, setFormError] = useState<{ message: string; ref: string | null } | null>(null)
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

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null)
    try {
      await login(values.email, values.password)
      await router.invalidate()
      router.history.push(target)
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
            hint="There is no password reset yet. Your brand owner manages access."
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
