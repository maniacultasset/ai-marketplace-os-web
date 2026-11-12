import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { applyFieldErrors, isApiError } from '@/api/errors'
import { ReferenceId } from '@/components/states/reference-id'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { FORM_VALIDATION_MODE } from '@/lib/validation'
import { useAskSignup } from './api'
import { decisionError, type SignupRequest } from './format'
import { askFormSchema, codePoints, REASON_MAX, toAskBody, type AskFormValues } from './schema'

/**
 * POST /admin/signup-requests/{id}/ask: one question the applicant reads on their waiting page and
 * answers once. The request stays pending, and approve and reject stay open.
 */
export function AskDialog({
  request,
  open,
  onClose,
}: {
  /** Kept after close so the content does not vanish during the exit animation. */
  request: SignupRequest | null
  open: boolean
  onClose: () => void
}) {
  const ask = useAskSignup()
  const form = useForm<AskFormValues>({
    resolver: zodResolver(askFormSchema),
    defaultValues: { question: '' },
    ...FORM_VALIDATION_MODE,
  })
  const { errors } = form.formState

  const requestId = request?.id
  useEffect(() => {
    if (!open) return
    form.reset({ question: '' })
    ask.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when the request changes
  }, [open, requestId])

  const onSubmit = form.handleSubmit((values) => {
    if (!request) return
    ask.mutate(
      { id: request.id, body: toAskBody(values) },
      {
        onSuccess: (out) => {
          toast.success(`Question sent to ${out.brand_name}`, { description: 'Their reply shows here once they send it.' })
          onClose()
        },
        onError: (e) => {
          applyFieldErrors(e, form.setError, { fields: ['question'] })
        },
      },
    )
  })

  const busy = ask.isPending
  const length = codePoints(form.watch('question').trim())
  const showServerError = ask.isError && !(isApiError(ask.error) && ask.error.status === 422 && errors.question)

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-md" data-testid="ask-dialog" showCloseButton={!busy}>
        {request ? (
          <form onSubmit={onSubmit} noValidate className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Ask {request.brand_name} a question</DialogTitle>
              <DialogDescription>
                {request.owner_name} sees it on their waiting page and can reply once. The request stays pending, so you can still approve or
                reject at any time.
              </DialogDescription>
            </DialogHeader>
            <Field data-invalid={!!errors.question || undefined}>
              <FieldLabel htmlFor="ask-question">Question</FieldLabel>
              <Textarea
                id="ask-question"
                rows={4}
                autoFocus
                className="max-h-60 min-h-24"
                placeholder="For example: which marketplaces do you sell on today, and under which store name?"
                autoComplete="off"
                aria-invalid={!!errors.question}
                aria-describedby="ask-question-hint"
                disabled={busy}
                data-testid="ask-question"
                {...form.register('question')}
              />
              <div id="ask-question-hint" className="flex items-start justify-between gap-3">
                {errors.question ? (
                  <FieldError errors={[errors.question]} />
                ) : (
                  <FieldDescription className="text-xs">One question per request. Ask for exactly what you need.</FieldDescription>
                )}
                <span className={cn('shrink-0 text-xs text-muted-foreground tabular-nums', length > REASON_MAX && 'text-destructive')}>
                  {length}/{REASON_MAX}
                </span>
              </div>
            </Field>
            {showServerError ? (
              <div role="alert" className="flex flex-col gap-1 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2" data-testid="ask-error">
                <span className="text-sm text-destructive">{decisionError(ask.error, 'ask')}</span>
                {isApiError(ask.error) ? <ReferenceId id={ask.error.correlationId} /> : null}
              </div>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy} data-testid="ask-confirm">
                {busy ? <Spinner data-icon="inline-start" /> : null}
                {busy ? 'Sending…' : 'Send question'}
              </Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
