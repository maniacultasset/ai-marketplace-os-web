/**
 * The step-up dialog (DPP-1; docs/HANDOFF-FE.md §6.6). Mounted once in the signed-in shell, it
 * registers itself as the step-up handler of the API layer (api/step-up.ts). On a 403
 * `MFA_STEP_UP_REQUIRED` from any request, `authFetch` asks it for a code; it POSTs
 * /auth/mfa/step-up, swaps in the new access token (never the refresh token) and resolves true,
 * so the original request is replayed once. Cancel resolves false and the request fails as it was.
 *
 * Admin actions (account revoke, sign-up approve/reject) take a TOTP code only; the rest also take a
 * recovery code (a lost phone).
 */
import { KeyRound, Smartphone } from 'lucide-react'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { isApiError } from '@/api/errors'
import { adoptStepUpToken } from '@/api/session'
import { setStepUpHandler, type StepUpMode } from '@/api/step-up'
import { Banner } from '@/components/la/banner'
import { IconTile } from '@/components/la/icons'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FormAlert } from '@/features/public/auth-frame'
import { useCountdown } from '@/features/signup-admin/use-countdown'
import { useKeyboardInset } from '@/hooks/use-keyboard-inset'
import { mfaErrorMessage, stepUp } from './api'
import { CodeField, SubmitButton, type FactorKind } from './components'
import { isRecoveryCode, isTotp, TOO_MANY } from './login-flow'

interface Pending {
  mode: StepUpMode
  resolve: (ok: boolean) => void
  unsubscribe: () => void
}

export function StepUpHost() {
  const [pending, setPending] = useState<Pending | null>(null)
  const pendingRef = useRef<Pending | null>(null)
  // A fresh dialog (and so a fresh, empty code) for every request.
  const [seq, setSeq] = useState(0)

  useEffect(() => {
    const off = setStepUpHandler(
      (prompt) =>
        new Promise<boolean>((resolve) => {
          // A TOTP-only request joining this prompt tightens it to `otp`.
          const unsubscribe = prompt.subscribe((mode) => {
            if (pendingRef.current) pendingRef.current = { ...pendingRef.current, mode }
            setPending((cur) => (cur ? { ...cur, mode } : cur))
          })
          const p = { mode: prompt.mode, resolve, unsubscribe }
          pendingRef.current = p
          setSeq((n) => n + 1)
          setPending(p)
        }),
    )
    return () => {
      off()
      // Unmounted mid-request (sign-out): the waiting request fails as it was.
      pendingRef.current?.unsubscribe()
      pendingRef.current?.resolve(false)
      pendingRef.current = null
    }
  }, [])

  const finish = (ok: boolean) => {
    pendingRef.current?.unsubscribe()
    pendingRef.current?.resolve(ok)
    pendingRef.current = null
    setPending(null)
  }

  return <StepUpDialog key={seq} open={!!pending} mode={pending?.mode ?? 'any'} onDone={finish} />
}

/** A centred 420px dialog from 640px up; below it, a bottom sheet clear of the safe area and the keyboard. */
const SHEET = [
  'gap-5 [--dialog-pad:--spacing(6)] sm:max-w-[420px]',
  // Never taller than the space above the keyboard: the sheet scrolls instead of running off the top.
  'max-sm:max-h-[calc(100dvh-var(--kb-inset,0px)-env(safe-area-inset-top)-8px)] max-sm:overflow-y-auto max-sm:overscroll-contain',
  // The full-width Cancel is the way out on a phone; the small corner X is a desktop affordance.
  'max-sm:[&>[data-slot=dialog-close]]:hidden',
  'max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0',
  'max-sm:rounded-b-none max-sm:rounded-t-3xl max-sm:border-x-0 max-sm:border-b-0 max-sm:px-4 max-sm:pt-3',
  'max-sm:pb-[max(1rem,env(safe-area-inset-bottom))]',
  'max-sm:data-open:slide-in-from-bottom max-sm:data-open:zoom-in-100 max-sm:data-closed:slide-out-to-bottom max-sm:data-closed:zoom-out-100',
  'max-sm:data-open:duration-300 max-sm:data-open:ease-[var(--ease-spring)]',
  'motion-reduce:max-sm:[--tw-enter-translate-y:0] motion-reduce:max-sm:[--tw-exit-translate-y:0]',
].join(' ')

