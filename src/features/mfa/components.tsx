/**
 * Building blocks for the login-code screens: the code field (six slots over one real input), the
 * QR panel, the setup key, the recovery codes panel and the live password checklist. Nothing here
 * logs or stores a secret.
 */
import { Check, Copy, Download, ExternalLink, Info } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ClipboardEvent, type ReactNode, type Ref } from 'react'
import { Banner } from '@/components/la/banner'
import { fieldHintId, LaField } from '@/components/la/field'
import { Icon } from '@/components/la/icons'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import { groupSecret, totpInput } from './login-flow'
import { checkPassword, RULE_LABELS, RULE_ORDER, SERVER_RULES } from './password-rules'

export type FactorKind = 'totp' | 'recovery'

/** 16px text in a text field on a touch screen, so iOS does not zoom the page when it is tapped. */
export const TOUCH_TEXT = 'pointer-coarse:text-[16px]'

const reducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Assign one element to a local ref and a caller's ref. */
function setRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (!ref) return
  if (typeof ref === 'function') ref(value)
  else (ref as { current: T | null }).current = value
}

/** Input types that mean the whole code arrived at once (paste, autofill, drop), not typing. */
const WHOLE_CODE = new Set(['insertFromPaste', 'insertReplacementText', 'insertFromDrop'])

/**
 * A 6-digit TOTP field (numeric keyboard, one-time-code autofill) shown as six slots, or a recovery
 * code field. The value is filtered as typed: digits only for a TOTP code.
 */
export function CodeField({
  id,
  kind,
  value,
  onChange,
  error,
  label,
  hint,
  describedBy,
  autoFocus,
  disabled,
  inputRef,
  centered,
  canAutoSubmit,
  busy,
}: {
  id: string
  kind: FactorKind
  value: string
  onChange: (value: string) => void
  error?: string | null
  label?: ReactNode
  hint?: ReactNode
  /** Extra ids for aria-describedby (e.g. the step's intro). */
  describedBy?: string
  autoFocus?: boolean
  disabled?: boolean
  inputRef?: Ref<HTMLInputElement>
  /** Centre the slots: always, or on a phone only. */
  centered?: boolean | 'phone'
  /** A pasted or autofilled full code submits the form once (TOTP only). */
  canAutoSubmit?: boolean
  /** A check is running: marks the slots busy. */
  busy?: boolean
}) {
  const totp = kind === 'totp'
  const describe = [fieldHintId(id), describedBy].filter(Boolean).join(' ')
  return (
    <LaField
      label={label ?? (totp ? '6-digit code' : 'Recovery code')}
      htmlFor={id}
      hint={hint ?? (totp ? 'From your authenticator app. It changes every 30 seconds.' : "One of the 10 codes you saved. Dashes and capitals don't matter.")}
      error={error ?? undefined}
    >
      {totp ? (
        <OtpSlots
          id={id}
          value={value}
          onChange={onChange}
          error={!!error}
          describedBy={describe}
          autoFocus={autoFocus}
          disabled={disabled}
          inputRef={inputRef}
          centered={centered}
          canAutoSubmit={!!canAutoSubmit}
          busy={busy}
        />
      ) : (
        <Input
          ref={inputRef}
          id={id}
          name="recovery-code"
          type="text"
          inputMode="text"
          autoComplete="off"
          maxLength={64}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoFocus={autoFocus}
          disabled={disabled}
          value={value}
          placeholder="abcd-efgh-…"
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={!!error}
          aria-describedby={describe}
          className="h-11 font-mono text-[16px] tracking-[0.02em]"
          data-testid="recovery-input"
        />
      )}
    </LaField>
  )
}

const SLOT =
  'flex h-14 min-w-0 flex-1 items-center justify-center rounded-[10px] border inset-field text-[28px] leading-none font-semibold tracking-[-0.01em] tabular-nums text-ink sm:h-16 sm:max-w-14 tactile'

/**
 * Six slots drawn over one real, transparent input: the input keeps every native behaviour (the
 * numeric keyboard, one-time-code autofill, paste, screen readers); the slots only show its value.
 * The caret is held at the end, so Backspace always takes the last digit and no gap can open.
 */
