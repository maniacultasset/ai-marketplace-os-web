/**
 * /admin/brands: every brand with its status and trial end, and the two recovery actions a
 * platform admin has over HTTP (Activate, Extend trial; tenants-model.ts). Both need a reason,
 * which goes to the audit log with the admin's email.
 */
import { useIsFetching, useQueryClient } from '@tanstack/react-query'
import { createContext, useContext, useId, useState } from 'react'
import { isApiError } from '@/api/errors'
import { api, unwrap } from '@/api/client'
import { columnHelper, DataTable } from '@/components/data-table'
import { Icon } from '@/components/la/icons'
import { EmptyState } from '@/components/states/empty-state'
import { ReferenceId } from '@/components/states/reference-id'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { PAGE_SIZE, useCursorList } from '@/hooks/use-cursor-list'
import { useKeys } from '@/lib/query-keys'
import { toast } from '@/lib/toast'
import { digitsOnly, filterInput } from '@/lib/validation'
import {
  canActivate,
  canExtend,
  checkReason,
  dayLabel,
  EXTEND_DAYS_MAX,
  EXTEND_DAYS_MIN,
  EXTEND_DAYS_SUGGESTED,
  extendedTrialEnd,
  parseExtendDays,
  REASON_MAX,
  recoveryError,
  TENANT_TABS,
  TENANT_STATUS_META,
  trialEndLabel,
  type RecoveryKind,
  type TenantAdmin,
  type TenantStatus,
  type TenantTab,
} from './tenants-model'
import { TimeAgo } from './time'

const TAB_LABEL: Record<TenantTab, string> = { all: 'All brands', trial: 'On trial', suspended: 'Suspended' }
const TAB_STATUS: Record<TenantTab, TenantStatus | null> = { all: null, trial: 'trial', suspended: 'suspended' }
const EMPTY: Record<TenantTab, { title: string; description: string }> = {
  all: { title: 'No brands yet', description: 'Brands appear here once a sign-up is approved.' },
  trial: { title: 'No brands on trial', description: 'Brands you approve start on a trial and appear here.' },
  suspended: { title: 'No suspended brands', description: 'A brand whose trial ran out appears here, ready to activate or extend.' },
}

function useTenants(tab: TenantTab) {
  const keys = useKeys()
  const status = TAB_STATUS[tab]
  return useCursorList<TenantAdmin>({
    queryKey: keys.adminTenants.list(status),
    fetchPage: (cursor) =>
      unwrap(api.GET('/admin/tenants', { params: { query: { limit: PAGE_SIZE, ...(status ? { status } : {}), ...(cursor ? { cursor } : {}) } } })),
  })
}

type Kind = RecoveryKind
type Open = (row: TenantAdmin, kind: Kind) => void
const OpenContext = createContext<Open>(() => undefined)

const col = columnHelper<TenantAdmin>()
const columns = col.columns([
  col.accessor('name', {
    header: 'Brand',
    meta: { className: 'min-w-48' },
    cell: (c) => (
      <div className="flex min-w-0 flex-col">
        <span className="max-w-64 truncate font-medium" title={c.row.original.name} data-testid="tenant-row-name">
          {c.row.original.name}
        </span>
        <span className="max-w-64 truncate font-mono text-xs text-muted-foreground">{c.row.original.slug}</span>
      </div>
    ),
  }),
  col.accessor('status', {
    header: 'Status',
    meta: { className: 'w-48 whitespace-nowrap' },
    cell: (c) => {
      const t = c.row.original
      const meta = TENANT_STATUS_META[t.status]
      const end = trialEndLabel(t)
      return (
        <div className="flex flex-col items-start gap-0.5">
          <Badge variant={meta.variant} data-testid="tenant-row-status">
            <span className="size-1.5 rounded-full bg-current" aria-hidden />
            {meta.label}
          </Badge>
          {end ? (
            <span className="text-xs text-muted-foreground tabular-nums" data-testid="tenant-row-trial">
              Trial {end.charAt(0).toLowerCase() + end.slice(1)}
            </span>
          ) : null}
        </div>
      )
    },
  }),
  col.accessor('created_at', {
    header: 'Created',
    meta: { className: 'w-36 whitespace-nowrap' },
    cell: (c) => <TimeAgo iso={c.getValue()} className="text-muted-foreground" />,
  }),
  col.display({
    id: 'actions',
    header: () => <span className="sr-only">Actions</span>,
    meta: { className: 'w-64 text-right' },
    cell: (c) => <Actions row={c.row.original} />,
  }),
])

