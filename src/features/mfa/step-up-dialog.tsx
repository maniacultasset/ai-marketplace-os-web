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
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { isApiError } from '@/api/errors'
import { adoptStepUpToken } from '@/api/session'
import { setStepUpHandler, type StepUpMode } from '@/api/step-up'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'
import { FormAlert } from '@/features/public/auth-frame'
import { useCountdown } from '@/features/signup-admin/use-countdown'
import { mfaErrorMessage, stepUp } from './api'
import { CodeField, type FactorKind } from './components'
import { isRecoveryCode, isTotp } from './login-flow'

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
        setFormError({ message: 'Too many attempts.', ref: err.correlationId })
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
  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onDone(false)}>
      <DialogContent
        className="sm:max-w-md"
        data-testid="step-up-dialog"
        showCloseButton={!busy}
        aria-describedby={descId}
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          inputRef.current?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>Confirm it's you</DialogTitle>
          <DialogDescription id={descId}>
            {kind === 'totp'
              ? 'This change needs a fresh code. Enter the 6-digit code from your authenticator app.'
              : 'Enter one of your saved recovery codes. It will stop working after this.'}
          </DialogDescription>
        </DialogHeader>
        {formError ? (
          <FormAlert testId="step-up-error" message={`${formError.message}${waiting ? ` Try again in ${waiting} s.` : ''}`} reference={formError.ref} />
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
            describedBy={descId}
            inputRef={inputRef}
          />
          {mode === 'any' ? (
            <Button type="button" variant="link" className="self-start" onClick={toggle} data-testid="step-up-toggle">
              {kind === 'totp' ? 'Use a recovery code' : 'Use your authenticator app'}
            </Button>
          ) : (
            <p className="text-caption text-ink-3">This action needs a code from your authenticator app; recovery codes don't work here.</p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onDone(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || waiting > 0} data-testid="step-up-submit">
              {busy ? <Spinner data-icon="inline-start" /> : null}
              {waiting > 0 ? `Try again in ${waiting} s` : busy ? 'Checking…' : 'Confirm'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
