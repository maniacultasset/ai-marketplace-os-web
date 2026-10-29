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
import { KeyRound, RefreshCw, RotateCw, Smartphone } from 'lucide-react'
import { Children, useEffect, useId, useRef, useState, type ComponentProps, type FormEvent, type ReactNode } from 'react'
import { isApiError } from '@/api/errors'
import { clearSession, getAccessToken, refreshOnce, sessionHasFamily } from '@/api/session'
import type { SecurityOut, TotpEnrollOut } from '@/api/types'
import { Banner } from '@/components/la/banner'
import { LaCard } from '@/components/la/cards'
import { fieldHintId, LaField } from '@/components/la/field'
import { IconTile, type IconSource, type TileTone } from '@/components/la/icons'
import { Stepper } from '@/components/la/progress'
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
import { FormAlert } from '@/features/public/auth-frame'
import { PasswordInput } from '@/features/signup-admin/password-input'
import { useMe } from '@/lib/auth'
import { useKeys } from '@/lib/query-keys'
import { cn } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { changePassword, mfaErrorMessage, regenerateRecoveryCodes, securityQueryOptions, totpConfirm, totpEnroll } from './api'
import { CodeField, QrPanel, RecoveryCodes, SubmitButton, TOUCH_TEXT } from './components'
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
  children: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start gap-4 p-5 sm:p-6 @xl:flex-nowrap">
      <IconTile icon={icon} tone={tone} size="lg" />
      <div className="min-w-0 flex-1 basis-48">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-h3 text-ink">{title}</h2>
          {status}
        </div>
        <p className="mt-1 max-w-[68ch] text-small text-ink-2">{children}</p>
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

const SETUP_STEPS: readonly { label: string; stage: SetupStage['kind'] }[] = [
  { label: 'Confirm password', stage: 'password' },
  { label: 'Connect app', stage: 'scan' },
  { label: 'Save codes', stage: 'codes' },
]

/**
 * Set up (`replace` false: the current password first) or replace the authenticator, confirm with
 * a code, then show the new recovery codes once.
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
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [err, setErr] = useState<Problem>(null)
  const [busy, setBusy] = useState(false)
  const started = useRef(false)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const codeRef = useRef<HTMLInputElement>(null)
  const pwId = useId()

  // Each new stage moves focus to the panel heading, so the change is announced.
  useEffect(() => {
    if (stage) headingRef.current?.focus()
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

  const steps = replace ? SETUP_STEPS.slice(1) : SETUP_STEPS
  const at = stage === null ? 'scan' : stage.kind
  const current = Math.max(0, steps.findIndex((st) => st.stage === at))

  return (
    <PanelSurface aria-labelledby={`${pwId}-title`} data-testid="totp-setup">
      <div>
        <Stepper steps={steps} current={current} />
        <h3 id={`${pwId}-title`} ref={headingRef} tabIndex={-1} className="mt-4 text-h3 text-ink outline-none">
          {title}
        </h3>
      </div>
      {err ? <FormAlert testId="totp-setup-error" message={err.message} reference={err.ref} /> : null}

      {stage === null ? (
        busy ? (
          <Busy>Preparing a new setup key…</Busy>
        ) : (
          <div className={FOOTER}>
            <Button type="button" variant="ghost" className="w-full sm:w-auto" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={() => void enroll()}>
              <RotateCw data-icon="inline-start" />
              Try again
            </Button>
          </div>
        )
      ) : stage.kind === 'password' ? (
        <form onSubmit={onPassword} noValidate className="flex flex-col gap-4">
          <p className="text-small text-ink-2">Confirm it's you with your current password.</p>
          <LaField label="Current password" htmlFor={`${pwId}-pw`} error={fieldError ?? undefined} className="max-w-[400px]">
            <PasswordInput
              id={`${pwId}-pw`}
              className={TOUCH_TEXT}
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
          <div className={FOOTER}>
            <Button type="button" variant="ghost" className="w-full sm:w-auto" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <SubmitButton busy={busy} waiting={0} label="Continue" busyLabel="Continue" size="md" className="w-full sm:w-auto" />
          </div>
        </form>
      ) : stage.kind === 'scan' ? (
        <div className="flex flex-col gap-5">
          <p className="max-w-[60ch] text-small text-ink-2">
            Scan the QR code with an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password), or type the
            setup key. Then enter the 6-digit code it shows.
          </p>
          <QrPanel secret={stage.secret} />
          {replace ? (
            <Banner tone="info" icon="info">
              Your old authenticator keeps working until you confirm the new one.
            </Banner>
          ) : null}
          <form onSubmit={(e) => void onConfirm(e)} noValidate className="flex flex-col gap-4">
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
              canAutoSubmit={!busy}
              busy={busy}
            />
            <div className={FOOTER}>
              <Button type="button" variant="ghost" className="w-full sm:w-auto" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
              <SubmitButton
                busy={busy}
                waiting={0}
                label={replace ? 'Use this authenticator' : 'Turn on login codes'}
                busyLabel="Checking…"
                size="md"
                className="w-full sm:w-auto"
              />
            </div>
          </form>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1 text-small text-ink-2">
            <p>Login codes are on. Your other devices were signed out.</p>
            <p>If you lose your phone, sign in with one of these codes.</p>
          </div>
          <RecoveryCodes
            codes={stage.codes}
            account={email}
            continueLabel="Done"
            continueClassName="w-full sm:w-auto sm:min-w-[200px] sm:self-end"
            onContinue={onDone}
          />
        </div>
      )}
    </PanelSurface>
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
    toast.success(panel === 'replace' ? 'Authenticator replaced' : 'Login codes are on')
    close()
  }

  // While new codes show, the status above is stale until Done: show the outcome, not the old state.
  const showingCodes = panel === 'codes' || setupStage === 'codes'
  const tone: TileTone = !on ? 'neutral' : enrolled || showingCodes ? 'ok' : 'warn'
  const opened = panel !== null

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
        {on
          ? 'Each sign-in asks for a 6-digit code from an authenticator app on your phone, after your password.'
          : 'Two-step sign-in with an authenticator app is coming to Kuinn. When it is switched on you can set it up here, or at your next sign-in.'}
      </CardTop>

      {on && !enrolled && !showingCodes ? (
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
          ? 'You can change it once a day. Changing it signs you out on your other devices.'
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
                if (!keepsSession) {
                  // This family is revoked server side: using its refresh token would look like
                  // token theft. End the session now; the login page explains why.
                  clearSession('password-changed', { broadcast: true })
                  return
                }
                toast.success('Password changed', { description: 'Your other devices were signed out.' })
                setOpen(false)
                void qc.invalidateQueries({ queryKey: keys.security() })
              }}
            />
          </div>
        </section>
      ) : null}
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
      <PasswordCard security={security.data} email={me.data.email} displayName={me.data.display_name} />
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
