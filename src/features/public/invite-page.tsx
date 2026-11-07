/**
 * /invite#token=…: a teammate's invite link (contract 2.1.0, SI5). The page reads the token from
 * the fragment once, takes it out of the address bar and keeps it in this tab only (it survives a
 * reload, a sign-in and a trip to Google), then asks POST /invites/lookup what the link is for:
 *
 *   new           no account for the email: name, password and confirm, or Continue with Google
 *                 (the Google email must be the invited one)
 *   own_password  an account that cannot sign in yet (a pending sign-up, or no active brand): its
 *                 current Kuinn password only
 *   existing      an account that can sign in: sign in, then Join (POST /invites/join, then switch)
 *
 * A new account is signed in straight away with the password just set (the usual login-code and
 * set-up steps follow). Every refusal of the link (used, cancelled, replaced, expired, a brand that
 * is not active) is the same 404, so the page says it once, in one way.
 */
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useRouter } from '@tanstack/react-router'
import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { describeError, isApiError } from '@/api/errors'
import type { Role } from '@/api/types'
import { fieldHintId, LaField } from '@/components/la/field'
import { Icon, IconTile, type IconSource, type TileTone } from '@/components/la/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { GoogleEntry } from '@/features/google/google-button'
import { ruleMessages } from '@/features/mfa/api'
import { PasswordRules, SubmitButton, TOUCH_TEXT } from '@/features/mfa/components'
import { TOO_MANY, type RestartReason } from '@/features/mfa/login-flow'
import { checkPassword, PASSWORD_MAX } from '@/features/mfa/password-rules'
import { StepHeader } from '@/features/mfa/login-steps'
import { PasswordInput } from '@/features/signup-admin/password-input'
import { useCountdown } from '@/features/signup-admin/use-countdown'
import { acceptInviteWithPassword, joinInvite, lookupOnce, type InvitePreview } from '@/features/team-account/access-api'
import { inviteStash, sameEmail, shortDateTime, takeLinkToken, type LinkToken } from '@/features/team-account/access-model'
import { ROLE_INFO } from '@/features/team-account/roles'
import { logout, signIn, switchTenant, useMe, useSession } from '@/lib/auth'
import { toast } from '@/lib/toast'
import { FORM_VALIDATION_MODE, NAME_MAX, personName } from '@/lib/validation'
import { AuthCard, AuthFrame, FormAlert } from './auth-frame'
import { SignInSteps } from './sign-in-steps'
import { useDocumentTitle } from './use-document-title'
import { useSignInFlow } from './use-sign-in-flow'

type View =
  | { kind: 'loading' }
  | { kind: 'missing' }
  | { kind: 'invalid' }
  | { kind: 'too-many'; ref: string | null; wait: number }
  | { kind: 'error'; message: string; ref: string | null }
  | { kind: 'ready'; preview: InvitePreview }
  /** Joined, but the automatic sign-in did not finish: sign in by hand. */
  | { kind: 'joined'; email: string; tenant: string }

function initialView(t: LinkToken): View {
  if (t.kind === 'missing') return { kind: 'missing' }
  if (t.kind === 'malformed') return { kind: 'invalid' }
  return { kind: 'loading' }
}

