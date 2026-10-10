import type { MouseEvent } from 'react'
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
import { Spinner } from '@/components/ui/spinner'
import { toast } from '@/lib/toast'
import { useRevokeAccount, type MarketplaceAccount } from './api'
import { MARKETPLACE_META } from './meta'

/** Confirm, then POST /marketplaces/accounts/{id}/revoke. */
export function RevokeDialog({
  account,
  open,
  onOpenChange,
}: {
  account: MarketplaceAccount
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const revoke = useRevokeAccount()
  const m = MARKETPLACE_META[account.marketplace]

  const onConfirm = (e: MouseEvent) => {
    e.preventDefault()
    revoke.mutate(account.id, {
      onSuccess: (out) => {
        toast.success(`${m.name} connection revoked`, { description: `Seller ${out.seller_id} is no longer connected.` })
        onOpenChange(false)
      },
      onError: () => onOpenChange(false),
    })
  }

  return (
    <AlertDialog open={open} onOpenChange={(o) => !revoke.isPending && onOpenChange(o)}>
      <AlertDialogContent data-testid="revoke-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>Revoke {m.name} connection?</AlertDialogTitle>
          <AlertDialogDescription>
            This deletes the stored tokens for seller{' '}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs text-foreground">{account.seller_id}</code>. Also
            remove the app in {m.console}. To connect again you will need to approve access again.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={revoke.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm} disabled={revoke.isPending}>
            {revoke.isPending ? <Spinner data-icon="inline-start" /> : null}
            {revoke.isPending ? 'Revoking…' : 'Revoke'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
