/**
 * /signup (hi-fi 01 Sign up). Column 1a creates the request with POST /signup
 * (routers/signup.py signup_create → 202 SignupAccepted). Column 1b shows "What best describes you?"
 * as an honest disabled group (SignupCreate is strict and has no such field) and, in place of the
 * 6-digit email code (there is no email provider), the pending-approval state read from
 * POST /signup/status (routers/signup.py signup_status) with the credentials just typed, kept in
 * memory only.
 */
import { zodResolver } from '@hookform/resolvers/zod'
import { Link } from '@tanstack/react-router'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { applyFieldErrors, describeError, isApiError } from '@/api/errors'
import { LaCard } from '@/components/la/cards'
import { LaField } from '@/components/la/field'
import { Icon } from '@/components/la/icons'
import { StatusChip } from '@/components/la/status-chip'
import { ComingSoon, NOT_YET, UnavailableButton } from '@/components/la/unavailable'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { useCheckSignupStatus, useCreateSignup } from '@/features/signup-admin/api'
import { retryAfterSeconds, signupSubmitError, statusCheckError, type SignupStatusOut } from '@/features/signup-admin/format'
import { PasswordInput } from '@/features/signup-admin/password-input'
import {
  PASSWORD_MIN,
  SIGNUP_FORM_DEFAULTS,
  signupFormSchema,
  toSignupBody,
  type SignupFormValues,
  type SignupStatusBody,
} from '@/features/signup-admin/schema'
import { TimeAgo } from '@/features/signup-admin/time'
import { useCountdown } from '@/features/signup-admin/use-countdown'
import { AsideLink, AuthColumn, AuthFrame, FormAlert, GoogleGlyph, OrDivider, StepTag } from './auth-frame'
import { DESCRIBES_YOU, signupChip } from './model'
import { useDocumentTitle } from './use-document-title'

const FIELDS = ['brand_name', 'owner_name', 'email', 'phone', 'website', 'password'] as const