function OtpSlots({
  id,
  value,
  onChange,
  error,
  describedBy,
  autoFocus,
  disabled,
  inputRef,
  centered,
  canAutoSubmit,
  busy,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  error: boolean
  describedBy: string
  autoFocus?: boolean
  disabled?: boolean
  inputRef?: Ref<HTMLInputElement>
  centered?: boolean | 'phone'
  canAutoSubmit: boolean
  busy?: boolean
}) {
  const rowRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLInputElement | null>(null)
  const [focused, setFocused] = useState(false)
  // The value a paste or autofill completed (submit after it renders), and the last value
  // submitted that way (never twice in a row).
  const pendingAuto = useRef<string | null>(null)
  const lastAuto = useRef<string | null>(null)

  const toEnd = () => {
    const el = innerRef.current
    if (!el) return
    const n = el.value.length
    if (el.selectionStart !== n || el.selectionEnd !== n) el.setSelectionRange(n, n)
  }

  const accept = (next: string, whole: boolean) => {
    if (next !== lastAuto.current) lastAuto.current = null
    if (whole && next.length === 6 && !disabled && canAutoSubmit && lastAuto.current !== next) pendingAuto.current = next
    onChange(next)
  }

  // Submit through the form's own handler once the completed value has rendered, so validation,
  // attempt counting and clearing all run as for a click on the button.
  useEffect(() => {
    // Any new value (a clear after a rejection too) allows the next auto-submit.
    if (value !== lastAuto.current) lastAuto.current = null
    if (pendingAuto.current === null) return
    const want = pendingAuto.current
    pendingAuto.current = null
    if (value !== want) return
    lastAuto.current = want
    innerRef.current?.form?.requestSubmit()
  }, [value])

  // One shake per new error (the submit clears the error before each attempt).
  const hadError = useRef(error)
  useEffect(() => {
    const was = hadError.current
    hadError.current = error
    const el = rowRef.current
    if (!error || was || !el || typeof el.animate !== 'function' || reducedMotion()) return
    el.animate(
      [
        { transform: 'translateX(0)' },
        { transform: 'translateX(-6px)' },
        { transform: 'translateX(5px)' },
        { transform: 'translateX(-3px)' },
        { transform: 'translateX(2px)' },
        { transform: 'translateX(0)' },
      ],
      { duration: 360, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
    )
  }, [error])

  // A paste is read here so a spaced code ("123 456") is never cut short by maxLength. Only a paste
  // that holds exactly six digits submits: a longer number (a phone number, an order ID) only fills
  // the slots, so it never spends one of the challenge's attempts.
  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData?.getData('text') ?? ''
    if (!text) return
    e.preventDefault()
    const digits = totpInput(text)
    const exact = text.replace(/\D/g, '').length === 6
    accept(exact ? digits : totpInput(value + text), exact)
  }

  const active = focused && !disabled ? Math.min(value.length, 5) : -1
  const slot = (i: number) => {
    const digit = value[i] ?? ''
    const on = i === active
    return (
      <span
        key={i}
        data-slot="otp-slot"
        data-active={on || undefined}
        data-filled={digit ? true : undefined}
        className={cn(
          SLOT,
          // Forced colours drop box-shadows: an outline keeps the active slot visible.
          on && 'forced-colors:outline-2 forced-colors:outline-offset-2 forced-colors:outline-[Highlight] forced-colors:outline-solid',
          disabled
            ? 'border-dashed border-line-strong bg-subtle text-ink-3 shadow-none'
            : error
              ? cn('border-danger bg-field-invalid', on && 'shadow-[var(--focus-ring-danger),var(--shadow-inset-sm)]')
              : on
                ? cn('border-brand shadow-[var(--focus-ring),var(--shadow-inset-sm)]', digit && 'bg-surface')
                : digit && 'border-line-strong bg-surface shadow-raised-sm',
        )}
      >
        {digit || (on ? <span className="otp-caret h-7 w-0.5 rounded-full bg-brand" /> : null)}
      </span>
    )
  }

  return (
    <div
      ref={rowRef}
      className={cn('relative w-full max-w-[392px]', centered === true && 'mx-auto', centered === 'phone' && 'max-sm:mx-auto')}
      aria-busy={busy || undefined}
      onPointerDown={(e) => {
        const el = innerRef.current
        if (!el || disabled) return
        if (document.activeElement === el) {
          e.preventDefault()
          toEnd()
        }
      }}
    >
      <div aria-hidden className="flex w-full items-center gap-2">
        {slot(0)}
        {slot(1)}
        {slot(2)}
        <span className="h-0.5 w-2 shrink-0 rounded-full bg-line-strong sm:w-3" />
        {slot(3)}
        {slot(4)}
        {slot(5)}
      </div>
      <input
        ref={(el) => {
          innerRef.current = el
          setRef(inputRef, el)
        }}
        id={id}
        name="one-time-code"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={6}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        autoFocus={autoFocus}
        disabled={disabled}
        value={value}
        onChange={(e) => accept(totpInput(e.target.value), WHOLE_CODE.has((e.nativeEvent as InputEvent).inputType))}
        onPaste={onPaste}
        onFocus={() => {
          setFocused(true)
          requestAnimationFrame(toEnd)
        }}
        onBlur={() => setFocused(false)}
        onClick={toEnd}
        onSelect={toEnd}
        aria-invalid={error}
        aria-describedby={describedBy}
        className={cn(
          'absolute inset-0 h-full w-full cursor-text border-0 bg-transparent p-0 text-[16px] text-transparent caret-transparent outline-none selection:bg-transparent [-webkit-text-fill-color:transparent]',
          disabled && 'cursor-not-allowed',
        )}
        data-testid="totp-input"
      />
    </div>
  )
}