export function InvitePage() {
  useDocumentTitle('Join your team')
  const router = useRouter()
  const [token] = useState(() => takeLinkToken(inviteStash))
  const [view, setView] = useState<View>(() => initialView(token))
  const [attempt, setAttempt] = useState(0)
  const [email, setEmail] = useState('')

  const flow = useSignInFlow({
    email,
    target: '/home',
    onRestart: (reason: RestartReason) => void router.navigate({ to: '/login', search: { restart: reason }, replace: true }),
    onError: () => setView((v) => (v.kind === 'ready' ? { kind: 'joined', email: v.preview.email, tenant: v.preview.tenant_name } : v)),
  })

  useEffect(() => {
    if (token.kind !== 'ok') return
    let live = true
    lookupOnce(token.token).then(
      (preview) => {
        if (!live) return
        setEmail(preview.email)
        setView({ kind: 'ready', preview })
      },
      (e: unknown) => {
        if (!live) return
        if (isApiError(e) && e.status === 404) {
          inviteStash.clear()
          return setView({ kind: 'invalid' })
        }
        if (isApiError(e) && e.status === 422) {
          inviteStash.clear()
          return setView({ kind: 'invalid' })
        }
        if (isApiError(e) && e.status === 429) return setView({ kind: 'too-many', ref: e.correlationId, wait: e.retryAfter ?? 60 })
        setView({ kind: 'error', message: describeError(e), ref: isApiError(e) ? e.correlationId : null })
      },
    )
    return () => {
      live = false
    }
  }, [token, attempt])

  const retry = () => {
    setView({ kind: 'loading' })
    setAttempt((n) => n + 1)
  }

  if (flow.step.kind !== 'credentials') return <SignInSteps flow={flow} email={email} onSwitch={() => void router.navigate({ to: '/login' })} />

  switch (view.kind) {
    case 'loading':
      return <Loading />
    case 'missing':
      return (
        <Notice icon="link" tone="neutral" title="Open the whole invite link" testId="invite-missing">
          This page needs the full link from your invite, including the part after the # sign. Copy it again from the message you got.
        </Notice>
      )
    case 'invalid':
      return (
        <Notice icon="clock" tone="warn" title="This invite link doesn’t work" testId="invite-invalid">
          It may have been used already, cancelled, or replaced by a newer one, or the 7 days ran out. Ask the person who invited you for a
          new link.
        </Notice>
      )
    case 'too-many':
      return <TooMany wait={view.wait} reference={view.ref} onRetry={retry} />
    case 'error':
      return (
        <Notice icon="alert" tone="fail" title="Couldn’t open the invite" reference={view.ref} testId="invite-error" action={<RetryButton onRetry={retry} />}>
          {view.message}
        </Notice>
      )
    case 'joined':
      return (
        <Notice icon="check" tone="ok" title={`You joined ${view.tenant}`} testId="invite-joined" action={<SignInLink />}>
          Sign in as <Strong>{view.email}</Strong> to start.
        </Notice>
      )
    case 'ready':
      if (token.kind !== 'ok') return null
      return (
        <Ready
          preview={view.preview}
          token={token.token}
          onInvalid={() => {
            inviteStash.clear()
            setView({ kind: 'invalid' })
          }}
          onAccepted={async (password) => {
            inviteStash.clear()
            try {
              await flow.onResult(await signIn(view.preview.email, password))
            } catch {
              setView({ kind: 'joined', email: view.preview.email, tenant: view.preview.tenant_name })
            }
          }}
        />
      )
  }
}

// ---------------------------------------------------------------------------------------------
// The invite, and the form for its account

function Ready({
  preview,
  token,
  onInvalid,
  onAccepted,
}: {
  preview: InvitePreview
  token: string
  onInvalid: () => void
  /** The invite was accepted with this password: sign in with it. */
  onAccepted: (password: string) => Promise<void>
}) {
  const introId = useId()
  const session = useSession()
  const me = useMe()
  const signedIn = session.status === 'authenticated'
  const role = ROLE_INFO[preview.role as Role]

  let body: ReactNode
  // A session whose account cannot be read counts as signed out here (Join would answer 401).
  const account = signedIn ? me.data : undefined
  if (signedIn && me.isPending) body = <Spinner className="mx-auto size-5 text-brand" aria-label="Checking who is signed in" />
  else if (account && !sameEmail(account.email, preview.email)) body = <WrongAccount signedInAs={account.email} invited={preview.email} />
  else if (preview.account === 'existing')
    body = account ? <JoinButton preview={preview} token={token} onInvalid={onInvalid} /> : <SignInToJoin email={preview.email} />
  else if (preview.account === 'own_password') body = <OwnPasswordForm preview={preview} token={token} onInvalid={onInvalid} onAccepted={onAccepted} />
  else body = <NewAccountForm preview={preview} token={token} onInvalid={onInvalid} onAccepted={onAccepted} />

  return (
    <AuthFrame tone="canvas">
      <AuthCard size="sm" testId="invite-card">
        <StepHeader title={`Join ${preview.tenant_name} on Kuinn`} introId={introId} focus icon={<IconTile icon="users" tone="brand" size="lg" />}>
          You are invited as {role.label.toLowerCase()}: {role.summary.charAt(0).toLowerCase() + role.summary.slice(1)}
        </StepHeader>
        <dl className="flex flex-col gap-2 rounded-tile border border-line bg-canvas px-3 py-2.5 text-small shadow-inset-sm" data-testid="invite-summary">
          <div className="flex flex-wrap justify-between gap-x-3">
            <dt className="text-ink-2">Email</dt>
            <dd className="font-semibold [overflow-wrap:anywhere] text-ink" data-testid="invite-preview-email">
              {preview.email}
            </dd>
          </div>
          <div className="flex flex-wrap justify-between gap-x-3">
            <dt className="text-ink-2">Link works until</dt>
            <dd className="text-ink tabular-nums">{shortDateTime(preview.expires_at)}</dd>
          </div>
        </dl>
        {body}
      </AuthCard>
    </AuthFrame>
  )
}