export function SignupPage({ initialEmail }: { initialEmail?: string }) {
  useDocumentTitle('Request access')
  const create = useCreateSignup()
  const countdown = useCountdown()
  const [formError, setFormError] = useState<{ message: string; ref: string | null } | null>(null)
  /** Sent credentials, in memory only, so the status card can ask POST /signup/status. */
  const [sent, setSent] = useState<(SignupStatusBody & { brand: string }) | null>(null)

  const form = useForm<SignupFormValues>({
    resolver: zodResolver(signupFormSchema),
    defaultValues: { ...SIGNUP_FORM_DEFAULTS, email: initialEmail ?? '' },
  })
  const { errors } = form.formState

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null)
    const body = toSignupBody(values)
    try {
      await create.mutateAsync(body)
      setSent({ email: body.email, password: body.password, brand: body.brand_name })
    } catch (e) {
      const wait = retryAfterSeconds(e)
      if (wait) countdown.start(wait)
      const rest = applyFieldErrors(e, form.setError, { fields: FIELDS })
      if (isApiError(e) && e.status === 422 && rest.length === 0) return
      setFormError({
        message: rest.length ? (rest[0]?.msg ?? signupSubmitError(e)) : signupSubmitError(e),
        ref: isApiError(e) ? e.correlationId : null,
      })
    }
  })

  const submitting = form.formState.isSubmitting
  const locked = countdown.left > 0

  return (
    <AuthFrame
      aside={
        <>
          Already have an account? <AsideLink to="/login">Log in</AsideLink>
        </>
      }
    >
      <div className="grid flex-1 lg:grid-cols-2">
        <AuthColumn>
          <StepTag>1a · Account</StepTag>
          {sent ? (
            <SentSummary email={sent.email} brand={sent.brand} />
          ) : (
            <>
              <div>
                <h1 className="text-h1 text-ink">Create your account</h1>
                <p className="mt-2 text-body text-ink-2">List once. Sell on every marketplace.</p>
              </div>
              <UnavailableButton variant="secondary" size="lg" className="w-full" reason={NOT_YET.googleSignIn}>
                <GoogleGlyph />
                Continue with Google
                <ComingSoon className="ml-1" />
              </UnavailableButton>
              <OrDivider />
              {formError ? (
                <FormAlert
                  testId="signup-error"
                  reference={formError.ref}
                  message={`${formError.message}${locked ? ` Try again in ${countdown.left} s.` : ''}`}
                />
              ) : null}
              <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4" data-testid="signup-card">
                <div className="grid gap-4 sm:grid-cols-2">
                  <LaField label="Brand name" htmlFor="brand_name" error={errors.brand_name?.message}>
                    <Input id="brand_name" autoComplete="organization" autoFocus aria-invalid={!!errors.brand_name} {...form.register('brand_name')} />
                  </LaField>
                  <LaField label="Your name" htmlFor="owner_name" error={errors.owner_name?.message}>
                    <Input id="owner_name" autoComplete="name" aria-invalid={!!errors.owner_name} {...form.register('owner_name')} />
                  </LaField>
                </div>
                <LaField label="Work email" htmlFor="email" error={errors.email?.message}>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="username"
                    spellCheck={false}
                    placeholder="you@yourbrand.com"
                    aria-invalid={!!errors.email}
                    {...form.register('email')}
                  />
                </LaField>
                <LaField
                  label="Password"
                  htmlFor="password"
                  error={errors.password?.message}
                  hint="There is no password reset yet. Use the eye to check what you typed."
                >
                  <PasswordInput
                    id="password"
                    autoComplete="new-password"
                    placeholder={`At least ${PASSWORD_MIN} characters`}
                    aria-invalid={!!errors.password}
                    {...form.register('password')}
                  />
                </LaField>
                <div className="grid gap-4 sm:grid-cols-2">
                  <LaField label={<Optional>Phone</Optional>} htmlFor="phone" error={errors.phone?.message}>
                    <Input id="phone" type="tel" autoComplete="tel" inputMode="tel" placeholder="+91 98765 43210" aria-invalid={!!errors.phone} {...form.register('phone')} />
                  </LaField>
                  <LaField label={<Optional>Website</Optional>} htmlFor="website" error={errors.website?.message}>
                    <Input
                      id="website"
                      type="url"
                      inputMode="url"
                      autoComplete="url"
                      spellCheck={false}
                      placeholder="yourbrand.com"
                      aria-invalid={!!errors.website}
                      {...form.register('website')}
                    />
                  </LaField>
                </div>
                <div>
                  <div className="flex items-center gap-3">
                    <Controller
                      control={form.control}
                      name="agree"
                      render={({ field }) => (
                        <Checkbox
                          id="agree"
                          checked={field.value}
                          onCheckedChange={(v) => field.onChange(v === true)}
                          onBlur={field.onBlur}
                          ref={field.ref}
                          aria-invalid={!!errors.agree}
                          aria-describedby={errors.agree ? 'agree-error' : undefined}
                          data-testid="signup-agree"
                        />
                      )}
                    />
                    <label htmlFor="agree" className="text-small text-ink-2">
                      I have read the{' '}
                      <Link to="/privacy" target="_blank" className="font-semibold text-brand underline-offset-4 hover:underline">
                        Privacy policy
                      </Link>
                    </label>
                  </div>
                  {errors.agree ? (
                    <p id="agree-error" className="mt-1.5 text-caption text-danger">
                      {errors.agree.message}
                    </p>
                  ) : null}
                </div>
                <Button type="submit" size="lg" className="w-full" disabled={submitting || locked} data-testid="signup-submit">
                  {submitting ? <Spinner data-icon="inline-start" /> : null}
                  {locked ? `Try again in ${countdown.left} s` : submitting ? 'Sending request…' : 'Create account'}
                </Button>
              </form>
              <p className="text-small text-ink-2">
                Applied already?{' '}
                <Link to="/signup/status" className="font-semibold text-brand underline-offset-4 hover:underline">
                  Check your request
                </Link>
              </p>
            </>
          )}
        </AuthColumn>
        <AuthColumn tone="canvas">
          <StepTag>1b · About you</StepTag>
          <DescribesYou />
          {sent ? <LiveStatus creds={sent} /> : <HowAccessWorks />}
        </AuthColumn>
      </div>
    </AuthFrame>
  )
}

function Optional({ children }: { children: ReactNode }) {
  return (
    <>
      {children} <span className="font-normal text-ink-2">(optional)</span>
    </>
  )
}

/** p01 1b, shown honestly: the sign-up API has no field for it, so it is disabled with the reason. */
function DescribesYou() {
  return (
    <fieldset disabled aria-describedby="describes-reason" className="flex flex-col gap-2" data-testid="signup-describes">
      <legend className="mb-2">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-display text-h2 font-bold text-ink">What best describes you?</span>
          <ComingSoon />
        </span>
        <span id="describes-reason" className="mt-1 block text-small text-ink-2">
          The sign-up form can’t save this answer yet, so it is switched off. You set up your brand profile after your
          request is approved.
        </span>
      </legend>
      {DESCRIBES_YOU.map((label) => (
        <label
          key={label}
          className="flex h-11 cursor-not-allowed items-center gap-3 rounded-[10px] border border-line-strong bg-surface px-3.5 text-body text-ink-2 opacity-70"
        >
          <input type="radio" name="describes" disabled className="size-[18px] accent-[var(--brand)]" />
          {label}
        </label>
      ))}
    </fieldset>
  )
}