/**
 * The otpauth URI as a QR code, drawn in the browser (the `qrcode` package, loaded on demand) into
 * an SVG data: URL. The URI never leaves the page.
 */
export function QrCode({ uri, size = 184, className }: { uri: string; size?: number; className?: string }) {
  // Keyed by the URI it was drawn from, so a new URI never shows the old image.
  const [drawn, setDrawn] = useState<{ uri: string; src: string | null; failed: boolean } | null>(null)
  useEffect(() => {
    let live = true
    import('qrcode')
      .then((QR) => QR.toString(uri, { type: 'svg', errorCorrectionLevel: 'M', margin: 2 }))
      .then((svg) => {
        if (live) setDrawn({ uri, src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, failed: false })
      })
      .catch(() => {
        if (live) setDrawn({ uri, src: null, failed: true })
      })
    return () => {
      live = false
    }
  }, [uri])
  const current = drawn?.uri === uri ? drawn : null
  const src = current?.src ?? null
  const failed = current?.failed ?? false
  const box = { width: size, height: size }
  if (failed) {
    return (
      <div style={box} className={cn('flex items-center justify-center rounded-[10px] border border-line bg-surface p-3 text-center text-caption text-ink-2', className)}>
        The QR code could not be drawn. Use the setup key instead.
      </div>
    )
  }
  if (!src) return <Skeleton style={box} className={cn('rounded-[10px]', className)} aria-label="Drawing the QR code" />
  return (
    <img
      src={src}
      width={size}
      height={size}
      alt="QR code to scan with your authenticator app. If you can't scan it, type the setup key instead."
      className={cn('rounded-[10px] border border-line bg-white', className)}
      data-testid="mfa-qr"
    />
  )
}

const QR_SIZE = 160

/**
 * The QR code and the setup key in one panel. Side by side only when the panel itself is wide
 * enough (a container query), so a narrow settings panel stacks them like a phone does. Pass no
 * secret while it loads.
 */
export function QrPanel({ secret }: { secret: { otpauth_uri: string; secret_b32: string } | null }) {
  return (
    <div className="@container rounded-2xl border border-line bg-canvas p-4 @md:p-5">
      {secret ? (
        <div className="mb-4 flex flex-col gap-2 sm:hidden @md:hidden">
          <Button variant="secondary" size="lg" className="w-full" asChild>
            <a href={secret.otpauth_uri}>
              <ExternalLink data-icon="inline-start" />
              Open in authenticator app
            </a>
          </Button>
          <p className="text-center text-caption text-ink-3">Or scan the code below from another device.</p>
        </div>
      ) : null}
      <div className="grid gap-5 @md:grid-cols-[auto_minmax(0,1fr)] @md:items-center">
        <div className="mx-auto rounded-xl border border-line bg-white p-2 shadow-raised-sm @md:mx-0">
          {secret ? (
            <QrCode uri={secret.otpauth_uri} size={QR_SIZE} className="rounded-[6px] border-0" />
          ) : (
            <Skeleton style={{ width: QR_SIZE, height: QR_SIZE }} className="rounded-[6px]" />
          )}
        </div>
        {secret ? (
          <SetupKey secret={secret.secret_b32} />
        ) : (
          <div className="flex min-w-0 flex-col gap-2" aria-busy="true" aria-label="Preparing your setup key">
            <Skeleton className="h-4 w-48 max-w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-3/4" />
          </div>
        )}
      </div>
    </div>
  )
}

function useCopied() {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(t)
  }, [copied])
  const copy = (text: string) =>
    void navigator.clipboard
      ?.writeText(text)
      .then(() => setCopied(true))
      .catch(() => undefined)
  return { copied, copy }
}