const newAccountSchema = (email: string) =>
  z
    .object({
      display_name: personName('your name', 120),
      password: z.string().min(1, 'Choose a password.'),
      confirm: z.string().min(1, 'Type the password again.'),
    })
    .superRefine((v, ctx) => {
      if (v.password && checkPassword(v.password, { email, displayName: v.display_name }).length)
        ctx.addIssue({ code: 'custom', path: ['password'], message: 'Meet every rule in the list.' })
      if (v.confirm && v.confirm !== v.password) ctx.addIssue({ code: 'custom', path: ['confirm'], message: 'The two passwords do not match.' })
    })
type NewAccountValues = { display_name: string; password: string; confirm: string }

/** Shared refusals of POST /invites/accept. Returns true when it handled the error. */
function useAcceptErrors(onInvalid: () => void) {
  const countdown = useCountdown()
  const [formError, setFormError] = useState<{ message: string; ref: string | null } | null>(null)
  const handle = (e: unknown): boolean => {
    if (!isApiError(e)) {
      setFormError({ message: describeError(e), ref: null })
      return true
    }
    if (e.status === 404) {
      onInvalid()
      return true
    }
    if (e.status === 429) {
      countdown.start(e.retryAfter ?? 60)
      setFormError({ message: TOO_MANY, ref: e.correlationId })
      return true
    }
    if (e.status === 409) {
      setFormError({ message: 'This email already has a Kuinn account that can sign in. Sign in, then open the invite link again.', ref: e.correlationId })
      return true
    }
    return false
  }
  return { countdown, formError, setFormError, handle }
}

function NewAccountForm({
  preview,
  token,
  onInvalid,
  onAccepted,
}: {
  preview: InvitePreview
  token: string
  onInvalid: () => void
  onAccepted: (password: string) => Promise<void>
}) {
  const rulesId = useId()
  const errs = useAcceptErrors(onInvalid)
  const form = useForm<NewAccountValues>({
    resolver: zodResolver(newAccountSchema(preview.email)),
    defaultValues: { display_name: '', password: '', confirm: '' },
    ...FORM_VALIDATION_MODE,
  })
  const { errors, isSubmitting, submitCount } = form.formState
  const [password, displayName] = useWatch({ control: form.control, name: ['password', 'display_name'] })

  const onSubmit = form.handleSubmit(async (v) => {
    errs.setFormError(null)
    try {
      await acceptInviteWithPassword(token, v.password, v.display_name.trim())
    } catch (e) {
      if (errs.handle(e)) return
      const rules = ruleMessages(e, 'password')
      if (rules.length) return form.setError('password', { type: 'server', message: rules.join(' ') }, { shouldFocus: true })
      const name = ruleMessages(e, 'display_name')
      if (name.length) return form.setError('display_name', { type: 'server', message: name.join(' ') }, { shouldFocus: true })
      errs.setFormError({ message: describeError(e), ref: isApiError(e) ? e.correlationId : null })
      return
    }
    form.reset()
    await onAccepted(v.password)
  })

  return (
    <div className="flex flex-col gap-5">
      {errs.formError ? <FormAlert testId="invite-form-error" message={errs.formError.message} reference={errs.formError.ref} /> : null}
      <GoogleEntry intent="invite" returnTo="/invite" divider="or set a password" />
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4" data-testid="invite-new-form">
        {/* For password managers: the account this password is for. */}
        <input type="email" name="username" autoComplete="username" value={preview.email} readOnly hidden />
        <LaField label="Your name" htmlFor="invite-name" error={errors.display_name?.message} submitCount={submitCount} confirmFix>
          <Input
            id="invite-name"
            autoComplete="name"
            autoCapitalize="words"
            maxLength={NAME_MAX}
            className={TOUCH_TEXT}
            aria-invalid={!!errors.display_name}
            aria-describedby={fieldHintId('invite-name')}
            {...form.register('display_name')}
          />
        </LaField>
        <LaField label="Password" htmlFor="invite-password" error={errors.password?.message} submitCount={submitCount}>
          <PasswordInput
            id="invite-password"
            autoComplete="new-password"
            maxLength={PASSWORD_MAX}
            className={TOUCH_TEXT}
            aria-invalid={!!errors.password}
            aria-describedby={`${fieldHintId('invite-password')} ${rulesId}`}
            {...form.register('password')}
          />
        </LaField>
        <PasswordRules id={rulesId} value={password} email={preview.email} displayName={displayName} />
        <LaField label="Type it again" htmlFor="invite-confirm" error={errors.confirm?.message} submitCount={submitCount}>
          <PasswordInput
            id="invite-confirm"
            autoComplete="new-password"
            maxLength={PASSWORD_MAX}
            className={TOUCH_TEXT}
            aria-invalid={!!errors.confirm}
            aria-describedby={fieldHintId('invite-confirm')}
            {...form.register('confirm')}
          />
        </LaField>
        <SubmitButton
          busy={isSubmitting}
          waiting={errs.countdown.left}
          label="Create account and join"
          busyLabel="Creating your account…"
          testId="invite-new-submit"
        />
      </form>
    </div>
  )
}

