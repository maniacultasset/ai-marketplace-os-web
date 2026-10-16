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
import { useRejectSignup } from './api'
import { decisionError, type SignupRequest } from './format'
import { codePoints, REASON_MAX, rejectFormSchema, toRejectBody, type RejectFormValues } from './schema'

/** POST /admin/signup-requests/{id}/reject with a required reason the applicant reads. */
export function RejectDialog({
  request,
  open,
  onClose,
}: {
  /** Kept after close so the content does not vanish during the exit animation. */
  request: SignupRequest | null
  open: boolean
  onClose: () => void
}) {
  const reject = useRejectSignup()
  const form = useForm<RejectFormValues>({ resolver: zodResolver(rejectFormSchema), defaultValues: { reason: '' } })
  const { errors } = form.formState

  const requestId = request?.id
  useEffect(() => {
    if (!open) return
    form.reset({ reason: '' })
    reject.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when the request changes
  }, [open, requestId])

  const onSubmit = form.handleSubmit((values) => {
    if (!request) return
    reject.mutate(
      { id: request.id, body: toRejectBody(values) },
      {
        onSuccess: (out) => {
          toast.success(`${out.brand_name} rejected`, { description: 'They will see your reason when they check their status.' })
          onClose()
        },
        onError: (e) => {
          applyFieldErrors(e, form.setError, { fields: ['reason'] })
        },
      },
    )
  })

  const busy = reject.isPending
  const length = codePoints(form.watch('reason').trim())
  const showServerError = reject.isError && !(isApiError(reject.error) && reject.error.status === 422 && errors.reason)

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-md" data-testid="reject-dialog" showCloseButton={!busy}>
        {request ? (
          <form onSubmit={onSubmit} noValidate className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Reject {request.brand_name}?</DialogTitle>
              <DialogDescription>
                {request.owner_name} sees this reason when they check their request status, and can apply again.
              </DialogDescription>
            </DialogHeader>
            <Field data-invalid={!!errors.reason || undefined}>
              <FieldLabel htmlFor="reject-reason">Reason</FieldLabel>
              <Textarea
                id="reject-reason"
                rows={4}
                autoFocus
                className="max-h-60 min-h-24"
                placeholder="For example: we could not verify the brand. Add your website and apply again."
                aria-invalid={!!errors.reason}
                disabled={busy}
                data-testid="reject-reason"
                {...form.register('reason')}
              />
              <div className="flex items-start justify-between gap-3">
                {errors.reason ? (
                  <FieldError errors={[errors.reason]} />
                ) : (
                  <FieldDescription className="text-xs">Be specific: say what to fix.</FieldDescription>
                )}
                <span className={cn('shrink-0 text-xs text-muted-foreground tabular-nums', length > REASON_MAX && 'text-destructive')}>
                  {length}/{REASON_MAX}
                </span>
              </div>
            </Field>
            {showServerError ? (
              <div role="alert" className="flex flex-col gap-1 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2" data-testid="reject-error">
                <span className="text-sm text-destructive">{decisionError(reject.error, 'reject')}</span>
                {isApiError(reject.error) ? <ReferenceId id={reject.error.correlationId} /> : null}
              </div>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" variant="destructive" disabled={busy} data-testid="reject-confirm">
                {busy ? <Spinner data-icon="inline-start" /> : null}
                {busy ? 'Rejecting…' : 'Reject request'}
              </Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
