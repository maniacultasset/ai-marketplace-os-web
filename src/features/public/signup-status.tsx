/**
 * /signup/status: POST /signup/status (routers/signup.py signup_status) with email and password,
 * the newest request out. Every refusal is the same 401. Credentials stay in memory only.
 * Frame: hi-fi 01 without column 1b.
 */
import { zodResolver } from '@hookform/resolvers/zod'
import { Link } from '@tanstack/react-router'
import { useState, type ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { applyFieldErrors, isApiError } from '@/api/errors'
import { LaField } from '@/components/la/field'
import { Icon, IconTile, type IconSource, type TileTone } from '@/components/la/icons'
import { StatusChip } from '@/components/la/status-chip'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { useCheckSignupStatus } from '@/features/signup-admin/api'
import { retryAfterSeconds, SIGNUP_STATUS_META, statusCheckError, type SignupStatusOut } from '@/features/signup-admin/format'
import { PasswordInput } from '@/features/signup-admin/password-input'
import { statusFormSchema, toStatusBody, type SignupStatusBody, type StatusFormValues } from '@/features/signup-admin/schema'
import { TimeAgo } from '@/features/signup-admin/time'
import { useCountdown } from '@/features/signup-admin/use-countdown'
import { AsideLink, AuthFootnote, AuthFrame, FormAlert } from './auth-frame'
import { signupChip } from './model'
import { useDocumentTitle } from './use-document-title'

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

  const form = useForm<StatusFormValues>({
    resolver: zodResolver(statusFormSchema),
    defaultValues: { email: initialEmail ?? '', password: '' },
  })
  const { errors } = form.formState

  const run = async (body: SignupStatusBody) => {
    setFormError(null)
    try {
      const out = await check.mutateAsync(body)
      setCreds(body)
      setResult(out)
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

  if (result && creds) {
    return (
      <StatusResult
        result={result}
        email={creds.email}
        refreshing={check.isPending}
        onRefresh={() => void run(creds)}
        onReset={() => {
          setResult(null)
          setCreds(null)
          form.reset({ email: creds.email, password: '' })
        }}
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
        <LaField label="Email" htmlFor="email" error={errors.email?.message}>
          <Input
            id="email"
            type="email"
            autoComplete="username"
            autoFocus={!initialEmail}
            spellCheck={false}
            placeholder="you@yourbrand.com"
            aria-invalid={!!errors.email}
            {...form.register('email')}
          />
        </LaField>
        <LaField label="Password" htmlFor="password" error={errors.password?.message}>
          <PasswordInput id="password" autoComplete="current-password" autoFocus={!!initialEmail} aria-invalid={!!errors.password} {...form.register('password')} />
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

function StatusResult({
  result,
  email,
  refreshing,
  onRefresh,
  onReset,
}: {
  result: SignupStatusOut
  email: string
  refreshing: boolean
  onRefresh: () => void
  onReset: () => void
}) {
  const meta = SIGNUP_STATUS_META[result.status]
  const chip = signupChip(result.status)
  return (
    <div className="flex flex-col gap-4" data-testid="signup-status-result">
      <div>
        <div className="flex items-center gap-3">
          <IconTile icon={RESULT_TILE[result.status].icon} tone={RESULT_TILE[result.status].tone} />
          <h1 className="text-h1 text-ink" data-testid="signup-status-title">
            {meta.title}
          </h1>
        </div>
        <p className="mt-2 text-body text-ink-2">{meta.description}</p>
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
          <Row label="Sign-in email">
            <span className="truncate">{email}</span>
          </Row>
        </dl>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        {result.status === 'approved' ? (
          <Button asChild size="lg" className="flex-1">
            <Link to="/login" data-testid="signup-status-signin">
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
