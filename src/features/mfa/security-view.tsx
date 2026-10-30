/**
 * Settings > Security (DPP-1; docs/HANDOFF-FE.md §6.4): login codes and the password.
 *
 * - Status from GET /auth/security: MFA on or off, recovery codes left (warn at 3 or fewer), the
 *   enforcement mode, the grace date, and when the password was changed and expires.
 * - Set up (POST /auth/mfa/totp/enroll with the current password, then /confirm), replace (enroll
 *   without a password; the API asks for a step-up, which the step-up dialog answers), and new
 *   recovery codes (POST /auth/mfa/recovery-codes, also behind a step-up).
 * - Change password (POST /auth/password): the live rules, the once-a-day limit as the API says it.
 * - Google (ADR-0020): shown while a Google account is linked; Remove (POST /auth/google/unlink,
 *   behind a step-up) unless Google is the account's only way in (no password).
 * - Trusted browsers (ADR-0023): GET /auth/devices, Remove each, Sign out all devices. A password
 *   change or a new authenticator forgets them all on the server, so this browser forgets its
 *   token too and the list reloads.
 *
 * Under `enforcement: "off"` the MFA routes answer 501, so the login-codes card only explains.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { format, formatDistanceToNowStrict } from 'date-fns'
import { ArrowRight, KeyRound, LogOut, Monitor, MonitorSmartphone, RefreshCw, RotateCw, Smartphone, Trash2 } from 'lucide-react'
import { Children, useEffect, useId, useRef, useState, type ComponentProps, type FormEvent, type ReactNode } from 'react'
import { isApiError } from '@/api/errors'
import { clearSession, getAccessToken, refreshOnce, sessionHasFamily } from '@/api/session'
import type { SecurityOut, TotpEnrollOut } from '@/api/types'
import { Banner } from '@/components/la/banner'
import { LaCard } from '@/components/la/cards'
import { fieldHintId, LaField } from '@/components/la/field'
import { IconTile, type IconSource, type TileTone } from '@/components/la/icons'
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
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { unlinkGoogle } from '@/features/google/api'
import { FormAlert } from '@/features/public/auth-frame'
import { PasswordInput } from '@/features/signup-admin/password-input'
import { useMe } from '@/lib/auth'
import { useKeys } from '@/lib/query-keys'
import { cn } from '@/lib/utils'
import { toast } from '@/lib/toast'
import {
  changePassword,
  devicesQueryOptions,
  mfaErrorMessage,
  regenerateRecoveryCodes,
  removeDevice,
  securityQueryOptions,
  signOutAllDevices,
  totpConfirm,
  totpEnroll,
} from './api'
import { CodeField, QrPanel, RecoveryCodes, SubmitButton, TOUCH_TEXT } from './components'
import { BackButton, EnrolWizard, GetAppBody, PasswordConfirmed, QrAgain } from './enrol-wizard'
import { PRIMARY } from './enrol-steps'
import { isTotp } from './login-flow'
import { PasswordForm } from './password-form'
import { forgetDeviceToken, TRUST_DAYS } from './trusted-device'
import type { TrustedDevice } from './types'

/** Trusted browsers kept per user (backend `TRUST_MAX_DEVICES`; the oldest is evicted). */
const TRUST_MAX = 10

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

/** True when `iso` is within `days` from now (or past). */
function within(iso: string | null | undefined, days: number): boolean {
  if (!iso) return false
  const t = new Date(iso).getTime()
  return !Number.isNaN(t) && t - Date.now() <= days * 86_400_000
}

/**
 * Card head: icon tile, title with status, description, and one action on the right. Laid out by
 * the card's own width (the card is a container), so a card squeezed by the settings menu on a
 * tablet stacks its action under the text as a phone does.
 */
function CardTop({
  icon,
  tone,
  title,
  status,
  action,
  children,
}: {
  icon: IconSource
  tone: TileTone
  title: string
  status?: ReactNode
  action?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start gap-4 p-5 sm:p-6 @xl:flex-nowrap">
      <IconTile icon={icon} tone={tone} size="lg" />
      <div className="min-w-0 flex-1 basis-48">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-h3 text-ink">{title}</h2>
          {status}
        </div>
        {children ? <p className="mt-1 max-w-[68ch] text-small text-ink-2">{children}</p> : null}
      </div>
      {action ? <div className="w-full @xl:ml-auto @xl:w-auto @xl:shrink-0 @xl:self-center">{action}</div> : null}
    </div>
  )
}