/** The base32 secret in groups of four (four groups a line, never a broken group), with a copy button. */
export function SetupKey({ secret }: { secret: string }) {
  const { copied, copy } = useCopied()
  const labelId = useId()
  const groups = groupSecret(secret).split(' ')
  return (
    <div className="min-w-0">
      <p id={labelId} className="mb-2 text-small font-semibold text-ink">
        Can't scan? Type this setup key
      </p>
      <div className="flex w-full items-stretch gap-2">
        <code
          aria-labelledby={labelId}
          className="grid min-w-0 flex-1 grid-cols-4 gap-x-3 gap-y-1 rounded-[10px] border border-line bg-surface px-3.5 py-2.5 font-mono text-[15px] leading-6 tracking-[0.04em] text-ink shadow-inset-sm"
          data-testid="mfa-secret"
        >
          {groups.map((g, i) => (
            <span key={i} className="contents">
              {i > 0 ? ' ' : null}
              <span>{g}</span>
            </span>
          ))}
        </code>
        <Button
          type="button"
          variant="secondary"
          size="icon-lg"
          className="self-start"
          onClick={() => copy(secret.replace(/\s+/g, ''))}
          aria-label={copied ? 'Setup key copied' : 'Copy setup key'}
        >
          {copied ? <Check className="text-success" /> : <Copy />}
        </Button>
      </div>
      <p className="mt-2 text-caption text-ink-3">Pick “time-based” if your app asks.</p>
      <span className="sr-only" aria-live="polite">
        {copied ? 'Setup key copied' : ''}
      </span>
    </div>
  )
}

const CODES_FILE = 'kuinn-recovery-codes.txt'

