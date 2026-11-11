/**
 * /signup (hi-fi 01 Sign up). Column 1a creates the request with POST /signup
 * (routers/signup.py signup_create → 202 SignupAccepted). Column 1b shows "What best describes you?"
 * as an honest disabled group (SignupCreate is strict and has no such field) and, in place of the
 * 6-digit email code (there is no email provider), the pending-approval state. It polls
 * POST /signup/status/poll with the answer's status handle (kept in localStorage, never in a URL)
 * and updates by itself; when that handle names nothing (an email that already had an account),
 * it reads POST /signup/status once with the credentials just typed, kept in memory only. "Sign up with Google" sits above the form when the backend has it switched on; that
 * path finishes on /auth/google with a prefilled form.
 */
import { zodResolver } from '@hookform/resolvers/zod'
import { Link } from '@tanstack/react-router'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { applyFieldErrors, describeError, isApiError } from '@/api/errors'
import { LaCard } from '@/components/la/cards'
import { fieldHintId, LaField } from '@/components/la/field'
import { Icon, IconTile } from '@/components/la/icons'
import { StatusChip } from '@/components/la/status-chip'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { useCheckSignupStatus, useCreateSignup } from '@/features/signup-admin/api'
import { retryAfterSeconds, signupSubmitError, statusCheckError, type SignupStatusOut } from '@/features/signup-admin/format'
import { PasswordInput } from '@/features/signup-admin/password-input'
import {
  LOGIN_EMAIL_MAX,
  NAME_MAX,
  PASSWORD_MIN,
  PHONE_MAX,
  SIGNUP_FORM_DEFAULTS,
  signupFormSchema,
  toSignupBody,
  type SignupFormValues,
  type SignupStatusBody,
  WEBSITE_MAX,
} from '@/features/signup-admin/schema'
import { clearStatusHandle, saveStatusHandle } from '@/features/signup-admin/status-handle'
import { TimeAgo } from '@/features/signup-admin/time'
import { useCountdown } from '@/features/signup-admin/use-countdown'
import { useGoogleEnabled } from '@/features/google/api'
import { GoogleEntry } from '@/features/google/google-button'
import { isCoarsePointer } from '@/lib/pointer'
import { filterInput, FORM_VALIDATION_MODE, phoneChars } from '@/lib/validation'
import { AsideLink, AuthColumn, AuthFrame, FormAlert } from './auth-frame'
import { RecoveryHint } from './recovery-hint'
import { signupChip } from './model'
import { COMPANY } from './company'
import { useDocumentTitle } from './use-document-title'
import { useWaitingStatus, waitingCopy } from './waiting'

const FIELDS = ['brand_name', 'owner_name', 'email', 'phone', 'website', 'password'] as const

