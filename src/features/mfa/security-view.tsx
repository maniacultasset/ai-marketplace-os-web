/**
 * Settings > Security (DPP-1; docs/HANDOFF-FE.md §6.4): login codes and the password.
 *
 * - Status from GET /auth/security: MFA on or off, recovery codes left (warn at 3 or fewer), the
 *   enforcement mode, the grace date, and when the password was changed and expires.
 * - Set up (POST /auth/mfa/totp/enroll with the current password, then /confirm), replace (enroll
 *   without a password; the API asks for a step-up, which the step-up dialog answers), and new
 *   recovery codes (POST /auth/mfa/recovery-codes, also behind a step-up).
 * - Change password (POST /auth/password): the live rules, the once-a-day limit as the API says it.
 *
 * Under `enforcement: "off"` the MFA routes answer 501, so the login-codes card only explains.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { isApiError } from '@/api/errors'
import { getAccessToken, refreshOnce } from '@/api/session'
import type { SecurityOut, TotpEnrollOut } from '@/api/types'
import { Banner } from '@/components/la/banner'
import { fieldHintId, LaField } from '@/components/la/field'
import { ErrorState } from '@/components/states/error-state'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { FormAlert } from '@/features/public/auth-frame'
import { PasswordInput } from '@/features/signup-admin/password-input'
import { useMe } from '@/lib/auth'
import { useKeys } from '@/lib/query-keys'
import { toast } from '@/lib/toast'
import { changePassword, mfaErrorMessage, regenerateRecoveryCodes, securityQueryOptions, totpConfirm, totpEnroll } from './api'
import { CodeField, QrCode, RecoveryCodes, SetupKey } from './components'
import { isTotp } from './login-flow'
import { PasswordForm } from './password-form'

/** Warn when this many recovery codes or fewer are left (HANDOFF-FE §6.3). */
export const LOW_CODES = 3

/** True while `iso` is in the future. */
function isFuture(iso: string | null | undefined): boolean {
  if (!iso) return false
  const t = new Date(iso).getTime()
  return !Number.isNaN(t) && t > Date.now()
}

function day(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : format(d, 'd MMM yyyy')
}

type Problem = { message: string; ref: string | null } | null
const problem = (e: unknown): Problem => ({ message: mfaErrorMessage(e), ref: isApiError(e) ? e.correlationId : null })

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid min-w-0 gap-1 border-t px-5 py-3 sm:grid-cols-[11rem_minmax(0,1fr)] sm:items-center sm:gap-4">
      <dt className="text-[0.8125rem] text-muted-foreground">{label}</dt>
      <dd className="flex min-h-6 min-w-0 flex-wrap items-center gap-2 text-sm">{children}</dd>
    </div>
  )
}

// ---------------------------------------------------------------------------------------------

type SetupStage = { kind: 'password' } | { kind: 'scan'; secret: TotpEnrollOut } | { kind: 'codes'; codes: string[] }

/**
 * Set up (`replace` false: the current password first) or replace the authenticator, confirm with
 * a code, then show the new recovery codes once.
 */
