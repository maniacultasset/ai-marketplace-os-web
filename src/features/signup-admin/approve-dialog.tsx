import { useEffect, useId, useState, type ReactNode } from 'react'
import { Icon, IconTile } from '@/components/la/icons'
import { isApiError } from '@/api/errors'
import { ReferenceId } from '@/components/states/reference-id'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { useApproveSignup } from './api'
import { decisionError, type SignupRequest } from './format'
import { parseTrialDays, toApproveBody, TRIAL_DAYS_DEFAULT, TRIAL_DAYS_MAX, TRIAL_DAYS_MIN } from './schema'
import { TimeAgo } from './time'

/**
 * Confirm, then POST /admin/signup-requests/{id}/approve. On success the dialog shows what the
 * backend created (the trial tenant id and its owner) from the response.
 */
export function ApproveDialog({
  request,
  open,
  onClose,
}: {
  /** Kept after close so the content does not vanish during the exit animation. */
  request: SignupRequest | null
  open: boolean
  onClose: () => void
}) {
  const approve = useApproveSignup()
  const [trial, setTrial] = useState(String(TRIAL_DAYS_DEFAULT))
  const [approved, setApproved] = useState<{ out: SignupRequest; trialDays: number } | null>(null)
  const trialId = useId()

  // A fresh dialog each time it opens.
  const requestId = request?.id
  useEffect(() => {
    if (!open) return
    setTrial(String(TRIAL_DAYS_DEFAULT))
    setApproved(null)
    approve.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when the request changes
  }, [open, requestId])

  const parsed = parseTrialDays(trial)
  const trialInvalid = parsed === 'invalid'

  const onConfirm = () => {
    if (!request || trialInvalid) return
    approve.mutate(
      { id: request.id, body: toApproveBody(parsed) },
      { onSuccess: (out) => setApproved({ out, trialDays: parsed ?? TRIAL_DAYS_DEFAULT }) },
    )
  }

  const busy = approve.isPending

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-md" data-testid="approve-dialog" showCloseButton={!busy}>
        {approved ? (
          <Approved out={approved.out} trialDays={approved.trialDays} onDone={onClose} />
        ) : request ? (
          <>
            <DialogHeader>
              <DialogTitle>Approve {request.brand_name}?</DialogTitle>
              <DialogDescription>
                This creates a trial workspace for the brand and makes {request.owner_name} its owner. They can sign in right
                away with the email and password they applied with.
              </DialogDescription>
            </DialogHeader>
            <dl className="divide-y rounded-lg border text-sm">
              <Row label="Owner">
                <span className="truncate">{request.email}</span>
              </Row>
              <Row label="Requested">
                <TimeAgo iso={request.created_at} />
              </Row>
            </dl>
            <Field data-invalid={trialInvalid || undefined}>
              <FieldLabel htmlFor={trialId}>Trial length</FieldLabel>
              <div className="flex items-center gap-2">
                <Input
                  id={trialId}
                  inputMode="numeric"
                  className="w-24 tabular-nums"
                  value={trial}
                  onChange={(e) => setTrial(e.target.value)}
                  aria-invalid={trialInvalid}
                  disabled={busy}
                  data-testid="approve-trial-days"
                />
                <span className="text-sm text-muted-foreground">days</span>
              </div>
              {trialInvalid ? (
                <FieldError>
                  Enter a whole number from {TRIAL_DAYS_MIN} to {TRIAL_DAYS_MAX}.
                </FieldError>
              ) : (
                <FieldDescription className="text-xs">Leave empty for the default ({TRIAL_DAYS_DEFAULT} days).</FieldDescription>
              )}
            </Field>
            {approve.isError ? (
              <div role="alert" className="flex flex-col gap-1 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2" data-testid="approve-error">
                <span className="text-sm text-destructive">{decisionError(approve.error, 'approve')}</span>
                {isApiError(approve.error) ? <ReferenceId id={approve.error.correlationId} /> : null}
              </div>
            ) : null}
            <DialogFooter>
              <Button variant="outline" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
              <Button onClick={onConfirm} disabled={busy || trialInvalid} data-testid="approve-confirm">
                {busy ? <Spinner data-icon="inline-start" /> : null}
                {busy ? 'Approving…' : 'Approve and create workspace'}
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function Approved({ out, trialDays, onDone }: { out: SignupRequest; trialDays: number; onDone: () => void }) {
  const loginUrl = `${window.location.origin}/login`
  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <IconTile icon="check" tone="ok" size="sm" />
          Workspace created
        </DialogTitle>
        <DialogDescription>
          {out.brand_name} is on a {trialDays}-day trial. Let {out.owner_name} know they can sign in now.
        </DialogDescription>
      </DialogHeader>
      <dl className="divide-y rounded-lg border text-sm" data-testid="approve-result">
        <Row label="Brand">
          <span className="truncate font-medium">{out.brand_name}</span>
        </Row>
        <Row label="Owner">
          <span className="flex min-w-0 flex-col items-end">
            <span className="truncate">{out.owner_name}</span>
            <span className="truncate text-xs text-muted-foreground">{out.email}</span>
          </span>
        </Row>
        <Row label="Workspace id">
          {out.tenant_id ? <CopyValue value={out.tenant_id} testId="approve-tenant-id" /> : <span className="text-muted-foreground">—</span>}
        </Row>
        <Row label="Sign-in page">
          <CopyValue value={loginUrl} />
        </Row>
        {out.decided_at ? (
          <Row label="Approved">
            <TimeAgo iso={out.decided_at} />
          </Row>
        ) : null}
      </dl>
      <DialogFooter>
        <Button onClick={onDone} data-testid="approve-done">
          Done
        </Button>
      </DialogFooter>
    </>
  )
}

function CopyValue({ value, testId }: { value: string; testId?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <span className="flex min-w-0 items-center gap-1">
      <code className="truncate rounded border border-line bg-field px-1.5 py-0.5 font-mono text-[11px] shadow-inset-sm" data-testid={testId} title={value}>
        {value}
      </code>
      <button
        type="button"
        aria-label="Copy"
        className="inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground tactile hover:bg-hover hover:text-foreground active:bg-pressed active:shadow-pressed focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
        onClick={() => {
          void navigator.clipboard
            ?.writeText(value)
            .then(() => {
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            })
            .catch(() => undefined)
        }}
      >
        {copied ? <Icon name="check" size={14} /> : <Icon name="copy" size={14} />}
      </button>
    </span>
  )
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-10 items-center justify-between gap-4 px-3 py-2">
      <dt className="shrink-0 text-[0.8125rem] text-muted-foreground">{label}</dt>
      <dd className="flex min-w-0 items-center justify-end text-right">{children}</dd>
    </div>
  )
}
