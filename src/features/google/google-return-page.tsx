/**
 * /auth/google: where Google sends the browser back (through the backend's callback). It reads
 * `?handle` or `?error`, strips them from the address bar, takes the binding secret out of
 * sessionStorage and asks `POST /auth/google/complete` what comes next:
 *
 *   sign_in        the same steps as a password sign-in (code, enrolment, recovery codes, password)
 *   link_required  an existing account: its password once, then the same steps; the link is kept
 *                  only after they pass
 *   needs_details  no account yet: a short sign-up form, prefilled from Google
 *   pending        a Google sign-up waiting for review: the status card
 *
 * Every refusal (a Workspace or admin account, a locked account, an unverified identity) is one
 * sentence, so the page never tells anyone which accounts exist.
 */
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useRouter } from '@tanstack/react-router'
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { applyFieldErrors, describeError, isApiError } from '@/api/errors'
import { LaCard } from '@/components/la/cards'
import { fieldHintId, LaField } from '@/components/la/field'
import { Icon, IconTile, type IconSource, type TileTone } from '@/components/la/icons'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { SubmitButton, TOUCH_TEXT } from '@/features/mfa/components'
import { advance, TOO_MANY, ttlLabel, type RestartReason } from '@/features/mfa/login-flow'
import { StepHeader } from '@/features/mfa/login-steps'
import { readDeviceToken, rememberDevice } from '@/features/mfa/trusted-device'
import { AccountChip, AsideLink, AuthCard, AuthColumn, AuthFrame, FormAlert } from '@/features/public/auth-frame'
import { SignInSteps } from '@/features/public/sign-in-steps'
import { useSignInFlow } from '@/features/public/use-sign-in-flow'
import { StatusResult } from '@/features/public/signup-status'
import { useDocumentTitle } from '@/features/public/use-document-title'
import type { SignupStatusOut } from '@/features/signup-admin/format'
import { PasswordInput } from '@/features/signup-admin/password-input'
import { NAME_MAX, PHONE_MAX, signupFormSchema, WEBSITE_MAX, type SignupFormValues } from '@/features/signup-admin/schema'
import { useCountdown } from '@/features/signup-admin/use-countdown'
import { collapseSpaces, filterInput, FORM_VALIDATION_MODE, normalizeWebsite, phoneChars } from '@/lib/validation'
import { linkGoogle, signupGoogle, type GoogleDetails, type GoogleLink, type GoogleSignupFields } from './api'
import { GoogleButton } from './google-button'
import { isCoarsePointer } from '@/lib/pointer'
import { brandNameFrom, ownerNameFrom } from './prefill'
import { captureReturn, completeOnce, reasonFor, type GoogleErrorReason } from './return-state'
import type { GoogleIntent } from './start'

// ---------------------------------------------------------------------------------------------
// Reading the return once

// ---------------------------------------------------------------------------------------------
// The page

type View =
  | { kind: 'loading' }
  | { kind: 'error'; reason: GoogleErrorReason; message?: string; ref: string | null }
  | { kind: 'steps' }
  | { kind: 'link'; link: GoogleLink }
  | { kind: 'details'; details: GoogleDetails; showForm: boolean }
  | { kind: 'status'; status: SignupStatusOut; sent: boolean }

