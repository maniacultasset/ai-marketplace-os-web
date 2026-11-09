import { useQuery } from '@tanstack/react-query'
import { Icon } from '@/components/la/icons'
import { useRef, useState, type ReactNode } from 'react'
import { isApiError } from '@/api/errors'
import type { Role } from '@/api/types'
import { columnHelper, DataTable } from '@/components/data-table'
import { EmptyState } from '@/components/states/empty-state'
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
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useMe } from '@/lib/auth'
import { allows } from '@/lib/permissions'
import { useKeys } from '@/lib/query-keys'
import { securityQueryOptions } from '@/features/mfa/api'
import { cn } from '@/lib/utils'
import { resetLinkReason } from './access-model'
import { ResetLinkDialog } from './reset-link-dialog'
import { initials, memberGating, OWNER_ONLY_REASON, ROLE_INFO, type Member } from './roles'
import { inlineMemberError, useIsLatestMemberMutation, useMemberRowPending, useMembersList, useUpdateMember } from './use-members'

function Locked({ reason, children }: { reason: string | null; children: ReactNode }) {
  if (!reason) return children
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="inline-flex cursor-not-allowed rounded-lg focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-60">{reason}</TooltipContent>
    </Tooltip>
  )
}

/**
 * The confirm dialogs open from state (no AlertDialogTrigger), so Radix has nowhere to send
 * focus on close. Return it to the control that opened the dialog.
 */
function returnFocus(e: Event, el: HTMLElement | null) {
  if (!el || !el.isConnected) return
  e.preventDefault()
  el.focus()
}

function InlineError({ userId, error, submittedAt }: { userId: string; error: unknown; submittedAt: number }) {
  const latest = useIsLatestMemberMutation(userId, submittedAt)
  const message = inlineMemberError(error)
  if (!message || !latest) return null
  return (
    <div role="alert" className="flex max-w-48 flex-col gap-0.5 whitespace-normal" data-testid="member-error">
      <span className="text-xs text-destructive">{message}</span>
      {isApiError(error) ? <ReferenceId id={error.correlationId} className="max-w-full text-[11px] [&_code]:min-w-0 [&_code]:truncate" /> : null}
    </div>
  )
}

function MemberCell({ member }: { member: Member }) {
  const { data: me } = useMe()
  const isSelf = member.user_id === me?.user_id
  return (
    <div className="flex min-h-8 min-w-0 items-center gap-3">
      <Avatar className="hidden size-8 border border-line shadow-raised-sm sm:flex">
        <AvatarFallback
          className={cn(
            'text-[11px] font-semibold transition-colors duration-150',
            member.is_active ? 'bg-brand-soft text-brand' : 'bg-muted text-muted-foreground',
          )}
        >
          {initials(member.display_name ?? member.email)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cn('truncate font-medium', !member.is_active && 'text-muted-foreground')}
            title={member.email}
            data-testid="member-email"
          >
            {member.email}
          </span>
          {isSelf ? (
            <Badge variant="brand" className="h-[1.125rem] px-1.5 text-[0.6875rem]" data-testid="you-badge">
              You
            </Badge>
          ) : null}
        </div>
        {member.display_name ? <div className="truncate text-xs text-muted-foreground">{member.display_name}</div> : null}
      </div>
    </div>
  )
}

