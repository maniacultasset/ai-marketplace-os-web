/**
 * Building blocks for the login-code screens: the code field, the QR code, the setup key, the
 * recovery codes panel and the live password checklist. Nothing here logs or stores a secret.
 */
import { Check, Copy, Download, X } from 'lucide-react'
import { useEffect, useId, useState, type ReactNode } from 'react'
import { fieldHintId, LaField } from '@/components/la/field'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { groupSecret, totpInput } from './login-flow'
import { checkPassword, RULE_LABELS, RULE_ORDER, SERVER_RULES } from './password-rules'

export type FactorKind = 'totp' | 'recovery'

/**
 * A 6-digit TOTP field (numeric keyboard, one-time-code autofill) or a recovery code field. The
 * value is filtered as typed: digits only for a TOTP code.
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
  inputRef?: React.Ref<HTMLInputElement>
}) {
  const totp = kind === 'totp'
  return (
    <LaField
      label={label ?? (totp ? '6-digit code' : 'Recovery code')}
      htmlFor={id}
      hint={hint ?? (totp ? 'From your authenticator app. It changes every 30 seconds.' : 'One of the 10 codes you saved. Each works once.')}
      error={error ?? undefined}
    >
      <Input
        ref={inputRef}
        id={id}
        name={totp ? 'one-time-code' : 'recovery-code'}
        type="text"
        inputMode={totp ? 'numeric' : 'text'}
        autoComplete={totp ? 'one-time-code' : 'off'}
        pattern={totp ? '[0-9]*' : undefined}
        maxLength={totp ? 6 : 64}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        autoFocus={autoFocus}
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(totp ? totpInput(e.target.value) : e.target.value)}
        aria-invalid={!!error}
        aria-describedby={[fieldHintId(id), describedBy].filter(Boolean).join(' ')}
        className={cn('font-mono text-[17px]', totp && 'tracking-[0.35em]')}
        data-testid={totp ? 'totp-input' : 'recovery-input'}
      />
    </LaField>
  )
}

/**
 * The otpauth URI as a QR code, drawn in the browser (the `qrcode` package, loaded on demand) into
 * an SVG data: URL. The URI never leaves the page.
 */
export function QrCode({ uri, size = 184 }: { uri: string; size?: number }) {
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
  // The image (it encodes the secret) goes with the component.
  useEffect(() => () => setDrawn(null), [])
  const current = drawn?.uri === uri ? drawn : null
  const src = current?.src ?? null
  const failed = current?.failed ?? false
  const box = { width: size, height: size }
  if (failed) {
    return (
      <div style={box} className="flex items-center justify-center rounded-[10px] border border-line bg-surface p-3 text-center text-caption text-ink-2">
        The QR code could not be drawn. Use the setup key instead.
      </div>
    )
  }
  if (!src) return <Skeleton style={box} className="rounded-[10px]" aria-label="Drawing the QR code" />
  return (
    <img
      src={src}
      width={size}
      height={size}
      alt="QR code to scan with your authenticator app. If you can't scan it, type the setup key instead."
      className="rounded-[10px] border border-line bg-white"
      data-testid="mfa-qr"
    />
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

/** The base32 secret in groups of four, with a copy button. */
export function SetupKey({ secret }: { secret: string }) {
  const { copied, copy } = useCopied()
  const labelId = useId()
  return (
    <div className="min-w-0">
      <p id={labelId} className="mb-1.5 text-small font-bold text-ink">
        Setup key
      </p>
      <div className="flex min-w-0 items-start gap-2">
        <code
          aria-labelledby={labelId}
          className="min-w-0 flex-1 rounded-[8px] border border-line bg-subtle px-3 py-2 font-mono text-[14px] leading-6 break-words text-ink"
          data-testid="mfa-secret"
        >
          {groupSecret(secret)}
        </code>
        <Button type="button" variant="outline" size="icon" onClick={() => copy(secret.replace(/\s+/g, ''))} aria-label={copied ? 'Setup key copied' : 'Copy setup key'}>
          {copied ? <Check className="text-success" /> : <Copy />}
        </Button>
      </div>
      <p className="mt-1.5 text-caption text-ink-3">Choose a time-based key in your app if it asks.</p>
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
 * continue button.
 */
export function RecoveryCodes({
  codes,
  account,
  continueLabel = 'Continue',
  onContinue,
  busy,
}: {
  codes: string[]
  account?: string
  continueLabel?: string
  onContinue: () => void
  busy?: boolean
}) {
  const [saved, setSaved] = useState(false)
  const { copied, copy } = useCopied()
  const checkId = useId()
  return (
    <div className="flex flex-col gap-4" data-testid="recovery-codes">
      <ol aria-label="Recovery codes" className="grid grid-cols-1 gap-x-4 gap-y-1.5 rounded-[10px] border border-line bg-subtle p-4 font-mono text-[14px] text-ink min-[360px]:grid-cols-2">
        {codes.map((c) => (
          <li key={c} className="break-all">
            {c}
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => copy(codes.join('\n'))}>
          {copied ? <Check className="text-success" data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
          {copied ? 'Copied' : 'Copy codes'}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => downloadCodes(codes, account)}>
          <Download data-icon="inline-start" />
          Download .txt
        </Button>
        <span className="sr-only" aria-live="polite">
          {copied ? 'Recovery codes copied' : ''}
        </span>
      </div>
      <div className="flex items-start gap-3">
        <Checkbox id={checkId} checked={saved} onCheckedChange={(v) => setSaved(v === true)} className="mt-0.5" data-testid="codes-saved" />
        <label htmlFor={checkId} className="text-body text-ink">
          I saved these codes somewhere safe
        </label>
      </div>
      <Button type="button" size="lg" className="w-full" disabled={!saved || busy} onClick={onContinue} data-testid="codes-continue">
        {continueLabel}
      </Button>
    </div>
  )
}

/**
 * The password rules, ticked live as the user types. `id` goes on the list so the password input
 * can name it in aria-describedby; the list is not a live region (it would speak on every key).
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
  return (
    <div id={id} className="rounded-[10px] border border-line bg-subtle px-3.5 py-3" data-testid="password-rules">
      <p className="mb-1.5 text-caption font-semibold text-ink-2">Your new password needs</p>
      <ul className="flex flex-col gap-1 text-caption">
        {RULE_ORDER.map((rule) => {
          const met = !empty && !broken.has(rule)
          return (
            <li key={rule} className={cn('flex items-start gap-2', met ? 'text-success-ink' : 'text-ink-2')} data-rule={rule} data-met={met || undefined}>
              {met ? <Check aria-hidden className="mt-px size-3.5 shrink-0" /> : empty ? <span aria-hidden className="mt-[5px] size-1.5 shrink-0 rounded-full bg-ink-3" /> : <X aria-hidden className="mt-px size-3.5 shrink-0 text-danger" />}
              <span>
                {RULE_LABELS[rule]}
                <span className="sr-only">{met ? ' (done)' : ' (not yet)'}</span>
              </span>
            </li>
          )
        })}
        {SERVER_RULES.map((r) => (
          <li key={r} className="flex items-start gap-2 text-ink-3">
            <span aria-hidden className="mt-[5px] size-1.5 shrink-0 rounded-full bg-ink-3" />
            <span>{r} (checked when you save)</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