/** Facts under a card head: one line each in a narrow card, two side by side in a wide one. */
function Facts({ children }: { children: ReactNode }) {
  const single = Children.toArray(children).filter(Boolean).length === 1
  return <dl className={cn('grid border-t border-line @xl:grid-cols-2', single && '[&>div]:@xl:col-span-2')}>{children}</dl>
}

function Fact({ label, children, valueClassName }: { label: string; children: ReactNode; valueClassName?: string }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-4 border-b border-line px-5 py-3.5 last:border-b-0 sm:px-6 @xl:block @xl:border-b-0 @xl:py-4 @xl:[&:nth-child(2n)]:border-l">
      <dt className="min-w-0 text-small whitespace-nowrap text-ink-2">{label}</dt>
      <dd className={cn('shrink-0 text-body font-semibold whitespace-nowrap text-ink tabular-nums @xl:mt-1', valueClassName)}>{children}</dd>
    </div>
  )
}

/**
 * "8 of 10" with a 10-segment meter (decorative: the words carry the meaning). In a narrow card the
 * meter sits under the value, so the label keeps one line.
 */
function CodesMeter({ n }: { n: number }) {
  const low = n <= LOW_CODES
  return (
    <span className="flex flex-col items-end gap-1.5 @xl:flex-col-reverse @xl:items-start @xl:gap-2">
      {/* One inset track (with its hairline) holding the ten segments, as every meter does. */}
      <span aria-hidden className="inset-track flex gap-1 rounded-full border border-line p-0.5">
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i} className={cn('h-1.5 w-2.5 rounded-full @xl:w-4', i < n ? (low ? 'bg-attention' : 'bg-success') : 'bg-ink-3/35')} />
        ))}
      </span>
      <span data-testid="codes-left" className="leading-5 tabular-nums">
        {n} of 10
      </span>
    </span>
  )
}

/** The tinted surface a card opens below its facts (setup, new codes, change password). */
function PanelSurface({ children, className, ...rest }: { children: ReactNode; className?: string } & Omit<ComponentProps<'section'>, 'className' | 'children'>) {
  return (
    <section className="border-t border-line bg-canvas/60 px-5 py-6 sm:px-6" {...rest}>
      <div className={cn('flex max-w-[640px] flex-col gap-4', className)}>{children}</div>
    </section>
  )
}

/** Panel buttons, as in the password form: Cancel first in the DOM, the action on top on a phone, right-aligned from 640px. */
const FOOTER = 'flex flex-col-reverse gap-2 sm:flex-row sm:justify-end'

function Busy({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center gap-2 py-6 text-small text-ink-2" role="status">
      <Spinner /> {children}
    </p>
  )
}

// ---------------------------------------------------------------------------------------------

type SetupStage = { kind: 'password' } | { kind: 'scan'; secret: TotpEnrollOut } | { kind: 'codes'; codes: string[] }

/**
 * Set up (`replace` false: the current password first) or replace the authenticator in the four
 * enrolment steps (the sign-in enrolment's shell): get the app, scan, enter the code, then the new
 * recovery codes once. Setting up asks for the current password on the first step and enrols when
 * it is confirmed; replacing enrols as the panel opens (the step-up dialog may open first). Back
 * and Continue between the first three steps never enrol again.
 */