function downloadCodes(codes: string[], account?: string) {
  const text = [
    'Kuinn recovery codes',
    account ? `Account: ${account}` : null,
    'Each code works once. Keep them somewhere safe.',
    '',
    ...codes,
    '',
  ]
    .filter((l): l is string => l !== null)
    .join('\n')
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = CODES_FILE
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/**
 * The 10 recovery codes, shown once: copy, download, and an "I saved them" check that gates the
 * continue button. The list numbers come from a CSS counter, so each item's text is the code alone.
 */
export function RecoveryCodes({
  codes,
  account,
  continueLabel = 'Continue',
  continueClassName = 'w-full',
  onContinue,
  busy,
}: {
  codes: string[]
  account?: string
  continueLabel?: string
  continueClassName?: string
  onContinue: () => void
  busy?: boolean
}) {
  const [saved, setSaved] = useState(false)
  const { copied, copy } = useCopied()
  // Leaving the page now would lose codes that are never shown again: ask the browser to warn.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [])
  const checkId = useId()
  // Two columns only when short codes fit side by side in a wide enough panel (a container query).
  // A long code in a narrow panel wraps after a dash, never inside a group.
  const twoColumns = codes.every((c) => c.length <= 20)
  return (
    <div className="@container flex flex-col gap-4" data-testid="recovery-codes">
      <Banner tone="attention" icon="alert" title="You'll only see these codes once">
        Each code works once. Keep them somewhere safe, like a password manager.
      </Banner>
      <ol
        aria-label="Recovery codes"
        className={cn(
          'grid gap-x-6 rounded-2xl border border-line bg-surface px-4 py-1 shadow-inset-sm [counter-reset:rc]',
          twoColumns && codes.length === 10 && '@sm:grid-flow-col @sm:grid-cols-2 @sm:grid-rows-5 @sm:[&>li:nth-child(5)]:border-b-0',
        )}
      >
        {codes.map((c) => (
          <li
            key={c}
            className="flex items-baseline gap-3 border-b border-line/70 py-1.5 font-mono text-[14px] leading-6 text-ink [counter-increment:rc] last:border-b-0 before:w-5 before:shrink-0 before:text-right before:font-sans before:text-caption before:text-ink-3 before:tabular-nums before:content-[counter(rc)]"
          >
            <span className="min-w-0 tracking-[0.02em]">
              {/* A line break may fall only after a dash (no character added to a copy). */}
              {c.split('-').map((g, i, all) => (
                <span key={i}>
                  {g}
                  {i < all.length - 1 ? (
                    <>
                      -<wbr />
                    </>
                  ) : null}
                </span>
              ))}
            </span>
          </li>
        ))}
      </ol>
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="secondary" size="lg" className="min-w-0" onClick={() => copy(codes.join('\n'))}>
          {copied ? <Check className="text-success" data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
          {copied ? 'Copied' : 'Copy codes'}
        </Button>
        <Button type="button" variant="secondary" size="lg" className="min-w-0" onClick={() => downloadCodes(codes, account)}>
          <Download data-icon="inline-start" />
          Download .txt
        </Button>
        <span className="sr-only" aria-live="polite">
          {copied ? 'Recovery codes copied' : ''}
        </span>
      </div>
      <label
        htmlFor={checkId}
        className="tactile flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-line bg-canvas px-4 py-3 has-[[data-state=checked]]:border-success-line has-[[data-state=checked]]:bg-success-tint"
      >
        <Checkbox id={checkId} checked={saved} onCheckedChange={(v) => setSaved(v === true)} data-testid="codes-saved" />
        <span className="text-body text-ink">I saved these codes somewhere safe</span>
      </label>
      <Button
        type="button"
        size="lg"
        className={cn('disabled:opacity-60', continueClassName)}
        disabled={!saved || busy}
        onClick={onContinue}
        data-testid="codes-continue"
      >
        {continueLabel}
      </Button>
    </div>
  )
}

/**
 * The password rules, ticked live as the user types. `id` goes on the box so the password input
 * can name it in aria-describedby; it is not a live region (it would speak on every key). An unmet
 * rule stays neutral while typing: the submit error is the real error.
 */
export function PasswordRules({
  id,
  value,
  email,
  displayName,
}: {
  id: string
  value: string
  email: string
  displayName?: string | null
}) {
  const broken = new Set(checkPassword(value, { email, displayName }))
  const empty = value.length === 0
  const metCount = empty ? 0 : RULE_ORDER.filter((r) => !broken.has(r)).length
  const all = metCount === RULE_ORDER.length
  return (
    <div id={id} className="rounded-xl border border-line bg-canvas px-4 py-3" data-testid="password-rules">
      <div className="flex items-center justify-between gap-3">
        <p className="text-small font-semibold text-ink">Your new password needs</p>
        <span aria-hidden className={cn('text-caption tabular-nums', all ? 'font-semibold text-success-ink' : 'text-ink-3')}>
          {metCount} of {RULE_ORDER.length}
        </span>
      </div>
      <ul className="mt-2 grid gap-x-6 gap-y-1.5 text-small sm:grid-cols-2">
        {RULE_ORDER.map((rule) => {
          const met = !empty && !broken.has(rule)
          return (
            <li
              key={rule}
              className={cn('flex items-start gap-2', met ? 'text-success-ink' : 'text-ink-2', rule === 'personal' && 'sm:col-span-2')}
              data-rule={rule}
              data-met={met || undefined}
            >
              <span
                aria-hidden
                className={cn(
                  'tactile mt-px inline-flex size-4 shrink-0 items-center justify-center rounded-full',
                  met ? 'bg-success text-white' : 'border-[1.5px] border-line-strong bg-surface',
                )}
              >
                {met ? <Check className="size-3" strokeWidth={3} /> : null}
              </span>
              <span>
                {RULE_LABELS[rule]}
                <span className="sr-only">{met ? ' (done)' : ' (not yet)'}</span>
              </span>
            </li>
          )
        })}
      </ul>
      {SERVER_RULES.map((r) => (
        <p key={r} className="mt-2 flex items-start gap-2 border-t border-line pt-2 text-caption text-ink-3">
          <Info aria-hidden className="mt-px size-4 shrink-0" />
          <span>{r}. Checked when you save.</span>
        </p>
      ))}
    </div>
  )
}

/**
 * A submit button that also shows a Retry-After wait: while `waiting` it is a calm, neutral,
 * disabled button with a clock and the seconds left (readable at full contrast), not a faded
 * primary.
 */
export function SubmitButton({
  busy,
  waiting,
  label,
  busyLabel,
  size = 'lg',
  className = 'w-full',
  disabled,
  testId,
}: {
  busy: boolean
  waiting: number
  label: string
  busyLabel: string
  size?: 'md' | 'lg'
  className?: string
  disabled?: boolean
  testId?: string
}) {
  const wait = waiting > 0
  return (
    <Button
      type="submit"
      size={size}
      variant={wait ? 'secondary' : 'primary'}
      className={cn(className, wait && 'tabular-nums disabled:text-ink-2 disabled:opacity-100')}
      disabled={busy || wait || disabled}
      data-testid={testId}
    >
      {wait ? <Icon name="clock" size={16} /> : busy ? <Spinner data-icon="inline-start" /> : null}
      {wait ? `Try again in ${waiting} s` : busy ? busyLabel : label}
    </Button>
  )
}