function OwnPasswordForm({
  preview,
  token,
  onInvalid,
  onAccepted,
}: {
  preview: InvitePreview
  token: string
  onInvalid: () => void
  onAccepted: (password: string) => Promise<void>
}) {
  const errs = useAcceptErrors(onInvalid)
  const [password, setPassword] = useState('')
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [submits, setSubmits] = useState(0)

  const onSubmit = async (ev: FormEvent) => {
    ev.preventDefault()
    setSubmits((n) => n + 1)
    errs.setFormError(null)
    if (!password) return setFieldError('Enter your Kuinn password.')
    setFieldError(null)
    setBusy(true)
    try {
      await acceptInviteWithPassword(token, password)
    } catch (e) {
      setBusy(false)
      if (isApiError(e) && e.status === 401) return setFieldError('That password didn’t work. Check it and try again.')
      if (errs.handle(e)) return
      const rules = ruleMessages(e, 'password')
      if (rules.length) return setFieldError(rules.join(' '))
      errs.setFormError({ message: describeError(e), ref: isApiError(e) ? e.correlationId : null })
      return
    }
    const used = password
    setPassword('')
    await onAccepted(used)
    setBusy(false)
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-body text-ink-2">
        You already started a Kuinn account with this email. Enter its password to join. Nothing else is needed.
      </p>
      {errs.formError ? <FormAlert testId="invite-form-error" message={errs.formError.message} reference={errs.formError.ref} /> : null}
      <form onSubmit={(e) => void onSubmit(e)} noValidate className="flex flex-col gap-4" data-testid="invite-own-form">
        <input type="email" name="username" autoComplete="username" value={preview.email} readOnly hidden />
        <LaField
          label="Your Kuinn password"
          htmlFor="invite-own-password"
          error={fieldError ?? undefined}
          submitCount={submits}
          hint="Too many wrong tries locks the account for 15 minutes."
        >
          <PasswordInput
            id="invite-own-password"
            autoComplete="current-password"
            className={TOUCH_TEXT}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={!!fieldError}
            aria-describedby={fieldHintId('invite-own-password')}
          />
        </LaField>
        <SubmitButton busy={busy} waiting={errs.countdown.left} label={`Join ${preview.tenant_name}`} busyLabel="Joining…" testId="invite-own-submit" />
      </form>
    </div>
  )
}

/** Signed in as the invited email: one click joins, then switches to the new brand. */
function JoinButton({ preview, token, onInvalid }: { preview: InvitePreview; token: string; onInvalid: () => void }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [already, setAlready] = useState(false)
  const [error, setError] = useState<{ message: string; ref: string | null } | null>(null)

  const onJoin = async () => {
    setBusy(true)
    setError(null)
    try {
      const joined = await joinInvite(token)
      inviteStash.clear()
      await switchTenant(joined.tenant_id)
      toast.success(`You joined ${preview.tenant_name}`)
      await router.navigate({ to: '/home' })
    } catch (e) {
      setBusy(false)
      if (isApiError(e) && e.status === 404) return onInvalid()
      if (isApiError(e) && e.status === 409) {
        inviteStash.clear()
        return setAlready(true)
      }
      if (isApiError(e) && e.status === 401) return
      setError({ message: describeError(e), ref: isApiError(e) ? e.correlationId : null })
    }
  }

  if (already)
    return (
      <div className="flex flex-col gap-4" data-testid="invite-already">
        <p className="text-body text-ink-2">You are already on the {preview.tenant_name} team. Switch to it from the brand menu.</p>
        <Button asChild size="lg" className="w-full">
          <Link to="/home">Open Kuinn</Link>
        </Button>
      </div>
    )

  return (
    <div className="flex flex-col gap-4">
      {error ? <FormAlert message={error.message} reference={error.ref} /> : null}
      <Button size="lg" className="w-full" onClick={() => void onJoin()} disabled={busy} data-testid="invite-join">
        {busy ? <Spinner data-icon="inline-start" /> : null}
        {busy ? 'Joining…' : `Join ${preview.tenant_name}`}
      </Button>
    </div>
  )
}