function TotpSetup({
  replace,
  email,
  onClose,
  onDone,
  onStage,
}: {
  replace: boolean
  email: string
  onClose: () => void
  onDone: () => void
  /** Told each stage as it opens (the card hides its stale status while the codes show). */
  onStage?: (kind: SetupStage['kind'] | null) => void
}) {
  const [stage, setStage] = useState<SetupStage | null>(replace ? null : { kind: 'password' })
  const [step, setStep] = useState<0 | 1 | 2>(0)
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [err, setErr] = useState<Problem>(null)
  const [busy, setBusy] = useState(false)
  const started = useRef(false)
  const codeRef = useRef<HTMLInputElement>(null)
  const pwId = useId()
  const headingId = useId()

  useEffect(() => {
    onStage?.(stage?.kind ?? null)
  }, [stage?.kind]) // eslint-disable-line react-hooks/exhaustive-deps -- on stage change only

  const enroll = async (currentPassword?: string) => {
    setBusy(true)
    setErr(null)
    setFieldError(null)
    try {
      const secret = await totpEnroll(currentPassword)
      setPassword('')
      setStage({ kind: 'scan', secret })
      // Setting up: the password was this step's Continue, so go on to the scan.
      if (currentPassword !== undefined) setStep(1)
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

  const secret = stage?.kind === 'scan' ? stage.secret : null

  const onPassword = (e: FormEvent) => {
    e.preventDefault()
    if (secret) return setStep(1)
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

  const alert = err ? <FormAlert testId="totp-setup-error" message={err.message} reference={err.ref} /> : null
  const cancel = (
    <Button type="button" variant="ghost" size="sm" className="-mt-px shrink-0" onClick={onClose} disabled={busy} data-testid="setup-cancel">
      Cancel
    </Button>
  )
  // Replacing: the enrol call failed (or a step-up was cancelled) and there is no key yet.
  const retry =
    replace && !secret && !busy && err ? (
      <Button type="button" variant="secondary" className="w-full sm:w-auto sm:self-start" onClick={() => void enroll()}>
        <RotateCw data-icon="inline-start" />
        Try again
      </Button>
    ) : null
  const panel = (children: ReactNode) => (
    <PanelSurface aria-labelledby={headingId} data-testid="totp-setup" className="max-w-[720px] gap-0">
      {children}
    </PanelSurface>
  )
  const continueLabel = (
    <>
      Continue
      <ArrowRight data-icon="inline-end" />
    </>
  )

  if (stage?.kind === 'codes') {
    return panel(
      <EnrolWizard step={3} level={3} variant="panel" headingId={headingId} title="Save your recovery codes" intro="Login codes are on and your other devices were signed out. If you lose your phone, sign in with one of these codes.">
        <RecoveryCodes
          codes={stage.codes}
          account={email}
          continueLabel="Done"
          continueClassName={cn(PRIMARY, 'sm:self-end')}
          onContinue={onDone}
          bar="panel"
        />
      </EnrolWizard>,
    )
  }

  if (step === 0) {
    return panel(
      <EnrolWizard
        step={0}
        headingId={headingId}
        level={3}
        variant="panel"
        aside={cancel}
        title={replace ? 'Replace your authenticator' : 'Set up login codes'}
        intro={
          replace
            ? 'Install an authenticator app on the phone you want to use. Your old authenticator keeps working until you confirm the new one.'
            : 'Install an authenticator app on your phone, then confirm your password.'
        }
        error={alert}
        onSubmit={onPassword}
        actions={
          replace ? (
            <Button type="button" size="lg" className={PRIMARY} onClick={() => setStep(1)} data-testid="enrol-continue">
              {continueLabel}
            </Button>
          ) : (
            <SubmitButton busy={busy} waiting={0} label="Continue" busyLabel="Checking…" className={PRIMARY} testId="enrol-continue" />
          )
        }
      >
        <GetAppBody>
          {retry}
          {replace ? null : secret ? (
            <PasswordConfirmed />
          ) : (
            <LaField
              label="Current password"
              hint="Confirm it's you before the setup key is made."
              htmlFor={`${pwId}-pw`}
              error={fieldError ?? undefined}
              className="max-w-[400px]"
            >
              <PasswordInput
                id={`${pwId}-pw`}
                className={TOUCH_TEXT}
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  setFieldError(null)
                }}
                aria-invalid={!!fieldError}
                aria-describedby={fieldHintId(`${pwId}-pw`)}
              />
            </LaField>
          )}
        </GetAppBody>
      </EnrolWizard>,
    )
  }

  if (step === 1) {
    return panel(
      <EnrolWizard
        step={1}
        headingId={headingId}
        level={3}
        variant="panel"
        aside={cancel}
        title="Scan the QR code"
        intro="Open your authenticator app, add an account and scan this code with your phone's camera."
        error={alert}
        actions={
          <>
            <BackButton onClick={() => setStep(0)} />
            <Button type="button" size="lg" className={PRIMARY} onClick={() => setStep(2)} disabled={!secret} data-testid="enrol-continue">
              {continueLabel}
            </Button>
          </>
        }
      >
        {retry ?? (!secret && busy ? <Busy>Preparing a new setup key…</Busy> : <QrPanel secret={secret} />)}
      </EnrolWizard>,
    )
  }

  return panel(
    <EnrolWizard
      step={2}
      headingId={headingId}
      level={3}
      variant="panel"
      aside={cancel}
      title="Enter the 6-digit code"
      intro={
        replace
          ? 'Type the code your new app shows for Kuinn. Your old authenticator stops working once you confirm.'
          : 'Type the code your app now shows for Kuinn.'
      }
      error={alert}
      onSubmit={(e) => void onConfirm(e)}
      actions={
        <>
          <BackButton onClick={() => setStep(1)} disabled={busy} />
          <SubmitButton
            busy={busy}
            waiting={0}
            label={replace ? 'Use this authenticator' : 'Turn on login codes'}
            busyLabel="Checking…"
            disabled={!secret}
            className={PRIMARY}
          />
        </>
      }
    >
      {retry ?? (
        <div className="flex flex-col gap-4">
          <CodeField
            id={`${pwId}-code`}
            kind="totp"
            value={code}
            onChange={(v) => {
              setCode(v)
              setFieldError(null)
            }}
            error={fieldError}
            disabled={!secret}
            inputRef={codeRef}
            canAutoSubmit={!busy}
            busy={busy}
          />
          <QrAgain uri={secret?.otpauth_uri ?? null} />
        </div>
      )}
    </EnrolWizard>,
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
  useEffect(() => {
    if (codes) headingRef.current?.focus()
  }, [codes])
  return (
    <PanelSurface aria-labelledby={id} data-testid="new-codes">
      <h3 id={id} ref={headingRef} tabIndex={-1} className="text-h3 text-ink outline-none">
        New recovery codes
      </h3>
      {busy ? (
        <Busy>Making new codes…</Busy>
      ) : err ? (
        <>
          <FormAlert testId="new-codes-error" message={err.message} reference={err.ref} />
          <div className={FOOTER}>
            <Button type="button" variant="ghost" className="w-full sm:w-auto" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={run}>
              <RotateCw data-icon="inline-start" />
              Try again
            </Button>
          </div>
        </>
      ) : codes ? (
        <div className="flex flex-col gap-4">
          <p className="text-small text-ink-2">Your old codes stopped working.</p>
          <RecoveryCodes
            codes={codes}
            account={email}
            continueLabel="Done"
            continueClassName="w-full sm:w-auto sm:min-w-[200px] sm:self-end"
            onContinue={onClose}
          />
        </div>
      ) : null}
    </PanelSurface>
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
  const [setupStage, setSetupStage] = useState<SetupStage['kind'] | null>(null)
  const grace = day(security.mfa_grace_until)
  const graceFuture = isFuture(security.mfa_grace_until)
  const low = enrolled && security.recovery_codes_left <= LOW_CODES

  useEffect(() => {
    if (autoSetup) onSetupShown()
  }, [autoSetup, onSetupShown])

  const cardRef = useRef<HTMLDivElement>(null)
  // The button that opened the panel: it gets focus back when the panel closes (the focused
  // Cancel or Done unmounts). After a first setup it is gone, so Replace takes it.
  const opener = useRef<string | null>(null)
  const openPanel = (next: Exclude<Panel, null>, testId: string) => {
    opener.current = testId
    setPanel(next)
  }
  const refresh = () => void qc.invalidateQueries({ queryKey: keys.security() })
  const close = () => {
    setPanel(null)
    setSetupStage(null)
    refresh()
    const want = opener.current
    requestAnimationFrame(() => {
      const card = cardRef.current
      const el =
        (want ? card?.querySelector<HTMLElement>(`[data-testid="${want}"]`) : null) ??
        card?.querySelector<HTMLElement>('[data-testid="replace-authenticator"],[data-testid="setup-authenticator"]')
      el?.focus()
    })
  }
  const finishSetup = () => {
    // The session's refresh family now records the fresh code: rotate once so this tab's access
    // token carries it too (a sensitive action right after then needs no second code).
    void refreshOnce(getAccessToken()).catch(() => undefined)
    // A new authenticator forgets every trusted browser on the server: this one forgets its token.
    void forgetDeviceToken(email)
    void qc.invalidateQueries({ queryKey: keys.devices() })
    toast.success(panel === 'replace' ? 'Authenticator replaced' : 'Login codes are on')
    close()
  }

  // While new codes show, the status above is stale until Done: show the outcome, not the old state.
  const showingCodes = panel === 'codes' || setupStage === 'codes'
  const tone: TileTone = !on ? 'neutral' : enrolled || showingCodes ? 'ok' : 'warn'
  const opened = panel !== null
  // While the setup steps show, the card's description and the deadline banner only repeat
  // what the steps say: drop them so each step fits on one screen.
  const stepping = panel === 'setup' || panel === 'replace'

  return (
    <Card ref={cardRef} className="@container gap-0 py-0" data-testid="login-codes-card">
      <CardTop
        icon="shield"
        tone={tone}
        title="Login codes"
        status={
          showingCodes ? null : !on ? (
            <Badge variant="muted">Not switched on yet</Badge>
          ) : enrolled ? (
            <Badge variant="success" data-testid="mfa-status">
              On
            </Badge>
          ) : (
            <Badge variant="warning" data-testid="mfa-status">
              Not set up
            </Badge>
          )
        }
        action={
          on && !enrolled && !opened ? (
            <Button className="w-full @xl:w-auto" onClick={() => openPanel('setup', 'setup-authenticator')} data-testid="setup-authenticator">
              <Smartphone data-icon="inline-start" />
              Set up authenticator
            </Button>
          ) : null
        }
      >
        {stepping
          ? null
          : on
          ? 'Each sign-in asks for a 6-digit code from an authenticator app on your phone, after your password, except on a browser you chose to trust.'
          : 'Two-step sign-in with an authenticator app is coming to Kuinn. When it is switched on you can set it up here, or at your next sign-in.'}
      </CardTop>

      {on && !enrolled && !showingCodes && !stepping ? (
        <div className="px-5 pb-5 sm:px-6">
          <Banner
            tone="attention"
            role="status"
            title={opened ? undefined : graceFuture ? `Set up login codes by ${grace}` : 'Set up login codes'}
          >
            {graceFuture
              ? 'After that date you will be asked to set them up when you sign in.'
              : 'You will be asked to set them up at your next sign-in. Doing it now takes a minute.'}
          </Banner>
        </div>
      ) : null}
      {low && !showingCodes ? (
        <div className="px-5 pb-5 sm:px-6">
          <Banner tone="attention" role="status" title={`Only ${security.recovery_codes_left} recovery code${security.recovery_codes_left === 1 ? '' : 's'} left`}>
            Make new ones so you can still sign in if you lose your phone.
          </Banner>
        </div>
      ) : null}

      {on ? (
        <>
          {enrolled && !opened && !showingCodes ? (
            <Facts>
              <Fact label="Recovery codes left">
                <CodesMeter n={security.recovery_codes_left} />
              </Fact>
            </Facts>
          ) : null}
          {panel === null ? (
            enrolled ? (
              <div className="flex flex-col gap-2 border-t border-line px-5 py-4 sm:px-6 @xl:flex-row @xl:justify-end">
                <Button variant="secondary" className="w-full @xl:w-auto" onClick={() => openPanel('replace', 'replace-authenticator')} data-testid="replace-authenticator">
                  <RefreshCw data-icon="inline-start" />
                  Replace authenticator
                </Button>
                <Button
                  variant={low ? 'primary' : 'secondary'}
                  className="w-full @xl:w-auto"
                  onClick={() => setConfirmCodes(true)}
                  data-testid="new-recovery-codes"
                >
                  <KeyRound data-icon="inline-start" />
                  New recovery codes
                </Button>
              </div>
            ) : null
          ) : panel === 'codes' ? (
            <NewCodes email={email} onClose={close} />
          ) : (
            <TotpSetup key={panel} replace={panel === 'replace'} email={email} onClose={close} onDone={finishSetup} onStage={setSetupStage} />
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
                openPanel('codes', 'new-recovery-codes')
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
  const [open, setOpenState] = useState(false)
  const changeRef = useRef<HTMLButtonElement>(null)
  const setOpen = (next: boolean) => {
    setOpenState(next)
    // Closing unmounts the focused Cancel: give focus back to "Change password".
    if (!next) requestAnimationFrame(() => changeRef.current?.focus())
  }
  // With a refresh family in the token the backend keeps this session; without one (MFA off) it
  // revokes every family, this one too, so the copy and the outcome differ.
  const keepsSession = sessionHasFamily()
  const changed = day(security.password_changed_at)
  const expires = day(security.password_expires_at)
  return (
    <Card className="@container gap-0 py-0" data-testid="password-card">
      <CardTop
        icon="lock"
        tone="neutral"
        title="Password"
        action={
          open ? null : (
            <Button ref={changeRef} variant="secondary" className="w-full @xl:w-auto" onClick={() => setOpen(true)} data-testid="change-password">
              <KeyRound data-icon="inline-start" />
              Change password
            </Button>
          )
        }
      >
        {keepsSession
          ? 'You can change it once a day. Changing it signs you out on your other devices and forgets trusted browsers.'
          : 'You can change it once a day. Changing it signs you out everywhere, here too: sign in again with the new password.'}
      </CardTop>
      <Facts>
        <Fact label="Last changed">{changed ?? <span className="font-normal text-ink-3">Not recorded</span>}</Fact>
        {expires ? (
          <Fact label="Expires" valueClassName={within(security.password_expires_at, 14) ? 'text-attention-ink' : undefined}>
            {expires}
          </Fact>
        ) : null}
      </Facts>
      {open ? (
        <section className="border-t border-line bg-canvas/60 px-5 py-6 sm:px-6">
          <div className="max-w-[560px]">
            <PasswordForm
              email={email}
              displayName={displayName}
              requireCurrent
              autoFocus
              idPrefix="settings-pw"
              submitLabel="Change password"
              submitSize="md"
              testId="change-password-form"
              actions={
                <Button type="button" variant="ghost" className="w-full sm:w-auto" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
              }
              onSubmit={async ({ current_password, new_password }) => {
                await changePassword(current_password, new_password)
                // A password change forgets every trusted browser on the server: this one too.
                await forgetDeviceToken(email)
                if (!keepsSession) {
                  // This family is revoked server side: using its refresh token would look like
                  // token theft. End the session now; the login page explains why.
                  clearSession('password-changed', { broadcast: true })
                  return
                }
                toast.success('Password changed', { description: 'Your other devices were signed out and trusted browsers forgotten.' })
                setOpen(false)
                void qc.invalidateQueries({ queryKey: keys.security() })
                void qc.invalidateQueries({ queryKey: keys.devices() })
              }}
            />
          </div>
        </section>
      ) : null}
    </Card>
  )
}

function GoogleCard({ security, email }: { security: SecurityOut; email: string }) {
  const qc = useQueryClient()
  const keys = useKeys()
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<{ message: string; ref: string | null } | null>(null)
  const onlyWayIn = security.has_password === false
  const remove = async () => {
    setBusy(true)
    setError(null)
    try {
      await unlinkGoogle()
      setConfirm(false)
      toast.success('Google removed', { description: 'Sign in with your email and password from now on.' })
      void qc.invalidateQueries({ queryKey: keys.security() })
    } catch (e) {
      setConfirm(false)
      setError({ message: mfaErrorMessage(e), ref: isApiError(e) ? e.correlationId : null })
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card className="@container gap-0 py-0" data-testid="google-card">
      <CardTop
        icon="link"
        tone="neutral"
        title="Google"
        status={<Badge variant="success">Linked</Badge>}
        action={
          onlyWayIn ? null : (
            <Button variant="secondary" className="w-full @xl:w-auto" onClick={() => setConfirm(true)} disabled={busy} data-testid="google-unlink">
              Remove
            </Button>
          )
        }
      >
        {onlyWayIn
          ? 'You sign in with Continue with Google, then your login code. It is this account’s only way in, so it can’t be removed.'
          : 'Continue with Google signs you in to this account, and you still enter your login code.'}
      </CardTop>
      <Facts>
        <Fact label="Google account" valueClassName="truncate">
          {email}
        </Fact>
      </Facts>
      {error ? (
        <div className="border-t border-line px-5 py-4 sm:px-6">
          <FormAlert message={error.message} reference={error.ref} testId="google-unlink-error" />
        </div>
      ) : null}
      <AlertDialog open={confirm} onOpenChange={(o) => (busy ? null : setConfirm(o))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Google from this account?</AlertDialogTitle>
            <AlertDialogDescription>
              Continue with Google will stop signing you in. You can still sign in with your email and password, and link Google
              again later by using Continue with Google.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={busy}
              onClick={(e) => {
                e.preventDefault()
                void remove()
              }}
              data-testid="google-unlink-confirm"
            >
              {busy ? 'Removing…' : 'Remove Google'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

// ---------------------------------------------------------------------------------------------

/** "Chrome on iOS" → a phone glyph; anything else is a computer. The label is the API's summary. */
const deviceGlyph = (label: string): IconSource => (/\b(iOS|iPadOS|Android)\b/i.test(label) ? Smartphone : Monitor)

/** "3 Oct 2026"; "2 hours ago" for the last use (recent is what matters there). */
function ago(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : formatDistanceToNowStrict(d, { addSuffix: true })
}

type DeviceConfirm = { kind: 'remove'; device: TrustedDevice } | { kind: 'all' } | null

/**
 * Trusted browsers (contract 2.1.0, ADR-0023): the browsers where this user ticked "Trust this
 * browser" at sign-in, each with Remove, and "Sign out all devices". Removing a browser ends the
 * sessions it signed in (this one too, if it is `current`, so this tab signs out). Signing out all
 * devices forgets every trusted browser, this one too, and ends every other session; this one stays.
 * Shown only while login codes are on and set up: there is nothing to trust otherwise. An API older
 * than 2.1.0 has no such route (404/405), and the card stays hidden.
 */
function TrustedBrowsersCard({ email, isAdmin }: { email: string; isAdmin: boolean }) {
  const qc = useQueryClient()
  const keys = useKeys()
  const devices = useQuery(devicesQueryOptions(keys.devices()))
  const [confirm, setConfirm] = useState<DeviceConfirm>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Problem>(null)
  const allRef = useRef<HTMLButtonElement>(null)
  const days = isAdmin ? TRUST_DAYS.admin : TRUST_DAYS.brand

  if (devices.error && isApiError(devices.error) && [404, 405, 501].includes(devices.error.status)) return null

  const list = devices.data?.devices ?? []
  const refresh = () => void qc.invalidateQueries({ queryKey: keys.devices() })

  const run = async () => {
    if (!confirm) return
    setBusy(true)
    setError(null)
    try {
      if (confirm.kind === 'all') {
        await signOutAllDevices()
        await forgetDeviceToken(email)
        toast.success('Signed out everywhere else', { description: 'Every trusted browser is forgotten. Your next sign-in asks for a code.' })
        setConfirm(null)
        refresh()
        requestAnimationFrame(() => allRef.current?.focus())
        return
      }
      const { device } = confirm
      try {
        await removeDevice(device.id)
      } catch (e) {
        // Already gone (removed in another tab, or expired): the list was stale, nothing to undo.
        if (!(isApiError(e) && e.status === 404)) throw e
      }
      setConfirm(null)
      if (device.current) {
        // The API ended this session with the browser: leave now rather than at the next refresh.
        await forgetDeviceToken(email)
        toast.success('This browser was removed', { description: 'Sign in again. You will be asked for a code.' })
        clearSession('logout', { broadcast: true })
        return
      }
      toast.success(`${device.label} removed`, { description: 'Its sessions ended. The next sign-in there asks for a code.' })
      refresh()
      requestAnimationFrame(() => allRef.current?.focus())
    } catch (e) {
      setConfirm(null)
      setError(problem(e))
    } finally {
      setBusy(false)
    }
  }

  const removing = confirm?.kind === 'remove' ? confirm.device : null
  return (
    <Card className="@container gap-0 py-0" data-testid="trusted-browsers-card">
      <CardTop
        icon={MonitorSmartphone}
        tone="neutral"
        title="Trusted browsers"
        status={
          devices.data ? (
            <Badge variant="muted" data-testid="trusted-count">
              {list.length} of {TRUST_MAX}
            </Badge>
          ) : null
        }
      >
        {`A browser you trust at sign-in skips the login code there for ${days} days. Sensitive changes still ask for a code. Remove any browser you don’t recognise.`}
      </CardTop>

      {devices.isPending ? (
        <div className="flex flex-col gap-3 border-t border-line px-5 py-4 sm:px-6" aria-busy="true" aria-label="Loading trusted browsers">
          {[0, 1].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="size-9 rounded-tile" />
              <div className="flex flex-1 flex-col gap-1.5">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-64 max-w-full" />
              </div>
            </div>
          ))}
        </div>
      ) : devices.error ? (
        <div className="flex flex-col gap-3 border-t border-line px-5 py-4 sm:px-6 @xl:flex-row @xl:items-center">
          <div className="min-w-0 flex-1">
            <FormAlert message={problem(devices.error)!.message} reference={problem(devices.error)!.ref} testId="trusted-load-error" />
          </div>
          <Button variant="secondary" className="w-full @xl:w-auto" onClick={() => void devices.refetch()}>
            <RotateCw data-icon="inline-start" />
            Try again
          </Button>
        </div>
      ) : list.length === 0 ? (
        <p className="border-t border-line px-5 py-4 text-small text-ink-2 sm:px-6" data-testid="trusted-empty">
          No trusted browsers. Tick “Trust this browser” on the code step when you sign in on a computer you own.
        </p>
      ) : (
        <ul className="border-t border-line" aria-label="Trusted browsers">
          {list.map((d) => (
            <li
              key={d.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-5 py-3.5 last:border-b-0 sm:px-6"
              data-testid="trusted-device"
            >
              <IconTile icon={deviceGlyph(d.label)} tone={d.current ? 'brand' : 'neutral'} size="md" />
              <div className="min-w-0 flex-1 basis-40">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body font-semibold text-ink">
                  <span className="[overflow-wrap:anywhere]">{d.label}</span>
                  {d.current ? (
                    <Badge variant="brand" data-testid="this-browser">
                      This browser
                    </Badge>
                  ) : null}
                </p>
                {/* Each fact keeps one line; a narrow row wraps between facts, never inside one. */}
                <p className="mt-0.5 flex flex-wrap gap-x-1.5 text-caption text-ink-3 tabular-nums">
                  <span className="whitespace-nowrap">Added {day(d.created_at) ?? '—'}</span>
                  <span aria-hidden>·</span>
                  <span className="whitespace-nowrap">{d.last_used_at ? `Last used ${ago(d.last_used_at)}` : 'Not used since'}</span>
                  <span aria-hidden>·</span>
                  <span className={cn('whitespace-nowrap', within(d.expires_at, 2) && 'text-attention-ink')}>
                    Trusted until {day(d.expires_at) ?? '—'}
                  </span>
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto min-h-9 shrink-0 text-danger-ink hover:text-danger-ink"
                onClick={() => setConfirm({ kind: 'remove', device: d })}
                disabled={busy}
                aria-label={`Remove ${d.label}${d.current ? ' (this browser)' : ''}`}
                data-testid="trusted-remove"
              >
                <Trash2 data-icon="inline-start" />
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}

      {error ? (
        <div className="border-t border-line px-5 py-4 sm:px-6">
          <FormAlert message={error.message} reference={error.ref} testId="trusted-error" />
        </div>
      ) : null}

      <div className="flex flex-col gap-3 border-t border-line px-5 py-4 sm:px-6 @xl:flex-row @xl:items-center @xl:justify-between">
        <p className="text-caption text-ink-3">Lost a device or used a shared computer? Sign out everywhere else in one step.</p>
        <Button
          ref={allRef}
          variant="secondary"
          className="w-full @xl:w-auto @xl:shrink-0"
          onClick={() => setConfirm({ kind: 'all' })}
          disabled={busy}
          data-testid="sign-out-all"
        >
          <LogOut data-icon="inline-start" />
          Sign out all devices
        </Button>
      </div>

      <AlertDialog open={confirm !== null} onOpenChange={(o) => (busy || o ? null : setConfirm(null))}>
        <AlertDialogContent data-testid="trusted-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.kind === 'all' ? 'Sign out all devices?' : removing?.current ? 'Remove this browser?' : `Remove ${removing?.label ?? 'this browser'}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === 'all'
                ? 'Every other session ends now, and every trusted browser is forgotten, this one too. You stay signed in here. Your next sign-in on any browser asks for a code.'
                : removing?.current
                  ? 'You will be signed out here, and your next sign-in on this browser asks for a code.'
                  : 'Anyone signed in on it is signed out now, and the next sign-in there asks for a code.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={busy}
              onClick={(e) => {
                e.preventDefault()
                void run()
              }}
              data-testid="trusted-confirm-action"
            >
              {busy ? (confirm?.kind === 'all' ? 'Signing out…' : 'Removing…') : confirm?.kind === 'all' ? 'Sign out all' : removing?.current ? 'Remove and sign out' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
      <div className="flex flex-col gap-5" aria-busy="true" aria-label="Loading security settings">
        {[0, 1].map((i) => (
          <Card key={i} className="gap-0 py-0">
            <div className="flex flex-col gap-4 p-5 sm:flex-row sm:p-6">
              <Skeleton className="size-11 rounded-xl" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-72 max-w-full" />
              </div>
            </div>
            <div className="hidden border-t border-line sm:grid sm:grid-cols-2">
              <Skeleton className="m-4 h-12 sm:mx-6" />
              <Skeleton className="m-4 h-12 sm:mx-6" />
            </div>
          </Card>
        ))}
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-5">
      <LoginCodesCard security={security.data} email={me.data.email} autoSetup={setup} onSetupShown={onSetupShown} />
      {/* A Google-only account has no password to change (`has_password` false; absent on older APIs). */}
      {security.data.has_password === false ? null : (
        <PasswordCard security={security.data} email={me.data.email} displayName={me.data.display_name} />
      )}
      {security.data.google_linked === true ? <GoogleCard security={security.data} email={me.data.email} /> : null}
      {security.data.enforcement === 'all' && security.data.mfa_enrolled ? (
        <TrustedBrowsersCard email={me.data.email} isAdmin={me.data.is_platform_admin === true} />
      ) : null}
      <LaCard emphasis="tint" pad="md" className="flex items-start gap-3">
        <IconTile icon="info" size="md" />
        <p className="text-small text-ink-2">
          <span className="font-semibold text-ink">Lost your phone and your recovery codes?</span> Ask your brand owner to contact
          Kuinn support. We check who you are before we reset login codes.
        </p>
      </LaCard>
    </div>
  )
}