/** Replaces the design's email-code card: there are no emails, a person reviews every request. */
function HowAccessWorks() {
  return (
    <LaCard pad="sm" className="mt-2">
      <h2 className="font-display text-h3 font-bold text-ink">What happens next</h2>
      <ol className="mt-3 flex flex-col gap-2.5 text-small text-ink-2">
        {[
          'We don’t send an email code. A person on our team reviews every request instead.',
          'Check where your request stands any time with the email and password you choose here.',
          'Once approved, your brand gets a trial workspace and you sign in as its owner.',
        ].map((t, i) => (
          <li key={t} className="flex gap-3">
            <span className="flex size-[22px] shrink-0 items-center justify-center rounded-full border border-brand-line bg-brand-bg text-caption font-bold text-brand">
              {i + 1}
            </span>
            <span className="pt-0.5">{t}</span>
          </li>
        ))}
      </ol>
    </LaCard>
  )
}

function SentSummary({ email, brand }: { email: string; brand: string }) {
  return (
    <div data-testid="signup-sent" className="flex flex-col gap-4">
      <div>
        <h1 className="flex items-center gap-2.5 text-h1 text-ink">
          <span className="flex size-8 items-center justify-center rounded-full bg-success-bg text-success">
            <Icon name="check" size={18} />
          </span>
          Request sent
        </h1>
        <p className="mt-2 text-body text-ink-2">
          A person reviews every request before the workspace opens. Your status is on the right, and you can check it again
          any time.
        </p>
      </div>
      <dl className="divide-y divide-line rounded-card border border-line text-body">
        <div className="flex items-center justify-between gap-4 px-4 py-2.5">
          <dt className="text-ink-2">Brand</dt>
          <dd className="min-w-0 truncate font-semibold text-ink" data-testid="signup-sent-brand">
            {brand}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-4 px-4 py-2.5">
          <dt className="text-ink-2">Sign-in email</dt>
          <dd className="min-w-0 truncate text-ink">{email}</dd>
        </div>
      </dl>
      <p className="text-small text-ink-2">
        If this email already has a Listing Agent login, the request only counts when you used that login’s password.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button asChild size="lg" variant="secondary" className="flex-1">
          <Link to="/signup/status" search={{ email }} data-testid="signup-sent-status">
            Check status later
          </Link>
        </Button>
        <Button asChild size="lg" variant="ghost" className="flex-1">
          <Link to="/login">Go to sign in</Link>
        </Button>
      </div>
    </div>
  )
}

/** POST /signup/status with the in-memory credentials: read once on mount, then on request. */
function LiveStatus({ creds }: { creds: SignupStatusBody }) {
  const check = useCheckSignupStatus()
  const [result, setResult] = useState<SignupStatusOut | null>(null)
  const [error, setError] = useState<{ message: string; ref: string | null } | null>(null)
  const started = useRef(false)

  const run = async () => {
    setError(null)
    try {
      setResult(await check.mutateAsync({ email: creds.email, password: creds.password }))
    } catch (e) {
      setError({ message: isApiError(e) ? statusCheckError(e) : describeError(e), ref: isApiError(e) ? e.correlationId : null })
    }
  }

  useEffect(() => {
    if (started.current) return
    started.current = true
    void run()
    // run once for the credentials just sent
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <LaCard pad="sm" className="mt-2" data-testid="signup-live-status">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-h3 font-bold text-ink">Your request</h2>
          <p className="mt-0.5 text-small text-ink-2">{creds.email}</p>
        </div>
        {result ? (
          <StatusChip status={signupChip(result.status).status} className="mt-0.5">
            <span data-testid="signup-live-chip">{signupChip(result.status).label}</span>
          </StatusChip>
        ) : null}
      </div>
      <div aria-live="polite" className="mt-3">
        {check.isPending && !result ? (
          <div className="flex flex-col gap-2" aria-label="Checking status…">
            <div className="h-4 w-2/3 animate-pulse rounded bg-subtle" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-subtle" />
          </div>
        ) : error ? (
          <FormAlert message={error.message} reference={error.ref} />
        ) : result ? (
          <div className="flex flex-col gap-1 text-small text-ink-2">
            <p>
              {result.status === 'pending'
                ? 'Waiting for a person to review it. Nothing else is needed from you yet.'
                : result.status === 'approved'
                  ? 'Approved. Sign in with the email and password you just used.'
                  : 'Not approved.'}
            </p>
            {result.status === 'rejected' && result.reason ? (
              <p className="rounded-control border border-danger-line bg-danger-bg px-3 py-2 break-words whitespace-pre-wrap text-danger-ink">
                {result.reason}
              </p>
            ) : null}
            <p className="text-caption">
              Sent <TimeAgo iso={result.created_at} />
            </p>
          </div>
        ) : null}
      </div>
      <div className="mt-4 flex gap-2">
        {result?.status === 'approved' ? (
          <Button asChild size="sm">
            <Link to="/login">Sign in</Link>
          </Button>
        ) : (
          <Button size="sm" variant="secondary" onClick={() => void run()} disabled={check.isPending} data-testid="signup-live-refresh">
            {check.isPending ? <Spinner data-icon="inline-start" /> : <Icon name="refresh" size={14} />}
            {check.isPending ? 'Checking…' : 'Check again'}
          </Button>
        )}
      </div>
    </LaCard>
  )
}
