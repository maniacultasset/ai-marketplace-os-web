/**
 * New-password form, shared by the forced change at sign-in (POST /auth/password/expired) and
 * Settings > Security (POST /auth/password, which also takes the current password). The rules are
 * checked live (password-rules.ts); the server's 422 rule sentences land under the field.
 */
import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { isApiError } from '@/api/errors'
import { fieldHintId, LaField } from '@/components/la/field'
import { FormAlert } from '@/features/public/auth-frame'
import { PasswordInput } from '@/features/signup-admin/password-input'
import { FORM_VALIDATION_MODE } from '@/lib/validation'
import { mfaErrorMessage, ruleMessages } from './api'
import { PasswordRules, SubmitButton, TOUCH_TEXT } from './components'
import { checkPassword, PASSWORD_MAX } from './password-rules'

export interface PasswordFormValues {
  current_password: string
  new_password: string
  confirm: string
}

function schema(who: { email: string; displayName?: string | null }, requireCurrent: boolean) {
  return z
    .object({
      current_password: requireCurrent
        ? z.string().min(1, 'Enter your current password.').max(PASSWORD_MAX, 'Password is too long.')
        : z.string(),
      new_password: z
        .string()
        .min(1, 'Enter a new password.')
        .refine((v) => checkPassword(v, who).length === 0, 'Meet every rule in the list.'),
      confirm: z.string().min(1, 'Type the new password again.'),
    })
    .refine((v) => v.confirm === v.new_password, { path: ['confirm'], message: 'The two passwords do not match.' })
}

export function PasswordForm({
  email,
  displayName,
  requireCurrent,
  submitLabel,
  onSubmit,
  autoFocus,
  idPrefix = 'pw',
  testId,
  submitSize = 'lg',
  actions,
}: {
  email: string
  displayName?: string | null
  requireCurrent: boolean
  submitLabel: string
  /** Throws the ApiError on failure; the form maps it. Resolves when saved. */
  onSubmit: (values: { current_password: string; new_password: string }) => Promise<void>
  autoFocus?: boolean
  idPrefix?: string
  testId?: string
  submitSize?: 'md' | 'lg'
  /** Buttons beside the submit (e.g. Cancel): right-aligned from 640px, stacked under it on a phone. */
  actions?: ReactNode
}) {
  const [formError, setFormError] = useState<{ message: string; ref: string | null } | null>(null)
  const alertRef = useRef<HTMLDivElement>(null)
  // A refusal from the server (e.g. once a day) may land above the fold: bring it into view.
  useEffect(() => {
    const el = alertRef.current
    if (!formError || !el) return
    const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView?.({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' })
    el.focus({ preventScroll: true })
  }, [formError])
  const rulesId = useId()
  const form = useForm<PasswordFormValues>({
    resolver: zodResolver(schema({ email, displayName }, requireCurrent)),
    defaultValues: { current_password: '', new_password: '', confirm: '' },
    ...FORM_VALIDATION_MODE,
  })

  const ids = {
    current: `${idPrefix}-current`,
    next: `${idPrefix}-new`,
    confirm: `${idPrefix}-confirm`,
  }
  const newPassword = useWatch({ control: form.control, name: 'new_password' })
  const { errors, isSubmitting, submitCount } = form.formState

  const submit = form.handleSubmit(async (v) => {
    setFormError(null)
    try {
      await onSubmit({ current_password: v.current_password, new_password: v.new_password })
    } catch (e) {
      const rules = ruleMessages(e, 'new_password')
      if (rules.length) {
        form.setError('new_password', { type: 'server', message: rules.join(' ') }, { shouldFocus: true })
        return
      }
      setFormError({ message: mfaErrorMessage(e), ref: isApiError(e) ? e.correlationId : null })
    }
  })

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4" data-testid={testId}>
      {formError ? <FormAlert testId="password-error" message={formError.message} reference={formError.ref} focusRef={alertRef} /> : null}
      {requireCurrent ? (
        <LaField label="Current password" htmlFor={ids.current} error={errors.current_password?.message} submitCount={submitCount}>
          <PasswordInput
            id={ids.current}
            className={TOUCH_TEXT}
            autoComplete="current-password"
            autoFocus={autoFocus}
            aria-invalid={!!errors.current_password}
            aria-describedby={fieldHintId(ids.current)}
            {...form.register('current_password')}
          />
        </LaField>
      ) : null}
      <LaField label="New password" htmlFor={ids.next} error={errors.new_password?.message} submitCount={submitCount}>
        <PasswordInput
          id={ids.next}
          className={TOUCH_TEXT}
          autoComplete="new-password"
          autoFocus={autoFocus && !requireCurrent}
          maxLength={PASSWORD_MAX}
          aria-invalid={!!errors.new_password}
          aria-describedby={`${fieldHintId(ids.next)} ${rulesId}`}
          {...form.register('new_password')}
        />
      </LaField>
      <PasswordRules id={rulesId} value={newPassword} email={email} displayName={displayName} />
      <LaField label="Type it again" htmlFor={ids.confirm} error={errors.confirm?.message} submitCount={submitCount}>
        <PasswordInput
          id={ids.confirm}
          className={TOUCH_TEXT}
          autoComplete="new-password"
          maxLength={PASSWORD_MAX}
          aria-invalid={!!errors.confirm}
          aria-describedby={fieldHintId(ids.confirm)}
          {...form.register('confirm')}
        />
      </LaField>
      {actions ? (
        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
          {actions}
          <SubmitButton busy={isSubmitting} waiting={0} label={submitLabel} busyLabel="Saving…" size={submitSize} className="w-full sm:w-auto" />
        </div>
      ) : (
        <SubmitButton busy={isSubmitting} waiting={0} label={submitLabel} busyLabel="Saving…" size={submitSize} className="w-full" />
      )}
    </form>
  )
}