function TotpSetup({
  replace,
  email,
  onClose,
  onDone,
}: {
  replace: boolean
  email: string
  onClose: () => void
  onDone: () => void
}) {
  const [stage, setStage] = useState<SetupStage | null>(replace ? null : { kind: 'password' })
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [err, setErr] = useState<Problem>(null)
  const [busy, setBusy] = useState(false)
  const started = useRef(false)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const codeRef = useRef<HTMLInputElement>(null)
  const pwId = useId()

  // Secrets, codes and the password go with the panel.
  useEffect(
    () => () => {
      setStage(null)
      setPassword('')
      setCode('')
    },
    [],
  )
  // Each new stage moves focus to the panel heading, so the change is announced.
  useEffect(() => {
    if (stage) headingRef.current?.focus()
  }, [stage?.kind]) // eslint-disable-line react-hooks/exhaustive-deps -- on stage change only

  const enroll = async (currentPassword?: string) => {
    setBusy(true)
    setErr(null)
    setFieldError(null)
    try {
      const secret = await totpEnroll(currentPassword)
      setPassword('')
      setStage({ kind: 'scan', secret })
    } catch (e) {
      if (isApiError(e) && e.status === 422 && !replace) setFieldError(mfaErrorMessage(e))
      else setErr(problem(e))
    } finally {
      setBusy(false)
    }
  }

  // Replacing needs no password: start at once (the step-up dialog may open first).
  useEffect(() => {
    if (!replace || started.current) return
    started.current = true
    void enroll()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once
  }, [replace])

  const onPassword = (e: FormEvent) => {
    e.preventDefault()
    if (!password) {
      setFieldError('Enter your current password.')
      return
    }
    void enroll(password)
  }

  const onConfirm = async (e: FormEvent) => {
    e.preventDefault()
    if (!isTotp(code)) {
      setFieldError('Enter the 6-digit code from your app.')
      codeRef.current?.focus()
      return
    }
    setBusy(true)
    setErr(null)
    setFieldError(null)
    try {
      const codes = await totpConfirm(code)
      setCode('')
      setStage({ kind: 'codes', codes })
    } catch (e2) {
      if (isApiError(e2) && e2.status === 422) {
        setFieldError(e2.details[0]?.msg ?? mfaErrorMessage(e2))
        setCode('')
        codeRef.current?.focus()
      } else setErr(problem(e2))
    } finally {
      setBusy(false)
    }
  }

  const title =
    stage?.kind === 'codes' ? 'Save your recovery codes' : replace ? 'Replace your authenticator' : 'Set up login codes'

  return (
    <section aria-labelledby={`${pwId}-title`} className="flex flex-col gap-4 border-t px-5 py-5" data-testid="totp-setup">
      <h3 id={`${pwId}-title`} ref={headingRef} tabIndex={-1} className="text-[0.9375rem] font-semibold outline-none">
        {title}
      </h3>
      {err ? <FormAlert testId="totp-setup-error" message={err.message} reference={err.ref} /> : null}

      {stage === null ? (
        busy ? (
          <p className="flex items-center gap-2 text-sm text-ink-2" role="status">
            <Spinner /> Preparing a new setup key…
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => void enroll()}>
              Try again
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
          </div>
        )
      ) : stage.kind === 'password' ? (
        <form onSubmit={onPassword} noValidate className="flex max-w-md flex-col gap-4">
          <p className="text-sm text-ink-2">Confirm it's you with your current password.</p>
          <LaField label="Current password" htmlFor={`${pwId}-pw`} error={fieldError ?? undefined}>
            <PasswordInput
              id={`${pwId}-pw`}
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                setFieldError(null)
              }}
              aria-invalid={!!fieldError}
              aria-describedby={fieldHintId(`${pwId}-pw`)}
            />
          </LaField>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy}>
              {busy ? <Spinner data-icon="inline-start" /> : null}
              Continue
            </Button>
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
          </div>
        </form>
      ) : stage.kind === 'scan' ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-ink-2">
            Scan the QR code with an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password), or type the
            setup key. Then enter the 6-digit code it shows.
          </p>
          <div className="flex flex-col items-start gap-4 sm:flex-row">
            <QrCode uri={stage.secret.otpauth_uri} />
            <div className="w-full min-w-0 sm:max-w-sm">
              <SetupKey secret={stage.secret.secret_b32} />
            </div>
          </div>
          <form onSubmit={(e) => void onConfirm(e)} noValidate className="flex max-w-md flex-col gap-4">
            <CodeField
              id={`${pwId}-code`}
              kind="totp"
              value={code}
              onChange={(v) => {
                setCode(v)
                setFieldError(null)
              }}
              error={fieldError}
              inputRef={codeRef}
            />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={busy}>
                {busy ? <Spinner data-icon="inline-start" /> : null}
                {replace ? 'Use this authenticator' : 'Turn on login codes'}
              </Button>
              <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
            </div>
          </form>
          {replace ? <p className="text-caption text-ink-3">Your old authenticator keeps working until you confirm the new one.</p> : null}
        </div>
      ) : (
        <div className="flex max-w-lg flex-col gap-3">
          <p className="text-sm text-ink-2">
            Login codes are on. If you lose your phone, sign in with one of these codes. Each works once, and you will not see
            them again. Your other devices were signed out.
          </p>
          <RecoveryCodes codes={stage.codes} account={email} continueLabel="Done" onContinue={onDone} />
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------------------------

function NewCodes({ email, onClose }: { email: string; onClose: () => void }) {
  const [codes, setCodes] = useState<string[] | null>(null)
  const [err, setErr] = useState<Problem>(null)
  const [busy, setBusy] = useState(true)
  const started = useRef(false)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const id = useId()
  const run = () => {
    setBusy(true)
    setErr(null)
    regenerateRecoveryCodes()
      .then(setCodes)
      .catch((e: unknown) => setErr(problem(e)))
      .finally(() => setBusy(false))
  }
  useEffect(() => {
    if (started.current) return
    started.current = true
    run()
  }, [])
  useEffect(() => () => setCodes(null), [])
  useEffect(() => {
    if (codes) headingRef.current?.focus()
  }, [codes])
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4 border-t px-5 py-5" data-testid="new-codes">
      <h3 id={id} ref={headingRef} tabIndex={-1} className="text-[0.9375rem] font-semibold outline-none">
        New recovery codes
      </h3>
      {busy ? (
        <p className="flex items-center gap-2 text-sm text-ink-2" role="status">
          <Spinner /> Making new codes…
        </p>
      ) : err ? (
        <>
          <FormAlert testId="new-codes-error" message={err.message} reference={err.ref} />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={run}>
              Try again
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </>
      ) : codes ? (
        <div className="flex max-w-lg flex-col gap-3">
          <p className="text-sm text-ink-2">Your old codes stopped working. Each new code works once, and you will not see them again.</p>
          <RecoveryCodes codes={codes} account={email} continueLabel="Done" onContinue={onClose} />
        </div>
      ) : null}
    </section>
  )
}