function SignInToJoin({ email }: { email: string }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-body text-ink-2">
        You already have a Kuinn account for <Strong>{email}</Strong>. Sign in, and you come back here to join.
      </p>
      <Button asChild size="lg" className="w-full">
        <Link to="/login" search={{ redirect: '/invite' }} data-testid="invite-sign-in">
          Sign in to join
        </Link>
      </Button>
    </div>
  )
}

function WrongAccount({ signedInAs, invited }: { signedInAs: string; invited: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  return (
    <div className="flex flex-col gap-4" data-testid="invite-wrong-account">
      <p className="text-body text-ink-2">
        You are signed in as <Strong>{signedInAs}</Strong>. This invite is for <Strong>{invited}</Strong>. Sign out first to use it.
      </p>
      <Button
        size="lg"
        variant="secondary"
        className="w-full"
        disabled={busy}
        onClick={() => {
          setBusy(true)
          void logout().then(() => router.navigate({ to: '/invite' }))
        }}
        data-testid="invite-sign-out"
      >
        {busy ? <Spinner data-icon="inline-start" /> : null}
        {busy ? 'Signing out…' : 'Sign out and continue'}
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------------------------
// States

function Loading() {
  return (
    <AuthFrame tone="canvas">
      <AuthCard size="sm" testId="invite-loading">
        <div role="status" className="flex flex-col items-center gap-4 py-8 text-center">
          <Spinner className="size-6 text-brand" role="presentation" aria-hidden />
          <p className="text-body font-semibold text-ink">Opening your invite…</p>
        </div>
      </AuthCard>
    </AuthFrame>
  )
}

export function Notice({
  icon,
  tone,
  title,
  children,
  reference,
  action,
  testId,
}: {
  icon: IconSource
  tone: TileTone
  title: string
  children: ReactNode
  reference?: string | null
  action?: ReactNode
  testId: string
}) {
  const introId = useId()
  return (
    <AuthFrame tone="canvas">
      <AuthCard size="sm" testId={testId}>
        <StepHeader title={title} introId={introId} focus icon={<IconTile icon={icon} tone={tone} size="lg" />}>
          {children}
        </StepHeader>
        {reference ? <FormAlert tone="info" message="If this keeps happening, contact support with this reference." reference={reference} /> : null}
        {action ?? <SignInLink variant="secondary" />}
      </AuthCard>
    </AuthFrame>
  )
}

function TooMany({ wait, reference, onRetry }: { wait: number; reference: string | null; onRetry: () => void }) {
  const countdown = useCountdown()
  const { start } = countdown
  useEffect(() => {
    start(wait)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- start once per wait
  }, [wait])
  return (
    <Notice icon="clock" tone="warn" title="Too many tries" reference={reference} testId="invite-too-many" action={<RetryButton onRetry={onRetry} waiting={countdown.left} />}>
      Wait a minute, then try again.
    </Notice>
  )
}

function RetryButton({ onRetry, waiting = 0 }: { onRetry: () => void; waiting?: number }) {
  return (
    <Button size="lg" className="w-full tabular-nums" onClick={onRetry} disabled={waiting > 0}>
      {waiting > 0 ? <Icon name="clock" size={16} /> : <Icon name="refresh" size={16} />}
      {waiting > 0 ? `Try again in ${waiting} s` : 'Try again'}
    </Button>
  )
}

function SignInLink({ variant = 'primary' }: { variant?: 'primary' | 'secondary' }) {
  return (
    <Button asChild size="lg" variant={variant} className="w-full">
      <Link to="/login">Go to sign in</Link>
    </Button>
  )
}

function Strong({ children }: { children: ReactNode }) {
  return <span className="font-semibold [overflow-wrap:anywhere] text-ink">{children}</span>
}
