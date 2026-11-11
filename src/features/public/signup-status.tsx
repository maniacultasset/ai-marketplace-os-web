/**
 * /signup/status: POST /signup/status (routers/signup.py signup_status) with email and password,
 * the newest request out. Every refusal is the same 401. Credentials stay in memory only.
 * A pending answer carries a status handle: from then on (and on a later visit from this device,
 * while the handle is kept) the card polls POST /signup/status/poll and updates by itself.
 * Frame: hi-fi 01 without column 1b.
 */
import { zodResolver } from '@hookform/resolvers/zod'
import { Link } from '@tanstack/react-router'
import { useState, type ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { applyFieldErrors, isApiError } from '@/api/errors'
import { fieldHintId, LaField } from '@/components/la/field'
import { Icon, IconTile, type IconSource, type TileTone } from '@/components/la/icons'
import { StatusChip } from '@/components/la/status-chip'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { useCheckSignupStatus } from '@/features/signup-admin/api'
import { retryAfterSeconds, SIGNUP_STATUS_META, statusCheckError, type SignupStatusOut } from '@/features/signup-admin/format'
import { PasswordInput } from '@/features/signup-admin/password-input'
import {
  LOGIN_EMAIL_MAX,
  statusFormSchema,
  toStatusBody,
  type SignupStatusBody,
  type StatusFormValues,
} from '@/features/signup-admin/schema'
import { clearStatusHandle, readStatusHandle, saveStatusHandle, type StatusHandleEntry } from '@/features/signup-admin/status-handle'
import { TimeAgo } from '@/features/signup-admin/time'
import { useCountdown } from '@/features/signup-admin/use-countdown'
import { approvedSignIn } from '@/lib/sign-in-state'
import { FORM_VALIDATION_MODE } from '@/lib/validation'
import { AsideLink, AuthFootnote, AuthFrame, FormAlert } from './auth-frame'
import { useDocumentTitle } from './use-document-title'
import { pollErrorMessage, pollErrorRef, useWaitingStatus, viewChip, viewCopy, waitingTitle, type StatusView } from './waiting'
import { QuestionBlock, WaitingActions } from './waiting-status'

export function SignupStatusPage({ initialEmail }: { initialEmail?: string }) {
  useDocumentTitle('Check a request')
  return (
    <AuthFrame
      aside={
        <>
          Not applied yet? <AsideLink to="/signup">Request access</AsideLink>
        </>
      }
    >
      <div className="mx-auto flex w-full max-w-[448px] flex-1 flex-col gap-4 px-4 pt-8 pb-6 sm:pt-12">
        <SignupStatusCheck initialEmail={initialEmail} />
        <AuthFootnote />
      </div>
    </AuthFrame>
  )
}

function SignupStatusCheck({ initialEmail }: { initialEmail?: string }) {
  const check = useCheckSignupStatus()
  const countdown = useCountdown()
  const [formError, setFormError] = useState<{ message: string; ref: string | null } | null>(null)
  const [creds, setCreds] = useState<SignupStatusBody | null>(null)
  const [result, setResult] = useState<SignupStatusOut | null>(null)
  // A handle kept on this device from an earlier visit (or the check below): poll with it.
  const [entry, setEntry] = useState<StatusHandleEntry | null>(() => readStatusHandle())
  const [remembered, setRemembered] = useState(() => entry !== null)
  const waiting = useWaitingStatus(entry?.handle ?? null, result)

  const form = useForm<StatusFormValues>({
    resolver: zodResolver(statusFormSchema),
    defaultValues: { email: initialEmail ?? '', password: '' },
    ...FORM_VALIDATION_MODE,
  })
  const { errors } = form.formState

  const run = async (body: SignupStatusBody) => {
    setFormError(null)
    try {
      const out = await check.mutateAsync(body)
      setCreds(body)
      setResult(out)
      if (out.status === 'pending' && out.status_handle) {
        const next: StatusHandleEntry = { handle: out.status_handle, via: 'password', returnTo: null }
        setRemembered(saveStatusHandle(next))
        setEntry(next)
      }
    } catch (e) {
      const wait = retryAfterSeconds(e)
      if (wait) countdown.start(wait)
      setResult(null)
      setCreds(null)
      const rest = applyFieldErrors(e, form.setError, { fields: ['email', 'password'] })
      if (isApiError(e) && e.status === 422 && rest.length === 0) return
      setFormError({ message: statusCheckError(e), ref: isApiError(e) ? e.correlationId : null })
      if (isApiError(e) && e.status === 401) form.setFocus('password')
    }
  }

  const onSubmit = form.handleSubmit((values) => run(toStatusBody(values)))
  const locked = countdown.left > 0
  const reset = (email: string) => {
    clearStatusHandle()
    setEntry(null)
    setResult(null)
    setCreds(null)
    form.reset({ email, password: '' })
  }

  if (entry && !waiting.gone) {
    if (!waiting.view && waiting.error)
      return (
        <PollFailed
          error={waiting.error}
          retrying={waiting.retrying}
          onRetry={waiting.refetch}
          onReset={() => reset(creds?.email ?? initialEmail ?? '')}
        />
      )
    if (!waiting.view) return <StatusLoading />
    return (
      <PolledResult
        view={waiting.view}
        entry={entry}
        email={creds?.email ?? ''}
        signInEmail={creds?.email ?? initialEmail}
        remembered={remembered}
        onReset={() => reset(creds?.email ?? initialEmail ?? '')}
      />
    )
  }

  if (result && creds) {
    return (
      <StatusResult
        result={result}
        email={creds.email}
        refreshing={check.isPending}
        onRefresh={() => void run(creds)}
        onReset={() => reset(creds.email)}
      />
    )
  }

  return (
    <div className="flex flex-col gap-4" data-testid="signup-status-card">
      <div>
        <h1 className="text-h1 text-ink">Check your request</h1>
        <p className="mt-2 text-body text-ink-2">Use the email and password you applied with.</p>
      </div>
      {formError ? (
        <FormAlert
          testId="signup-status-error"
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
            autoFocus={!initialEmail}
            spellCheck={false}
            maxLength={LOGIN_EMAIL_MAX}
            placeholder="you@yourbrand.com"
            aria-invalid={!!errors.email}
            aria-describedby={fieldHintId('email')}
            {...form.register('email')}
          />
        </LaField>
        <LaField label="Password" htmlFor="password" error={errors.password?.message} submitCount={form.formState.submitCount}>
          <PasswordInput
            id="password"
            autoComplete="current-password"
            autoFocus={!!initialEmail}
            aria-invalid={!!errors.password}
            aria-describedby={fieldHintId('password')}
            {...form.register('password')}
          />
        </LaField>
        <Button type="submit" size="lg" className="w-full" disabled={check.isPending || locked} data-testid="signup-status-submit">
          {check.isPending ? <Spinner data-icon="inline-start" /> : null}
          {locked ? `Try again in ${countdown.left} s` : check.isPending ? 'Checking…' : 'Check status'}
        </Button>
      </form>
      <p className="text-small text-ink-2">
        Already approved?{' '}
        <Link to="/login" className="font-semibold text-brand underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  )
}

/** The card while the first poll answers. */
function StatusLoading() {
  return (
    <div className="flex flex-col gap-3" role="status" aria-label="Checking your request…" data-testid="signup-status-loading">
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  )
}

/** The first poll failed (429, 5xx, network): say so, offer a retry and another email. */
function PollFailed({
  error,
  retrying,
  onRetry,
  onReset,
}: {
  error: unknown
  retrying: boolean
  onRetry: () => void
  onReset: () => void
}) {
  return (
    <div className="flex flex-col gap-4" data-testid="signup-status-poll-error">
      <h1 className="text-h1 text-ink">Check your request</h1>
      <FormAlert testId="signup-status-error" message={pollErrorMessage(error)} reference={pollErrorRef(error)} />
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button size="lg" className="flex-1" onClick={onRetry} disabled={retrying} data-testid="signup-status-retry">
          {retrying ? <Spinner data-icon="inline-start" /> : <Icon name="refresh" size={16} />}
          {retrying ? 'Checking…' : 'Check again'}
        </Button>
        <Button size="lg" variant="secondary" className="flex-1" onClick={onReset} data-testid="signup-status-another">
          Use another email
        </Button>
      </div>
    </div>
  )
}

/** The polled card: updates by itself, one next step per state. */
function PolledResult({
  view,
  entry,
  email,
  signInEmail,
  remembered,
  onReset,
}: {
  view: StatusView
  entry: StatusHandleEntry
  email: string
  /** For the sign-in after approval: the email typed here, or the one this page was opened with. */
  signInEmail?: string
  remembered: boolean
  onReset: () => void
}) {
  return (
    <StatusResult
      result={view}
      email={email}
      title={waitingTitle(view)}
      description={viewCopy(view, entry.via, remembered)}
      extra={<QuestionBlock view={view} handle={entry.handle} />}
      actions={
        <WaitingActions
          status={view.status}
          via={entry.via}
          returnTo={entry.returnTo}
          email={email}
          signInEmail={signInEmail}
          secondary={
            <Button size="lg" variant="ghost" className="w-full" onClick={onReset} data-testid="signup-status-another">
              Use another email
            </Button>
          }
        />
      }
    />
  )
}

/**
 * A request's status card. Also shown by /auth/google for a Google sign-up, which passes its own
 * `actions` (checking again there means another Google round trip, not a password).
 */
export function StatusResult({
  result,
  email,
  refreshing = false,
  onRefresh,
  onReset,
  actions,
  description,
  title,
  extra,
}: {
  result: StatusView
  email: string
  refreshing?: boolean
  onRefresh?: () => void
  onReset?: () => void
  /** Replaces the default buttons under the card. */
  actions?: ReactNode
  /** Replaces the status's default sentence under the title. */
  description?: string
  /** Replaces the status's default title. */
  title?: string
  /** Under the reason, above the details: the reviewer's question and the reply box. */
  extra?: ReactNode
}) {
  const meta = SIGNUP_STATUS_META[result.status]
  const chip = viewChip(result)
  return (
    <div className="flex flex-col gap-4" data-testid="signup-status-result">
      <div>
        <div className="flex items-center gap-3">
          <IconTile icon={RESULT_TILE[result.status].icon} tone={RESULT_TILE[result.status].tone} />
          <h1 className="text-h1 text-ink" data-testid="signup-status-title">
            {title ?? meta.title}
          </h1>
        </div>
        <p className="mt-2 text-body text-ink-2">{description ?? meta.description}</p>
      </div>
      <div aria-live="polite" className="flex flex-col gap-4">
        {result.status === 'rejected' && result.reason ? (
          <figure className="rounded-[10px] border border-danger-line bg-danger-bg px-4 py-3">
            <figcaption className="text-caption font-bold text-danger-ink">Reviewer’s reason</figcaption>
            <blockquote className="mt-1 text-body break-words whitespace-pre-wrap text-danger-ink" data-testid="signup-status-reason">
              {result.reason}
            </blockquote>
          </figure>
        ) : null}
        {extra}
        <dl className="divide-y divide-line rounded-card border border-line bg-surface text-body shadow-raised-md">
          <Row label="Brand">
            <span className="truncate font-semibold text-ink">{result.brand_name}</span>
          </Row>
          <Row label="Status">
            <StatusChip status={chip.status}>
              <span data-testid="signup-status-badge">{chip.label}</span>
            </StatusChip>
          </Row>
          <Row label="Requested">
            <TimeAgo iso={result.created_at} />
          </Row>
          {result.decided_at ? (
            <Row label={result.status === 'approved' ? 'Approved' : 'Decided'}>
              <TimeAgo iso={result.decided_at} />
            </Row>
          ) : null}
          {email ? (
            <Row label="Sign-in email">
              <span className="truncate">{email}</span>
            </Row>
          ) : null}
        </dl>
      </div>
      {actions ?? (
      <div className="flex flex-col gap-2 sm:flex-row">
        {result.status === 'approved' ? (
          <Button asChild size="lg" className="flex-1">
            <Link to="/login" state={approvedSignIn(email)} data-testid="signup-status-signin">
              Sign in
              <Icon name="arrow" size={16} />
            </Link>
          </Button>
        ) : result.status === 'rejected' ? (
          <Button asChild size="lg" className="flex-1">
            <Link to="/signup" search={{ email }} data-testid="signup-status-reapply">
              Apply again
              <Icon name="arrow" size={16} />
            </Link>
          </Button>
        ) : (
          <Button size="lg" className="flex-1" onClick={onRefresh} disabled={refreshing} data-testid="signup-status-refresh">
            {refreshing ? <Spinner data-icon="inline-start" /> : <Icon name="refresh" size={16} />}
            {refreshing ? 'Checking…' : 'Check again'}
          </Button>
        )}
        <Button size="lg" variant="secondary" className="flex-1" onClick={onReset}>
          Use another email
        </Button>
      </div>
      )}
    </div>
  )
}

/** Decorative tile beside the result title; the title and the chip carry the meaning. */
const RESULT_TILE: Record<SignupStatusOut['status'], { icon: IconSource; tone: TileTone }> = {
  pending: { icon: 'clock', tone: 'brand' },
  approved: { icon: 'check', tone: 'ok' },
  rejected: { icon: 'x', tone: 'fail' },
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-4 px-4 py-2">
      <dt className="shrink-0 text-small text-ink-2">{label}</dt>
      <dd className="flex min-w-0 items-center justify-end text-right text-ink">{children}</dd>
    </div>
  )
}