type Panel = null | 'setup' | 'replace' | 'codes'

function LoginCodesCard({ security, email, autoSetup, onSetupShown }: { security: SecurityOut; email: string; autoSetup: boolean; onSetupShown: () => void }) {
  const qc = useQueryClient()
  const keys = useKeys()
  const on = security.enforcement === 'all'
  const enrolled = security.mfa_enrolled
  // Routed here by MFA_ENROLLMENT_REQUIRED (?setup=true): the setup opens at once.
  const [panel, setPanel] = useState<Panel>(autoSetup && on && !enrolled ? 'setup' : null)
  const [confirmCodes, setConfirmCodes] = useState(false)
  const grace = day(security.mfa_grace_until)
  const graceFuture = isFuture(security.mfa_grace_until)
  const low = enrolled && security.recovery_codes_left <= LOW_CODES

  useEffect(() => {
    if (autoSetup) onSetupShown()
  }, [autoSetup, onSetupShown])

  const refresh = () => void qc.invalidateQueries({ queryKey: keys.security() })
  const close = () => {
    setPanel(null)
    refresh()
  }
  const finishSetup = () => {
    // The session's refresh family now records the fresh code: rotate once so this tab's access
    // token carries it too (a sensitive action right after then needs no second code).
    void refreshOnce(getAccessToken()).catch(() => undefined)
    toast.success(panel === 'replace' ? 'Authenticator replaced' : 'Login codes are on')
    close()
  }

  return (
    <Card className="gap-0 py-0" data-testid="login-codes-card">
      <CardHeader className="pt-5 pb-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <CardTitle>Login codes</CardTitle>
          {!on ? (
            <Badge variant="muted">Not switched on yet</Badge>
          ) : enrolled ? (
            <Badge variant="success" data-testid="mfa-status">On</Badge>
          ) : (
            <Badge variant="warning" data-testid="mfa-status">Not set up</Badge>
          )}
        </div>
        <CardDescription className="max-w-[60ch]">
          {on
            ? 'Each sign-in asks for a 6-digit code from an authenticator app on your phone, after your password.'
            : 'Two-step sign-in with an authenticator app is coming to Kuinn. When it is switched on you can set it up here, or at your next sign-in.'}
        </CardDescription>
      </CardHeader>

      {on && !enrolled ? (
        <div className="px-5 pb-4">
          <Banner tone="attention" role="status" title={graceFuture ? `Set up login codes by ${grace}` : 'Set up login codes'}>
            {graceFuture
              ? 'After that date you will be asked to set them up when you sign in.'
              : 'You will be asked to set them up at your next sign-in. Doing it now takes a minute.'}
          </Banner>
        </div>
      ) : null}
      {low ? (
        <div className="px-5 pb-4">
          <Banner tone="attention" role="status" title={`Only ${security.recovery_codes_left} recovery code${security.recovery_codes_left === 1 ? '' : 's'} left`}>
            Make new ones so you can still sign in if you lose your phone.
          </Banner>
        </div>
      ) : null}

      {on ? (
        <>
          <dl>
            <Row label="Authenticator app">{enrolled ? 'Set up' : 'Not set up'}</Row>
            {enrolled ? (
              <Row label="Recovery codes left">
                <span data-testid="codes-left" className="tabular-nums">
                  {security.recovery_codes_left} of 10
                </span>
              </Row>
            ) : null}
          </dl>
          {panel === null ? (
            <div className="flex flex-wrap gap-2 border-t px-5 py-4">
              {enrolled ? (
                <>
                  <Button variant="outline" size="sm" onClick={() => setPanel('replace')} data-testid="replace-authenticator">
                    Replace authenticator
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setConfirmCodes(true)} data-testid="new-recovery-codes">
                    New recovery codes
                  </Button>
                </>
              ) : (
                <Button size="sm" onClick={() => setPanel('setup')} data-testid="setup-authenticator">
                  Set up authenticator
                </Button>
              )}
            </div>
          ) : panel === 'codes' ? (
            <NewCodes email={email} onClose={close} />
          ) : (
            <TotpSetup key={panel} replace={panel === 'replace'} email={email} onClose={close} onDone={finishSetup} />
          )}
        </>
      ) : null}

      <AlertDialog open={confirmCodes} onOpenChange={setConfirmCodes}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Make new recovery codes?</AlertDialogTitle>
            <AlertDialogDescription>
              Your current recovery codes stop working at once. You may be asked for a code from your authenticator app first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmCodes(false)
                setPanel('codes')
              }}
            >
              Make new codes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