function Actions({ row }: { row: TenantAdmin }) {
  const open = useContext(OpenContext)
  if (!canActivate(row.status) && !canExtend(row.status)) return null
  return (
    <div className="flex justify-end gap-1.5">
      {canExtend(row.status) ? (
        <Button size="sm" variant="outline" onClick={() => open(row, 'extend')} aria-label={`Extend the trial of ${row.name}`} data-testid="tenant-extend">
          <Icon name="clock" size={16} data-icon="inline-start" />
          Extend trial
        </Button>
      ) : null}
      {canActivate(row.status) ? (
        <Button size="sm" onClick={() => open(row, 'activate')} aria-label={`Activate ${row.name}`} data-testid="tenant-activate">
          <Icon name="check" size={16} data-icon="inline-start" />
          Activate
        </Button>
      ) : null}
    </div>
  )
}

export function TenantsTable({ tab, onTabChange }: { tab: TenantTab; onTabChange: (tab: TenantTab) => void }) {
  const list = useTenants(tab)
  const [target, setTarget] = useState<{ row: TenantAdmin; kind: Kind } | null>(null)
  const [open, setOpen] = useState(false)
  const loaded = list.rows.length
  return (
    <OpenContext.Provider
      value={(row, kind) => {
        setTarget({ row, kind })
        setOpen(true)
      }}
    >
      <DataTable
        label="Brands"
        list={list}
        columns={columns}
        getRowId={(r) => r.id}
        toolbar={
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Tabs value={tab} onValueChange={(v) => onTabChange(v as TenantTab)}>
              <TabsList aria-label="Filter brands">
                {TENANT_TABS.map((t) => (
                  <TabsTrigger key={t} value={t} className="px-3 text-[0.8125rem]" data-testid={`tenant-tab-${t}`}>
                    {TAB_LABEL[t]}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <span className="text-xs text-muted-foreground tabular-nums" aria-live="polite">
              {list.isPending ? 'Loading…' : `${loaded}${list.hasNextPage ? '+' : ''} ${loaded === 1 ? 'brand' : 'brands'} · newest first`}
            </span>
          </div>
        }
        empty={
          <EmptyState
            compact
            icon="store"
            title={EMPTY[tab].title}
            description={EMPTY[tab].description}
            actions={
              tab !== 'all' ? (
                <Button size="sm" variant="outline" onClick={() => onTabChange('all')}>
                  See every brand
                </Button>
              ) : null
            }
          />
        }
      />
      <RecoveryDialog target={target} open={open} onClose={() => setOpen(false)} />
    </OpenContext.Provider>
  )
}

function RecoveryDialog({ target, open, onClose }: { target: { row: TenantAdmin; kind: Kind } | null; open: boolean; onClose: () => void }) {
  const [busy, setBusy] = useState(false)
  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-md" data-testid="tenant-dialog" showCloseButton={!busy}>
        {/* Radix unmounts the content when closed, so each opening starts with a fresh form. */}
        {target ? <RecoveryBody key={`${target.row.id}:${target.kind}`} target={target} onClose={onClose} busy={busy} setBusy={setBusy} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function RecoveryBody({
  target,
  onClose,
  busy,
  setBusy,
}: {
  target: { row: TenantAdmin; kind: Kind }
  onClose: () => void
  busy: boolean
  setBusy: (busy: boolean) => void
}) {
  const qc = useQueryClient()
  const keys = useKeys()
  const daysId = useId()
  const reasonId = useId()
  const [days, setDays] = useState(String(EXTEND_DAYS_SUGGESTED))
  const [reason, setReason] = useState('')
  const [touched, setTouched] = useState(false)
  const [error, setError] = useState<{ message: string; ref: string | null } | null>(null)

  const { row, kind } = target
  const parsedDays = parseExtendDays(days)
  const reasonCheck = checkReason(reason)
  const showDaysError = kind === 'extend' && touched && parsedDays === 'invalid'
  const showReasonError = touched && !reasonCheck.ok
  const newEnd = kind === 'extend' && parsedDays !== 'invalid' ? extendedTrialEnd(row, parsedDays) : null

  const onConfirm = async () => {
    setTouched(true)
    if (!reasonCheck.ok || (kind === 'extend' && parsedDays === 'invalid')) return
    setBusy(true)
    setError(null)
    try {
      const path = { params: { path: { target_tenant_id: row.id } } }
      const out =
        kind === 'activate'
          ? await unwrap(api.POST('/admin/tenants/{target_tenant_id}/activate', { ...path, body: { reason: reasonCheck.value } }))
          : await unwrap(api.POST('/admin/tenants/{target_tenant_id}/extend-trial', { ...path, body: { reason: reasonCheck.value, days: parsedDays as number } }))
      void qc.invalidateQueries({ queryKey: keys.adminTenants.all() })
      const end = trialEndLabel(out)
      toast.success(kind === 'activate' ? `${out.name} is active` : `${out.name} is on trial again`, {
        description: kind === 'activate' ? 'Its members can sign in again.' : `Trial ${end ? end.toLowerCase() : 'extended'}. Its members can sign in again.`,
      })
      onClose()
    } catch (e) {
      if (isApiError(e) && (e.status === 404 || e.status === 409)) void qc.invalidateQueries({ queryKey: keys.adminTenants.all() })
      if (isApiError(e) && e.status === 401) return
      setError({ message: recoveryError(e, kind), ref: isApiError(e) ? e.correlationId : null })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
        <DialogHeader>
          <DialogTitle>{kind === 'activate' ? `Activate ${row.name}?` : `Extend the trial of ${row.name}?`}</DialogTitle>
          <DialogDescription>
            {kind === 'activate'
              ? 'The brand becomes active, so its trial end no longer stops it. Its members sign in again themselves.'
              : row.status === 'trial'
                ? 'The trial gets more days, counted from its current end (or from today, if that has passed).'
                : 'A brand stopped by its trial ending goes back to trial, counted from today. Its members sign in again.'}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {kind === 'extend' ? (
            <Field data-invalid={showDaysError || undefined}>
              <FieldLabel htmlFor={daysId}>Days to add</FieldLabel>
              <div className="flex items-center gap-2">
                <Input
                  id={daysId}
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={2}
                  className="w-24 tabular-nums"
                  value={days}
                  {...filterInput({ onChange: (e) => setDays(e.target.value) }, digitsOnly)}
                  aria-invalid={showDaysError}
                  aria-describedby={`${daysId}-hint`}
                  disabled={busy}
                  data-testid="tenant-days"
                />
                <span className="text-sm text-muted-foreground">days</span>
              </div>
              <div id={`${daysId}-hint`}>
                {showDaysError ? (
                  <FieldError>
                    Enter a whole number of days from {EXTEND_DAYS_MIN} to {EXTEND_DAYS_MAX}.
                  </FieldError>
                ) : (
                  <FieldDescription className="text-xs tabular-nums" data-testid="tenant-new-end">
                    {newEnd
                      ? `New trial end: ${dayLabel(newEnd)}.`
                      : `From ${EXTEND_DAYS_MIN} to ${EXTEND_DAYS_MAX} days.`}
                  </FieldDescription>
                )}
              </div>
            </Field>
          ) : null}
          <Field data-invalid={showReasonError || undefined}>
            <FieldLabel htmlFor={reasonId}>Reason</FieldLabel>
            <Textarea
              id={reasonId}
              rows={3}
              maxLength={REASON_MAX}
              placeholder={kind === 'activate' ? 'Paid plan started' : 'Brand asked for more time to finish set-up'}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              aria-invalid={showReasonError}
              aria-describedby={`${reasonId}-hint`}
              disabled={busy}
              data-testid="tenant-reason"
            />
            <div id={`${reasonId}-hint`}>
              {showReasonError && !reasonCheck.ok ? (
                <FieldError>{reasonCheck.message}</FieldError>
              ) : (
                <FieldDescription className="text-xs">Saved in the audit log with your email.</FieldDescription>
              )}
            </div>
          </Field>
          {error ? (
            <div role="alert" className="flex flex-col gap-1 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2" data-testid="tenant-error">
              <span className="text-sm text-destructive">{error.message}</span>
              <ReferenceId id={error.ref} />
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void onConfirm()} disabled={busy} data-testid="tenant-confirm">
            {busy ? <Spinner data-icon="inline-start" /> : null}
            {busy ? 'Saving…' : kind === 'activate' ? 'Activate brand' : 'Extend trial'}
          </Button>
        </DialogFooter>
    </>
  )
}

export function TenantsRefreshButton() {
  const qc = useQueryClient()
  const keys = useKeys()
  const fetching = useIsFetching({ queryKey: keys.adminTenants.all() }) > 0
  return (
    <Button variant="outline" size="sm" onClick={() => void qc.invalidateQueries({ queryKey: keys.adminTenants.all() })} disabled={fetching}>
      {fetching ? <Spinner data-icon="inline-start" /> : <Icon name="refresh" size={16} data-icon="inline-start" />}
      Refresh
    </Button>
  )
}