export function GoogleReturnPage({ search }: { search: { handle?: string; error?: string } }) {
  const router = useRouter()
  const [cap] = useState(() => captureReturn(search))
  const ticket = cap.kind === 'go' ? cap.ticket : null
  const intent = ticket?.intent ?? (cap.kind === 'error' ? cap.intent : 'login')
  const [view, setView] = useState<View>(() => (cap.kind === 'error' ? { kind: 'error', reason: cap.reason, ref: null } : { kind: 'loading' }))
  const [email, setEmail] = useState('')

  useDocumentTitle(view.kind === 'details' && view.showForm ? 'Request access' : 'Sign in with Google')

  const flow = useSignInFlow({
    email,
    target: ticket?.returnTo ?? '/home',
    // A sign-in step ran out or failed: start again from the sign-in page, which says why.
    onRestart: (reason: RestartReason) => void router.navigate({ to: '/login', search: { restart: reason }, replace: true }),
    onError: ({ message, ref }) => setView({ kind: 'error', reason: 'other', message, ref }),
    onStep: () => setView({ kind: 'steps' }),
  })

  // The handle is single use: take it out of the address bar (and history) at once.
  useEffect(() => {
    if (search.handle || search.error) void router.navigate({ to: '/auth/google', search: {}, replace: true })
  }, [router, search.handle, search.error])

  useEffect(() => {
    if (cap.kind !== 'go') return
    let live = true
    completeOnce(cap.handle, cap.ticket.bind).then(
      (out) => {
        if (!live) return
        if (out.email) setEmail(out.email)
        if (out.outcome === 'sign_in' && out.login) {
          // The account is known only now: keep (or forget) this browser's trust for it first. The
          // browser sends every token it holds here, so "no longer trusted" only means none of them
          // matched. Say it only to an account that had a token in this browser, never to another
          // person on a shared browser where someone else trusted it.
          const raw = out.login
          const email = out.email
          return void (async () => {
            const held = email ? await readDeviceToken(email) : null
            const login = held ? raw : { ...raw, device_token_invalid: false }
            await rememberDevice(email, login)
            if (live) flow.apply(advance(login))
          })()
        }
        if (out.outcome === 'link_required' && out.link) {
          setEmail(out.link.email)
          return setView({ kind: 'link', link: out.link })
        }
        if (out.outcome === 'needs_details' && out.details) {
          setEmail(out.details.email)
          return setView({ kind: 'details', details: out.details, showForm: cap.ticket.intent === 'signup' })
        }
        if (out.outcome === 'pending' && out.signup) return setView({ kind: 'status', status: out.signup, sent: false })
        setView({ kind: 'error', reason: 'failed', ref: null })
      },
      (e: unknown) => {
        if (live) setView({ kind: 'error', ...reasonFor(e) })
      },
    )
    return () => {
      live = false
    }
    // `flow.apply` is stable; this runs once per handle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cap])

  const toLogin = () => void router.navigate({ to: '/login' })
  const fail = (e: unknown) => setView({ kind: 'error', ...reasonFor(e) })

  if (flow.step.kind !== 'credentials') return <SignInSteps flow={flow} email={email || 'Google account'} onSwitch={toLogin} />

  switch (view.kind) {
    case 'loading':
    case 'steps':
      return <Loading intent={intent} />
    case 'error':
      return <ErrorView reason={view.reason} message={view.message} reference={view.ref} intent={intent} />
    case 'link':
      return <LinkView link={view.link} bind={ticket!.bind} onResult={(r) => void flow.onResult(r)} onFail={fail} onSwitch={toLogin} />
    case 'details':
      return view.showForm ? (
        <DetailsForm
          details={view.details}
          bind={ticket!.bind}
          intent={intent}
          onSent={(status) => setView({ kind: 'status', status, sent: true })}
          onFail={fail}
        />
      ) : (
        <NoAccount email={view.details.email} onContinue={() => setView({ ...view, showForm: true })} />
      )
    case 'status':
      return <GoogleStatus status={view.status} email={email} sent={view.sent} />
  }
}

// ---------------------------------------------------------------------------------------------
// Views

function Loading({ intent }: { intent: GoogleIntent }) {
  return (
    <AuthFrame tone="canvas">
      <AuthCard size="sm" testId="google-loading">
        <div role="status" className="flex flex-col items-center gap-4 py-8 text-center">
          <Spinner className="size-6 text-brand" role="presentation" aria-hidden />
          <p className="text-body font-semibold text-ink">{intent === 'signup' ? 'Checking your Google account…' : 'Signing you in with Google…'}</p>
        </div>
      </AuthCard>
    </AuthFrame>
  )
}

const ERROR_COPY: Record<GoogleErrorReason, { title: string; body: string; icon: IconSource; tone: TileTone }> = {
  failed: {
    title: 'Couldn’t sign you in with Google',
    body: 'Try again, or sign in with your email and password.',
    icon: 'alert',
    tone: 'fail',
  },
  cancelled: {
    title: 'Google sign-in was cancelled',
    body: 'Nothing was shared with Kuinn. Try again, or use your email and password.',
    icon: 'info',
    tone: 'neutral',
  },
  expired: {
    title: 'That Google sign-in timed out',
    body: 'Google sign-in only works for a few minutes. Start again.',
    icon: 'clock',
    tone: 'brand',
  },
  unavailable: {
    title: 'Google sign-in isn’t available right now',
    body: 'Sign in with your email and password.',
    icon: 'info',
    tone: 'neutral',
  },
  'too-many': {
    title: 'Too many attempts',
    body: 'Wait a minute, then try again.',
    icon: 'clock',
    tone: 'warn',
  },
  other: {
    title: 'Something went wrong',
    body: 'Try again in a moment.',
    icon: 'alert',
    tone: 'fail',
  },
}

function ErrorView({ reason, message, reference, intent }: { reason: GoogleErrorReason; message?: string; reference: string | null; intent: GoogleIntent }) {
  const copy = ERROR_COPY[reason]
  const retry = reason !== 'unavailable'
  const introId = useId()
  const signup = intent === 'signup'
  return (
    <AuthFrame
      tone="canvas"
      aside={
        <>
          {signup ? (
            <>
              Have an account? <AsideLink to="/login">Log in</AsideLink>
            </>
          ) : (
            <>
              New brand? <AsideLink to="/signup">Request access</AsideLink>
            </>
          )}
        </>
      }
    >
      <AuthCard size="sm" testId="google-error">
        <StepHeader title={copy.title} introId={introId} focus icon={<IconTile icon={copy.icon} tone={copy.tone} size="lg" />}>
          {message ?? (signup && reason === 'failed' ? 'Try again, or sign up with your email.' : copy.body)}
        </StepHeader>
        {reference ? <FormAlert tone="info" message="If this keeps happening, contact support with this reference." reference={reference} /> : null}
        <div className="flex flex-col gap-3">
          {retry ? <GoogleButton intent={intent} returnTo={null} /> : null}
          <Button asChild size="lg" variant={retry ? 'secondary' : 'primary'} className="w-full">
            <Link to={signup ? '/signup' : '/login'} data-testid="google-error-login">
              {signup ? 'Sign up with email' : 'Sign in with email'}
            </Link>
          </Button>
        </div>
      </AuthCard>
    </AuthFrame>
  )
}

/** Signing in with a Google account that has no Kuinn account is an offer, not an error. */
function NoAccount({ email, onContinue }: { email: string; onContinue: () => void }) {
  const introId = useId()
  return (
    <AuthFrame
      tone="canvas"
      aside={
        <>
          Have an account? <AsideLink to="/login">Log in</AsideLink>
        </>
      }
    >
      <AuthCard size="sm" testId="google-no-account">
        <StepHeader title="No Kuinn account yet" introId={introId} focus icon={<IconTile icon="user" tone="brand" size="lg" />}>
          There’s no Kuinn account for <span className="font-semibold [overflow-wrap:anywhere] text-ink">{email}</span> yet. You can request
          access now. Your name and email from Google are already filled in.
        </StepHeader>
        <div className="flex flex-col gap-3">
          <Button size="lg" className="w-full" onClick={onContinue} data-testid="google-no-account-continue">
            Request access with this account
            <Icon name="arrow" size={16} />
          </Button>
          <Button asChild size="lg" variant="secondary" className="w-full">
            <Link to="/login">Use a different account</Link>
          </Button>
        </div>
      </AuthCard>
    </AuthFrame>
  )
}

/** An existing account proves itself once with its password, then the usual code step. */
function LinkView({
  link,
  bind,
  onResult,
  onFail,
  onSwitch,
}: {
  link: GoogleLink
  bind: string
  onResult: (r: Awaited<ReturnType<typeof linkGoogle>>) => void
  onFail: (e: unknown) => void
  onSwitch: () => void
}) {
  const introId = useId()
  const [password, setPassword] = useState('')
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [formError, setFormError] = useState<{ message: string; ref: string | null } | null>(null)
  const [busy, setBusy] = useState(false)
  const [submits, setSubmits] = useState(0)
  const countdown = useCountdown()

  const onSubmit = async (ev: FormEvent) => {
    ev.preventDefault()
    setSubmits((n) => n + 1)
    setFormError(null)
    if (!password) return setFieldError('Enter your password.')
    setFieldError(null)
    setBusy(true)
    try {
      const result = await linkGoogle(link.link_handle, bind, password)
      setPassword('')
      onResult(result)
    } catch (e) {
      if (isApiError(e) && e.status === 401 && e.type !== 'OAUTH_STATE_INVALID') {
        setFieldError('That password didn’t work. Check it and try again.')
      } else if (isApiError(e) && e.status === 429) {
        countdown.start(e.retryAfter ?? 60)
        setFormError({ message: TOO_MANY, ref: e.correlationId })
      } else if (isApiError(e) && e.status === 422 && e.details.length) {
        setFieldError(e.details[0]?.msg ?? 'Check your password.')
      } else {
        onFail(e)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthFrame tone="canvas">
      <AuthCard size="sm" testId="google-link">
        <AccountChip email={link.email} onSwitch={onSwitch} />
        <StepHeader title="Link Google to your account" introId={introId} focus icon={<IconTile icon="link" tone="brand" size="lg" />}>
          You already have a Kuinn account with this email. Enter its password once to link Google. After that, Continue with Google
          signs you in, and you still enter your login code.
        </StepHeader>
        {formError ? <FormAlert reference={formError.ref} message={formError.message} /> : null}
        <form onSubmit={(e) => void onSubmit(e)} noValidate className="flex flex-col gap-4">
          {/* For password managers: which account this password belongs to. */}
          <input type="email" name="username" autoComplete="username" value={link.email} readOnly hidden />
          <LaField
            label="Kuinn password"
            htmlFor="link-password"
            error={fieldError ?? undefined}
            submitCount={submits}
            hint="Too many wrong tries locks the account for 15 minutes."
          >
            <PasswordInput
              id="link-password"
              autoComplete="current-password"
              autoFocus
              className={TOUCH_TEXT}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={!!fieldError}
              aria-describedby={`${fieldHintId('link-password')} ${introId}`}
            />
          </LaField>
          <SubmitButton busy={busy} waiting={countdown.left} label="Link and continue" busyLabel="Checking…" testId="google-link-submit" />
        </form>
        <p className="border-t border-line pt-5 text-center text-small text-ink-2">
          Not now?{' '}
          <Link to="/login" className="font-semibold text-brand underline-offset-4 hover:underline">
            Sign in with email
          </Link>
        </p>
      </AuthCard>
    </AuthFrame>
  )
}

const detailsSchema = signupFormSchema.pick({ brand_name: true, owner_name: true, phone: true, website: true, agree: true })
type DetailsValues = Pick<SignupFormValues, 'brand_name' | 'owner_name' | 'phone' | 'website' | 'agree'>
const DETAIL_FIELDS = ['brand_name', 'owner_name', 'phone', 'website'] as const

function toFields(v: DetailsValues): GoogleSignupFields {
  const out: GoogleSignupFields = { brand_name: collapseSpaces(v.brand_name), owner_name: collapseSpaces(v.owner_name) }
  const phone = v.phone.trim()
  const website = normalizeWebsite(v.website)
  if (phone) out.phone = phone
  if (website) out.website = website
  return out
}

/** The sign-up form with what Google knows filled in, and only the rest left to type. */
function DetailsForm({
  details,
  bind,
  intent,
  onSent,
  onFail,
}: {
  details: GoogleDetails
  bind: string
  intent: GoogleIntent
  onSent: (status: SignupStatusOut) => void
  onFail: (e: unknown) => void
}) {
  const countdown = useCountdown()
  const [formError, setFormError] = useState<{ message: string; ref: string | null } | null>(null)
  const [suggested] = useState(() => brandNameFrom(details))
  const [owner] = useState(() => ownerNameFrom(details))
  // Brand name is the field most likely to need a change: focus it with its text selected. Never
  // on a touch device, where autofocus opens the keyboard over the form.
  const brandRef = useRef<HTMLInputElement | null>(null)
  useEffect(() => {
    if (isCoarsePointer()) return
    brandRef.current?.focus()
    brandRef.current?.select()
  }, [])
  const form = useForm<DetailsValues>({
    resolver: zodResolver(detailsSchema),
    defaultValues: { brand_name: suggested, owner_name: owner, phone: '', website: '', agree: false },
    ...FORM_VALIDATION_MODE,
  })
  const { errors, submitCount, isSubmitting } = form.formState
  const brandField = form.register('brand_name')
  const brandEdited = useWatch({ control: form.control, name: 'brand_name' }) !== suggested

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null)
    try {
      onSent(await signupGoogle(details.details_handle, bind, toFields(values)))
    } catch (e) {
      if (isApiError(e) && e.status === 429) {
        countdown.start(e.retryAfter ?? 60)
        return setFormError({ message: 'Too many sign-up attempts from this network.', ref: e.correlationId })
      }
      if (isApiError(e) && e.status === 422) {
        const rest = applyFieldErrors(e, form.setError, { fields: DETAIL_FIELDS })
        if (rest.length) setFormError({ message: rest[0]?.msg ?? describeError(e), ref: e.correlationId })
        return
      }
      onFail(e)
    }
  })

  return (
    <AuthFrame
      aside={
        <>
          Have an account? <AsideLink to="/login">Log in</AsideLink>
        </>
      }
    >
      <div className="grid flex-1 lg:grid-cols-2">
        <AuthColumn>
          <div>
            <h1 className="text-[24px] leading-[30px] font-bold tracking-[-0.02em] text-ink sm:text-h1">
              {intent === 'signup' ? 'Create your account' : 'Request access'}
            </h1>
            <p className="mt-2 text-body text-pretty text-ink-2">Google confirmed your email. Add your brand, and we’ll take it from there.</p>
          </div>
          {formError ? (
            <FormAlert
              testId="google-details-error"
              reference={formError.ref}
              message={`${formError.message}${countdown.left ? ` Try again in ${countdown.left} s.` : ''}`}
            />
          ) : null}
          <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4" data-testid="google-details">
            <VerifiedEmail email={details.email} />
            <div className="grid gap-4 sm:grid-cols-2">
              <LaField
                label="Brand name"
                htmlFor="brand_name"
                error={errors.brand_name?.message}
                submitCount={submitCount}
                confirmFix
                hint={suggested && !brandEdited ? 'Suggested from your email domain. Change it if needed.' : undefined}
              >
                <Input
                  id="brand_name"
                  autoComplete="organization"
                  maxLength={NAME_MAX}
                  className={TOUCH_TEXT}
                  aria-invalid={!!errors.brand_name}
                  aria-describedby={fieldHintId('brand_name')}
                  {...brandField}
                  ref={(el) => {
                    brandField.ref(el)
                    brandRef.current = el
                  }}
                />
              </LaField>
              <LaField
                label="Your name"
                htmlFor="owner_name"
                error={errors.owner_name?.message}
                submitCount={submitCount}
                confirmFix
                hint={owner ? 'From your Google profile.' : undefined}
              >
                <Input
                  id="owner_name"
                  autoComplete="name"
                  autoCapitalize="words"
                  maxLength={NAME_MAX}
                  className={TOUCH_TEXT}
                  aria-invalid={!!errors.owner_name}
                  aria-describedby={fieldHintId('owner_name')}
                  {...form.register('owner_name')}
                />
              </LaField>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <LaField label={<Optional>Phone</Optional>} htmlFor="phone" error={errors.phone?.message} submitCount={submitCount} confirmFix>
                <Input
                  id="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  maxLength={PHONE_MAX}
                  className={TOUCH_TEXT}
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
                  className={TOUCH_TEXT}
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
                      id="google-agree"
                      checked={field.value}
                      onCheckedChange={(v) => field.onChange(v === true)}
                      onBlur={field.onBlur}
                      ref={field.ref}
                      aria-invalid={!!errors.agree}
                      aria-describedby={errors.agree ? 'google-agree-error' : undefined}
                      data-testid="google-agree"
                    />
                  )}
                />
                {/* The label pads the checkbox row to a 44px target. */}
                <label htmlFor="google-agree" className="min-h-11 py-2.5 text-small text-ink-2">
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
                <p id="google-agree-error" role="alert" className="mt-1.5 text-caption font-semibold text-danger">
                  {errors.agree.message}
                </p>
              ) : null}
            </div>
            <SubmitButton busy={isSubmitting} waiting={countdown.left} label="Send request" busyLabel="Sending request…" testId="google-details-submit" />
            <p className="flex items-center gap-1.5 text-caption text-ink-3">
              <Icon name="clock" size={14} />
              This form stays open for {ttlLabel(details.details_expires_in)}.
            </p>
          </form>
        </AuthColumn>
        <AuthColumn tone="canvas">
          <GoogleNextSteps />
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

