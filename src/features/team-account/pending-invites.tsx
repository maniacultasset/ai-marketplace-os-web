/**
 * Open invites on /team: who was invited, as what, and until when, with Cancel invite. The list
 * never holds a link (the API never returns one after create). Cancelling an invite stops its
 * link at once; an invite someone already used cannot be cancelled (409), so the lists re-read.
 */
import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { isApiError } from '@/api/errors'
import { Icon } from '@/components/la/icons'
import { ReferenceId } from '@/components/states/reference-id'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useMe } from '@/lib/auth'
import { useKeys } from '@/lib/query-keys'
import { toast, toastError } from '@/lib/toast'
import { revokeInvite, type Invite } from './access-api'
import { revokeLockedReason, shortDateTime, untilLabel } from './access-model'
import { ROLE_INFO } from './roles'

export function PendingInvites({ list }: { list: { rows: Invite[]; isPending: boolean; isError: boolean; hasNextPage?: boolean; refetch: () => unknown } }) {
  return (
    <Card role="region" aria-labelledby="invites-heading" className="gap-0 py-0" data-testid="pending-invites">
      <CardHeader className="pt-5 pb-4">
        <CardTitle id="invites-heading" role="heading" aria-level={2}>
          Open invites
        </CardTitle>
        <CardDescription>Links you made that nobody has used yet.</CardDescription>
      </CardHeader>
      {list.isPending ? (
        <ul aria-busy>
          {Array.from({ length: 2 }, (_, i) => (
            <li key={i} className="flex items-center gap-4 border-t px-5 py-3.5">
              <Skeleton className="h-4 w-56" />
              <Skeleton className="ml-auto h-8 w-28" />
            </li>
          ))}
        </ul>
      ) : list.isError && list.rows.length === 0 ? (
        <div className="flex items-center justify-between gap-4 border-t px-5 py-3.5 text-small text-ink-2" role="alert">
          Couldn’t load the open invites.
          <Button variant="outline" size="sm" onClick={() => void list.refetch()}>
            Try again
          </Button>
        </div>
      ) : list.rows.length === 0 ? (
        <p className="border-t px-5 py-3.5 text-small text-ink-2" data-testid="invites-empty">
          No open invites.
        </p>
      ) : (
        <ul aria-label="Open invites">
          {list.rows.map((invite) => (
            <InviteRow key={invite.id} invite={invite} />
          ))}
          {list.hasNextPage ? <li className="border-t px-5 py-3 text-caption text-ink-3">More invites are open than shown here.</li> : null}
        </ul>
      )}
    </Card>
  )
}

function InviteRow({ invite }: { invite: Invite }) {
  const { data: me } = useMe()
  const qc = useQueryClient()
  const keys = useKeys()
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<{ message: string; ref: string | null } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const locked = revokeLockedReason(me?.role, invite.role)

  const onRevoke = async () => {
    setBusy(true)
    setError(null)
    try {
      await revokeInvite(invite.id)
      toast.success('Invite cancelled', { description: `The link for ${invite.email} no longer works.` })
    } catch (e) {
      if (isApiError(e) && e.status === 409) {
        toast.info('They already joined', { description: `${invite.email} used the link before you cancelled it.` })
        void qc.invalidateQueries({ queryKey: keys.members.list() })
      } else if (isApiError(e) && e.status === 404) {
        // Gone already (another tab or teammate): the re-read below drops the row.
      } else if (isApiError(e) && e.status === 403) {
        setError({ message: 'Only an owner can cancel an owner or reviewer invite.', ref: e.correlationId })
      } else if (!(isApiError(e) && e.status === 401)) {
        toastError(e, 'Couldn’t cancel the invite')
      }
    } finally {
      setBusy(false)
      void qc.invalidateQueries({ queryKey: keys.invites.all() })
    }
  }

  const button = (
    <Button
      ref={buttonRef}
      variant="outline"
      size="sm"
      disabled={busy || !!locked}
      onClick={() => setConfirm(true)}
      aria-label={`Cancel the invite for ${invite.email}`}
      data-testid="invite-revoke"
    >
      {busy ? <Spinner data-icon="inline-start" /> : <Icon name="x" size={16} />}
      {busy ? 'Cancelling…' : 'Cancel invite'}
    </Button>
  )

  return (
    <li className="flex flex-col gap-3 border-t px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between" data-testid="invite-row">
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="truncate text-sm font-medium" title={invite.email} data-testid="invite-email">
            {invite.email}
          </span>
          <Badge variant="muted">{ROLE_INFO[invite.role].label}</Badge>
        </div>
        <p className="mt-0.5 flex items-center gap-1.5 text-caption text-ink-3">
          <Icon name="clock" size={14} />
          <time dateTime={invite.expires_at} title={shortDateTime(invite.expires_at)}>
            Link works until {shortDateTime(invite.expires_at)} ({untilLabel(invite.expires_at)})
          </time>
        </p>
        {error ? (
          <p role="alert" className="mt-1 text-xs text-destructive">
            {error.message} <ReferenceId id={error.ref} />
          </p>
        ) : null}
      </div>
      {locked ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0} className="inline-flex cursor-not-allowed self-start rounded-lg focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none sm:self-auto">
              {button}
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-60">{locked}</TooltipContent>
        </Tooltip>
      ) : (
        <span className="self-start sm:self-auto">{button}</span>
      )}
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent
          onCloseAutoFocus={(e) => {
            if (!buttonRef.current?.isConnected) return
            e.preventDefault()
            buttonRef.current.focus()
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel the invite for {invite.email}?</AlertDialogTitle>
            <AlertDialogDescription>The link stops working right away. You can invite them again later.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void onRevoke()} data-testid="invite-revoke-confirm">
              Cancel invite
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  )
}