function RoleCell({ member }: { member: Member }) {
  const { data: me } = useMe()
  const update = useUpdateMember(member, me?.user_id)
  const rowPending = useMemberRowPending(member.user_id)
  const [confirmRole, setConfirmRole] = useState<Role | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  if (!me) return null
  const g = memberGating(me, member)

  const pick = (value: string) => {
    const role = value as Role
    if (role === member.role) return
    update.reset()
    if (g.isSelf) setConfirmRole(role)
    else update.mutate({ role })
  }
  const losesTeam = confirmRole ? !allows(confirmRole, 'team:manage') : false

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex min-h-8 items-center gap-2">
        <Locked reason={g.canEditRole ? null : g.roleLockedReason}>
          <Select value={member.role} onValueChange={pick} disabled={!g.canEditRole || rowPending}>
            <SelectTrigger ref={triggerRef} size="sm" className="w-[6.5rem] bg-card sm:w-36" aria-label={`Role for ${member.email}`} data-testid="role-select">
              {g.canEditRole ? null : <Icon name="lock" size={14} className="text-muted-foreground" />}
              <SelectValue>{ROLE_INFO[member.role].label}</SelectValue>
            </SelectTrigger>
            <SelectContent align="start" className="w-72 p-1">
              {g.roleOptions.map((r) => (
                <SelectItem key={r} value={r} textValue={ROLE_INFO[r].label}>
                  <div className="flex flex-col gap-0.5 py-0.5">
                    <span className="font-medium">{ROLE_INFO[r].label}</span>
                    <span className="text-xs whitespace-normal text-muted-foreground">{ROLE_INFO[r].summary}</span>
                  </div>
                </SelectItem>
              ))}
              {me.role !== 'owner' ? <p className="px-2 pt-1.5 pb-1 text-xs text-muted-foreground" data-testid="role-owner-only-note">{OWNER_ONLY_REASON}</p> : null}
            </SelectContent>
          </Select>
        </Locked>
        {update.isPending ? <Spinner className="size-3.5 text-muted-foreground" aria-label="Saving role" /> : null}
      </div>
      {update.isError ? <InlineError userId={member.user_id} error={update.error} submittedAt={update.submittedAt} /> : null}
      <AlertDialog open={!!confirmRole} onOpenChange={(o) => !o && setConfirmRole(null)}>
        <AlertDialogContent onCloseAutoFocus={(e) => returnFocus(e, triggerRef.current)}>
          <AlertDialogHeader>
            <AlertDialogTitle>Change your own role to {confirmRole ? ROLE_INFO[confirmRole].label : ''}?</AlertDialogTitle>
            <AlertDialogDescription>
              {losesTeam
                ? 'You will lose access to this page and to managing the team. Only another owner can change it back.'
                : 'Your permissions in this brand change on your next request.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmRole) update.mutate({ role: confirmRole })
                setConfirmRole(null)
              }}
            >
              Change role
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function StatusCell({ member, showLabel = false }: { member: Member; showLabel?: boolean }) {
  const { data: me } = useMe()
  const update = useUpdateMember(member, me?.user_id)
  const rowPending = useMemberRowPending(member.user_id)
  const [confirmOff, setConfirmOff] = useState(false)
  const switchRef = useRef<HTMLButtonElement>(null)
  if (!me) return null
  const g = memberGating(me, member)

  const toggle = (next: boolean) => {
    update.reset()
    if (!next) setConfirmOff(true)
    else update.mutate({ is_active: true })
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex min-h-8 items-center gap-2.5">
        <Locked reason={g.canToggleActive ? null : g.activeLockedReason}>
          <Switch
            ref={switchRef}
            checked={member.is_active}
            onCheckedChange={toggle}
            disabled={!g.canToggleActive || rowPending}
            aria-label={`Active: ${member.email}`}
            data-testid="active-switch"
          />
        </Locked>
        <span
          className={cn(showLabel ? 'inline w-14 text-sm' : 'hidden w-14 text-sm sm:inline', member.is_active ? 'text-foreground' : 'text-muted-foreground')}
          data-testid="member-status"
        >
          {member.is_active ? 'Active' : 'Inactive'}
        </span>
        {update.isPending ? <Spinner className="size-3.5 text-muted-foreground" aria-label="Saving status" /> : null}
      </div>
      {update.isError ? <InlineError userId={member.user_id} error={update.error} submittedAt={update.submittedAt} /> : null}
      <AlertDialog open={confirmOff} onOpenChange={setConfirmOff}>
        <AlertDialogContent onCloseAutoFocus={(e) => returnFocus(e, switchRef.current)}>
          <AlertDialogHeader>
            <AlertDialogTitle>{g.isSelf ? 'Deactivate yourself?' : `Deactivate ${member.email}?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {g.isSelf
                ? 'You will be signed out of this brand and cannot sign back in to it until an owner or admin reactivates you.'
                : 'They are signed out of this brand right away and cannot sign in to it until reactivated. Their work stays in place.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => update.mutate({ is_active: false })}>
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/** Whether everyone signs in with a login code (GET /auth/security `enforcement`): reset links need it. */
function useEnforcement() {
  const keys = useKeys()
  return useQuery(securityQueryOptions(keys.security())).data?.enforcement
}

function ResetCell({ member }: { member: Member }) {
  const { data: me } = useMe()
  const enforcement = useEnforcement()
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  if (!me) return null
  const reason = resetLinkReason(me, member, enforcement)
  return (
    <div className="flex min-h-8 items-center">
      <Locked reason={reason}>
        <Button
          ref={buttonRef}
          variant="outline"
          size="sm"
          disabled={!!reason}
          onClick={() => setOpen(true)}
          aria-label={`Make a password reset link for ${member.email}`}
          data-testid="reset-link-button"
        >
          <Icon name="lock" size={16} />
          Reset link
        </Button>
      </Locked>
      <ResetLinkDialog member={member} open={open} onClose={() => setOpen(false)} />
    </div>
  )
}

const col = columnHelper<Member>()
const columns = col.columns([
  col.accessor('email', { header: 'Member', meta: { className: 'w-full max-w-0 align-top py-3 sm:pl-4' }, cell: (c) => <MemberCell member={c.row.original} /> }),
  col.accessor('role', { header: 'Role', meta: { className: 'sm:w-40 align-top py-3' }, cell: (c) => <RoleCell member={c.row.original} /> }),
  col.accessor('is_active', {
    header: 'Status',
    meta: { className: 'sm:w-36 align-top py-3' },
    cell: (c) => <StatusCell member={c.row.original} />,
  }),
  col.display({
    id: 'password',
    header: 'Password',
    meta: { className: 'sm:w-36 align-top py-3 sm:pr-4' },
    cell: (c) => <ResetCell member={c.row.original} />,
  }),
])

/** One member below xl: the table needs about 790px, more than /team has beside the two navs. */
function MemberCard({ member }: { member: Member }) {
  return (
    <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 shadow-raised-md" data-testid="member-card">
      <MemberCell member={member} />
      <div className="flex flex-wrap items-start gap-x-5 gap-y-3">
        <RoleCell member={member} />
        <StatusCell member={member} showLabel />
        <ResetCell member={member} />
      </div>
    </div>
  )
}

function MemberCardSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 shadow-raised-md">
      <Skeleton className="h-4 w-2/3" />
      <div className="flex gap-4">
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-28" />
      </div>
    </div>
  )
}

export function MembersTable() {
  const list = useMembersList()
  const loaded = list.rows.length
  const active = list.rows.filter((m) => m.is_active).length
  return (
    <DataTable
      label="Team members"
      list={list}
      columns={columns}
      getRowId={(m) => m.user_id}
      skeletonRows={4}
      renderCard={(m) => <MemberCard member={m} />}
      renderCardSkeleton={() => <MemberCardSkeleton />}
      cardBreakpoint="xl"
      toolbar={
        list.data ? (
          <p className="text-right text-xs text-muted-foreground tabular-nums" data-testid="members-count">
            {loaded} {loaded === 1 ? 'member' : 'members'}
            {list.hasNextPage ? ' loaded' : ''} · {active} active
          </p>
        ) : null
      }
      empty={<EmptyState icon="users" title="No members" description="Nobody has access to this brand yet." compact />}
    />
  )
}
