import { Icon } from '@/components/la/icons'
import { useState, type MouseEvent } from 'react'
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
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { toast, toastError } from '@/lib/toast'
import { useDismissIssue } from './api'
import { dismissFailure, issueHeadline, type Issue } from './model'

/**
 * "Accept" an open warning: POST /issues/{id}/dismiss with an Idempotency-Key. Rendered only for an
 * open warning and a role with listing:approve (errors can never be dismissed).
 */
export function DismissIssueButton({ issue }: { issue: Issue }) {
  const [open, setOpen] = useState(false)
  const dismiss = useDismissIssue(issue)

  const onConfirm = (e: MouseEvent) => {
    e.preventDefault()
    dismiss.mutate(undefined, {
      onSuccess: () => {
        toast.success('Warning dismissed', { description: 'Find it under Dismissed.' })
        setOpen(false)
      },
      onError: (err) => {
        const f = dismissFailure(err)
        if (f.kind === 'info') toast.info(f.title, { description: f.description })
        else toastError(err, f.title)
        setOpen(false)
      },
    })
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)} data-testid="issue-dismiss">
        <Icon name="check" size={16} data-icon="inline-start" />
        Dismiss warning
      </Button>
      <AlertDialog open={open} onOpenChange={(o) => !dismiss.isPending && setOpen(o)}>
        <AlertDialogContent data-testid="dismiss-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Dismiss this warning?</AlertDialogTitle>
            <AlertDialogDescription>
              “{issueHeadline(issue)}” stops counting as open for this listing. It stays visible under Dismissed, and
              comes back if a later check finds it again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={dismiss.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirm} disabled={dismiss.isPending} data-testid="dismiss-confirm">
              {dismiss.isPending ? <Spinner data-icon="inline-start" /> : null}
              {dismiss.isPending ? 'Dismissing…' : 'Dismiss warning'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