/**
 * The email, read-only: Google verified it, so there is no email code step. Plain text, not a
 * field, so it never looks editable; the badge sits on the label row so it never wraps into it.
 */
function VerifiedEmail({ email }: { email: string }) {
  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="text-small font-bold text-ink">
          Email
        </span>
        <span className="inline-flex h-6 shrink-0 items-center gap-1 rounded-full border border-success-line bg-success-bg px-2 text-caption font-semibold text-success-ink"
        >
          <Icon name="check" size={12} />
          Verified by Google
        </span>
      </div>
      <p
        className="text-body font-semibold [overflow-wrap:anywhere] text-ink"
        data-testid="google-email"
      >
        {email}
      </p>
    </div>
  )
}

function GoogleNextSteps() {
  return (
    <LaCard pad="sm" className="mt-2">
      <div className="flex items-center gap-3">
        <IconTile icon="users" tone="brand" size="sm" />
        <h2 className="font-display text-h3 font-bold text-ink">What happens next</h2>
      </div>
      <ol className="mt-3.5 flex flex-col gap-2.5 text-small text-ink-2">
        {[
          'A person on our team reviews every request.',
          'To see where it stands, use Continue with Google on the sign-in page. No password to remember.',
          'Once approved, you sign in with Google and set up a 6-digit login code from an authenticator app.',
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

const STATUS_COPY: Record<SignupStatusOut['status'], string> = {
  pending: 'A person on our team reviews every request. Nothing else is needed from you. To check on it, use Continue with Google again.',
  approved: 'Your trial workspace is ready. Continue with Google to sign in.',
  rejected: 'You can contact support about the reviewer’s reason.',
}

function GoogleStatus({ status, email, sent }: { status: SignupStatusOut; email: string; sent: boolean }) {
  return (
    <AuthFrame>
      <div className="mx-auto flex w-full max-w-[448px] flex-1 flex-col gap-4 px-4 pt-8 pb-6 sm:pt-12" data-testid={sent ? 'google-sent' : 'google-pending'}>
        <StatusResult
          result={status}
          email={email}
          description={sent && status.status === 'pending' ? `Request sent. ${STATUS_COPY.pending}` : STATUS_COPY[status.status]}
          actions={
            <div className="flex flex-col gap-3">
              {status.status === 'rejected' ? null : <GoogleButton intent="login" returnTo={null} />}
              <Button asChild size="lg" variant="ghost" className="w-full">
                <Link to="/">Back to Kuinn</Link>
              </Button>
            </div>
          }
        />
      </div>
    </AuthFrame>
  )
}