// ---------------------------------------------------------------------------------------------

function PasswordCard({ security, email, displayName }: { security: SecurityOut; email: string; displayName: string | null | undefined }) {
  const qc = useQueryClient()
  const keys = useKeys()
  const [open, setOpen] = useState(false)
  const changed = day(security.password_changed_at)
  const expires = day(security.password_expires_at)
  return (
    <Card className="gap-0 py-0" data-testid="password-card">
      <CardHeader className="pt-5 pb-4">
        <CardTitle>Password</CardTitle>
        <CardDescription className="max-w-[60ch]">
          You can change it once a day. Changing it signs you out on your other devices.
        </CardDescription>
      </CardHeader>
      <dl>
        <Row label="Last changed">{changed ?? <span className="text-muted-foreground">Not recorded</span>}</Row>
        {expires ? <Row label="Expires">{expires}</Row> : null}
      </dl>
      {open ? (
        <div className="max-w-md border-t px-5 py-5">
          <PasswordForm
            email={email}
            displayName={displayName}
            requireCurrent
            autoFocus
            idPrefix="settings-pw"
            submitLabel="Change password"
            testId="change-password-form"
            onSubmit={async ({ current_password, new_password }) => {
              await changePassword(current_password, new_password)
              toast.success('Password changed', { description: 'Your other devices were signed out.' })
              setOpen(false)
              void qc.invalidateQueries({ queryKey: keys.security() })
            }}
          />
          <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <div className="border-t px-5 py-4">
          <Button variant="outline" size="sm" onClick={() => setOpen(true)} data-testid="change-password">
            Change password
          </Button>
        </div>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------------------------

/** /settings/security. `setup` opens the authenticator setup at once (from MFA_ENROLLMENT_REQUIRED). */
export function SecurityView({ setup = false, onSetupShown }: { setup?: boolean; onSetupShown: () => void }) {
  const keys = useKeys()
  const me = useMe()
  const security = useQuery(securityQueryOptions(keys.security()))
  if (security.error && !security.data) return <ErrorState error={security.error} onRetry={() => void security.refetch()} />
  if (!security.data || !me.data) {
    return (
      <div className="flex max-w-3xl flex-col gap-6" aria-busy="true" aria-label="Loading security settings">
        {[0, 1].map((i) => (
          <Card key={i} className="gap-3 p-5">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-72 max-w-full" />
            <Skeleton className="h-8 w-44" />
          </Card>
        ))}
      </div>
    )
  }
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <LoginCodesCard security={security.data} email={me.data.email} autoSetup={setup} onSetupShown={onSetupShown} />
      <PasswordCard security={security.data} email={me.data.email} displayName={me.data.display_name} />
      <Card>
        <CardContent className="text-sm text-ink-2">
          Lost your phone and your recovery codes? Ask your brand owner to contact Kuinn support. We check who you are before
          we reset login codes.
        </CardContent>
      </Card>
    </div>
  )
}