export function StepUpDialog({ open, mode, onDone }: { open: boolean; mode: StepUpMode; onDone: (ok: boolean) => void }) {
  const [chosen, setChosen] = useState<FactorKind>('totp')
  const [value, setValue] = useState('')
  // Tightened to `otp` while open (a TOTP-only request joined): drop a typed recovery code.
  if (mode === 'otp' && chosen === 'recovery') {
    setChosen('totp')
    setValue('')
  }
  const kind: FactorKind = mode === 'otp' ? 'totp' : chosen
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [formError, setFormError] = useState<{ message: string; ref: string | null } | null>(null)
  const [busy, setBusy] = useState(false)
  const countdown = useCountdown()
  const inputRef = useRef<HTMLInputElement>(null)
  const descId = useId()

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const v = kind === 'totp' ? value : value.trim()
    if (kind === 'totp' ? !isTotp(v) : !isRecoveryCode(v)) {
      setFieldError(kind === 'totp' ? 'Enter the 6-digit code.' : 'Enter a recovery code.')
      inputRef.current?.focus()
      return
    }
    setBusy(true)
    setFieldError(null)
    setFormError(null)
    try {
      const out = await stepUp(kind === 'totp' ? { code: v } : { recovery_code: v })
      setValue('')
      if (!adoptStepUpToken(out.access_token)) throw new Error('step-up token for another session')
      onDone(true)
    } catch (err) {
      setValue('')
      if (isApiError(err) && err.status === 422) {
        // A wrong code (a locked account answers the same, so the lock stays invisible).
        setFieldError(err.details[0]?.msg ?? err.message ?? "That code didn't work.")
        inputRef.current?.focus()
      } else if (isApiError(err) && err.status === 429) {
        countdown.start(err.retryAfter ?? 60)
        setFormError({ message: TOO_MANY, ref: err.correlationId })
      } else if (isApiError(err) && err.status === 401) {
        // authFetch already refreshed once; the session has ended and the app is leaving.
        onDone(false)
      } else {
        setFormError({ message: mfaErrorMessage(err), ref: isApiError(err) ? err.correlationId : null })
      }
    } finally {
      setBusy(false)
    }
  }

  const toggle = () => {
    setChosen((k) => (k === 'totp' ? 'recovery' : 'totp'))
    setValue('')
    setFieldError(null)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  const waiting = countdown.left
  useKeyboardInset(open)
  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onDone(false)}>
      {/* One dialog at every width (a bottom sheet on a phone, by CSS only), so a typed code survives a resize. */}
      <DialogContent
        className={SHEET}
        style={{ marginBottom: 'var(--kb-inset, 0px)' }}
        data-testid="step-up-dialog"
        showCloseButton={!busy}
        aria-describedby={descId}
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          inputRef.current?.focus()
        }}
      >
        <div aria-hidden className="mx-auto -mb-2 h-1 w-9 rounded-full bg-line-strong sm:hidden" />
        <DialogHeader className="items-center text-center sm:items-start sm:text-left">
          <IconTile icon="shield" tone="brand" size="lg" className="mb-2" />
          <DialogTitle className="font-heading text-h2 font-bold text-ink">Confirm it's you</DialogTitle>
          <DialogDescription id={descId} className="text-small text-pretty text-ink-2">
            {kind === 'totp'
              ? 'This change needs a fresh code. Enter the 6-digit code from your authenticator app.'
              : 'Enter one of your saved recovery codes. It will stop working after this.'}
          </DialogDescription>
        </DialogHeader>
        {formError ? (
          <FormAlert testId="step-up-error" message={formError.message} reference={formError.ref} />
        ) : null}
        <form onSubmit={(e) => void onSubmit(e)} noValidate className="flex flex-col gap-4">
          <CodeField
            id="step-up-code"
            kind={kind}
            value={value}
            onChange={(v) => {
              setValue(v)
              setFieldError(null)
            }}
            error={fieldError}
            inputRef={inputRef}
            centered="phone"
            canAutoSubmit={!busy && waiting === 0}
            busy={busy}
          />
          {mode === 'any' ? (
            <Button type="button" variant="link" className="min-h-11 self-center sm:self-start" onClick={toggle} data-testid="step-up-toggle">
              {kind === 'totp' ? <KeyRound data-icon="inline-start" /> : <Smartphone data-icon="inline-start" />}
              {kind === 'totp' ? 'Use a recovery code' : 'Use your authenticator app'}
            </Button>
          ) : (
            <Banner tone="neutral" icon="info" className="py-2.5">
              This action needs a code from your authenticator app; recovery codes don't work here.
            </Banner>
          )}
          {/* A plain row, not the grey DialogFooter band: the sheet keeps its own padding. */}
          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={() => onDone(false)}
              disabled={busy}
              className="max-sm:h-11 max-sm:border-transparent max-sm:bg-transparent max-sm:text-[15px] max-sm:text-ink-2 max-sm:shadow-none"
            >
              Cancel
            </Button>
            <SubmitButton
              busy={busy}
              waiting={waiting}
              label="Confirm"
              busyLabel="Checking…"
              size="md"
              className="w-full max-sm:h-11 max-sm:text-[15px] sm:w-auto"
              testId="step-up-submit"
            />
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