export function SignupPage({ initialEmail }: { initialEmail?: string }) {
  useDocumentTitle('Request access')
  const create = useCreateSignup()
  const countdown = useCountdown()
  const [formError, setFormError] = useState<{ message: string; ref: string | null } | null>(null)
  /** Sent credentials, in memory only (the status card's fallback), and the status handle. */
  const [sent, setSent] = useState<(SignupStatusBody & { brand: string; handle: string | null; remembered: boolean }) | null>(null)
  // With Google on, its button comes first: no autofocus on Brand name (or on any touch device).
  const googleShown = useGoogleEnabled()

  const form = useForm<SignupFormValues>({
    resolver: zodResolver(signupFormSchema),
    defaultValues: { ...SIGNUP_FORM_DEFAULTS, email: initialEmail ?? '' },
    ...FORM_VALIDATION_MODE,
  })
  const { errors, submitCount } = form.formState

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null)
    const body = toSignupBody(values)
    try {
      const out = await create.mutateAsync(body)
      const handle = out.status_handle ?? null
      const remembered = handle ? saveStatusHandle({ handle, via: 'password', returnTo: null }) : false
      setSent({ email: body.email, password: body.password, brand: body.brand_name, handle, remembered })
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
          {sent ? (
            <SentSummary email={sent.email} brand={sent.brand} />
          ) : (
            <>
              <div>
                <h1 className="text-h1 text-ink">Create your account</h1>
                <p className="mt-2 text-body text-ink-2">List once. Sell on every marketplace.</p>
              </div>
              {formError ? (
                <FormAlert
                  testId="signup-error"
                  reference={formError.ref}
                  message={`${formError.message}${locked ? ` Try again in ${countdown.left} s.` : ''}`}
                />
              ) : null}
              <GoogleEntry intent="signup" returnTo="/home" divider="or sign up with email" />
              <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4" data-testid="signup-card">
                <div className="grid gap-4 sm:grid-cols-2">
                  <LaField label="Brand name" htmlFor="brand_name" error={errors.brand_name?.message} submitCount={submitCount} confirmFix>
                    <Input
                      id="brand_name"
                      autoComplete="organization"
                      autoFocus={!googleShown && !isCoarsePointer()}
                      maxLength={NAME_MAX}
                      aria-invalid={!!errors.brand_name}
                      aria-describedby={fieldHintId('brand_name')}
                      {...form.register('brand_name')}
                    />
                  </LaField>
                  <LaField label="Your name" htmlFor="owner_name" error={errors.owner_name?.message} submitCount={submitCount} confirmFix>
                    <Input
                      id="owner_name"
                      autoComplete="name"
                      autoCapitalize="words"
                      maxLength={NAME_MAX}
                      aria-invalid={!!errors.owner_name}
                      aria-describedby={fieldHintId('owner_name')}
                      {...form.register('owner_name')}
                    />
                  </LaField>
                </div>
                <LaField label="Work email" htmlFor="email" error={errors.email?.message} submitCount={submitCount} confirmFix>
                  <Input
                    id="email"
                    type="email"
                    inputMode="email"
                    autoComplete="username"
                    autoCapitalize="none"
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
                  submitCount={submitCount}
                  confirmFix
                  hint={<RecoveryHint who="new-owner" />}
                >
                  <PasswordInput
                    id="password"
                    autoComplete="new-password"
                    placeholder={`At least ${PASSWORD_MIN} characters`}
                    aria-invalid={!!errors.password}
                    aria-describedby={fieldHintId('password')}
                    {...form.register('password')}
                  />
                </LaField>
                <div className="grid gap-4 sm:grid-cols-2">
                  <LaField label={<Optional>Phone</Optional>} htmlFor="phone" error={errors.phone?.message} submitCount={submitCount} confirmFix>
                    <Input
                      id="phone"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      maxLength={PHONE_MAX}
                      placeholder="+91 98765 43210"
                      aria-invalid={!!errors.phone}
                      aria-describedby={fieldHintId('phone')}
                      {...filterInput(form.register('phone'), phoneChars)}
                    />
                  </LaField>
                  <LaField label={<Optional>Website</Optional>} htmlFor="website" error={errors.website?.message} submitCount={submitCount} confirmFix>
                    <Input
                      id="website"
                      type="url"
                      inputMode="url"
                      autoComplete="url"
                      autoCapitalize="none"
                      spellCheck={false}
                      maxLength={WEBSITE_MAX}
                      placeholder="yourbrand.com"
                      aria-invalid={!!errors.website}
                      aria-describedby={fieldHintId('website')}
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
                      I agree to the{' '}
                      <Link to="/terms" target="_blank" className="font-semibold text-brand underline-offset-4 hover:underline">
                        Terms and Conditions
                      </Link>{' '}
                      and have read the{' '}
                      <Link to="/privacy" target="_blank" className="font-semibold text-brand underline-offset-4 hover:underline">
                        Privacy policy
                      </Link>
                    </label>
                  </div>
                  {errors.agree ? (
                    <p id="agree-error" role="alert" className="mt-1.5 text-caption font-semibold text-danger">
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
          {sent ? <LiveStatus creds={sent} handle={sent.handle} remembered={sent.remembered} /> : <HowAccessWorks />}
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

/** Replaces the design's email-code card: there are no emails, a person reviews every request. */
function HowAccessWorks() {
  return (
    <LaCard pad="sm" className="mt-2">
      <div className="flex items-center gap-3">
        <IconTile icon="users" tone="brand" size="sm" />
        <h2 className="font-display text-h3 font-bold text-ink">What happens next</h2>
      </div>
      <ol className="mt-3.5 flex flex-col gap-2.5 text-small text-ink-2">
        {[
          'We don’t send an email code. A person on our team reviews every request instead.',
          'Check where your request stands any time with the email and password you choose here.',
          'Once approved, your brand gets a trial workspace and you sign in as its owner.',
        ].map((t, i) => (
          <li key={t} className="flex gap-3">
            <span className="flex size-[22px] shrink-0 items-center justify-center rounded-full border border-[var(--tile-brand-line)] bg-[var(--tile-brand-bg)] text-caption font-bold text-[var(--tile-brand-fg)] shadow-raised-sm">
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
          <IconTile icon="check" tone="ok" />
          Request sent
        </h1>
        <p className="mt-2 text-body text-ink-2">
          A person reviews every request before the workspace opens. Your status is on the right and updates by itself.
        </p>
      </div>
      <dl className="divide-y divide-line rounded-card border border-line bg-sunken text-body">
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
        If this email already has a Kuinn login, the request only counts when you used that login’s password.
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

/**
 * The request's live status: polled with the status handle (15 s, visible tab only, stops once
 * decided). With no handle, or one that names nothing (404), POST /signup/status is read once with
 * the in-memory credentials, then on request; a pending answer there hands a fresh handle to poll.
 */
function LiveStatus({ creds, handle: sentHandle, remembered }: { creds: SignupStatusBody; handle: string | null; remembered: boolean }) {
  const check = useCheckSignupStatus()
  const [handle, setHandle] = useState(sentHandle)
  const [kept, setKept] = useState(remembered)
  const waiting = useWaitingStatus(handle, null)
  const [checked, setChecked] = useState<SignupStatusOut | null>(null)
  const [error, setError] = useState<{ message: string; ref: string | null } | null>(null)
  const fellBack = useRef(false)
  const manual = !handle || waiting.gone

  const run = async () => {
    setError(null)
    try {
      const out = await check.mutateAsync({ email: creds.email, password: creds.password })
      setChecked(out)
      if (out.status === 'pending' && out.status_handle) {
        setKept(saveStatusHandle({ handle: out.status_handle, via: 'password', returnTo: null }))
        setHandle(out.status_handle)
      }
    } catch (e) {
      setError({ message: isApiError(e) ? statusCheckError(e) : describeError(e), ref: isApiError(e) ? e.correlationId : null })
    }
  }

  useEffect(() => {
    if (!manual || fellBack.current) return
    fellBack.current = true
    void run()
    // once, when the handle is missing or names nothing
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manual])

  const result = (manual ? null : waiting.view) ?? checked
  const busy = manual ? check.isPending : waiting.loading

  return (
    <LaCard pad="sm" className="mt-2" data-testid="signup-live-status">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <IconTile icon="clock" tone="brand" size="sm" className="mt-0.5" />
          <div className="min-w-0">
            <h2 className="font-display text-h3 font-bold text-ink">Your request</h2>
            <p className="mt-0.5 truncate text-small text-ink-2">{creds.email}</p>
          </div>
        </div>
        {result ? (
          <StatusChip status={signupChip(result.status).status} className="mt-0.5">
            <span data-testid="signup-live-chip">{signupChip(result.status).label}</span>
          </StatusChip>
        ) : null}
      </div>
      <div aria-live="polite" className="mt-3">
        {busy && !result ? (
          <div className="flex flex-col gap-2" aria-label="Checking status…">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : error ? (
          <FormAlert message={error.message} reference={error.ref} />
        ) : result ? (
          <div className="flex flex-col gap-1 text-small text-ink-2">
            <p>
              {result.status === 'pending' && manual
                ? 'Waiting for a person to review it. Nothing else is needed from you yet.'
                : waitingCopy(result.status, 'password', kept)}
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
            <Link to="/login" onClick={clearStatusHandle} data-testid="signup-live-continue">
              Continue to your workspace
            </Link>
          </Button>
        ) : result?.status === 'rejected' ? (
          <Button asChild size="sm" variant="secondary">
            <a href={`mailto:${COMPANY.email}`}>Contact support</a>
          </Button>
        ) : !manual ? null : (
          <Button size="sm" variant="secondary" onClick={() => void run()} disabled={check.isPending} data-testid="signup-live-refresh">
            {check.isPending ? <Spinner data-icon="inline-start" /> : <Icon name="refresh" size={14} />}
            {check.isPending ? 'Checking…' : 'Check again'}
          </Button>
        )}
      </div>
    </LaCard>
  )
}
