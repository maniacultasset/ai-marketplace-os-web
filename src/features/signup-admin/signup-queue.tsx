import { CONCEPT_ICON } from '@/components/la/concept-icons'
import { Icon } from '@/components/la/icons'
import { createContext, useContext, useState } from 'react'
import { columnHelper, DataTable } from '@/components/data-table'
import { EmptyState } from '@/components/states/empty-state'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useSignupQueue } from './api'
import { ApproveDialog } from './approve-dialog'
import {
  displayWebsite,
  initials,
  QUEUE_TAB_LABEL,
  QUEUE_TABS,
  SIGNUP_STATUS_META,
  type QueueTab,
  type SignupRequest,
} from './format'
import { RejectDialog } from './reject-dialog'
import { TimeAgo } from './time'

type Decide = (row: SignupRequest, kind: 'approve' | 'reject') => void
const DecideContext = createContext<Decide>(() => undefined)

const col = columnHelper<SignupRequest>()

const brandColumn = col.accessor('brand_name', {
  header: 'Brand',
  meta: { className: 'min-w-44' },
  cell: (c) => {
    const r = c.row.original
    return (
      <div className="flex min-w-0 flex-col">
        <span className="max-w-64 truncate font-medium" title={r.brand_name} data-testid="signup-row-brand">
          {r.brand_name}
        </span>
        {r.website ? (
          <a
            href={r.website}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="inline-flex max-w-64 items-center gap-1 truncate text-xs text-muted-foreground underline-offset-4 hover:text-brand hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="truncate">{displayWebsite(r.website)}</span>
            <span className="sr-only"> (opens in a new tab)</span>
            <Icon name="external" size={14} />
          </a>
        ) : null}
      </div>
    )
  },
})

const ownerColumn = col.accessor('owner_name', {
  header: 'Owner',
  meta: { className: 'min-w-56' },
  cell: (c) => {
    const r = c.row.original
    return (
      <div className="flex min-w-0 items-center gap-3">
        <Avatar className="hidden size-8 border border-[var(--tile-brand-line)] shadow-raised-sm sm:flex">
          <AvatarFallback className="bg-brand-soft text-[11px] font-semibold text-brand">{initials(r.owner_name, r.email)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <div className="max-w-64 truncate">
            <span className="font-medium">{r.owner_name}</span>
            {r.phone ? <span className="text-muted-foreground"> · {r.phone}</span> : null}
          </div>
          <div className="max-w-64 truncate text-xs text-muted-foreground" title={r.email}>
            {r.email}
          </div>
        </div>
      </div>
    )
  },
})

const requestedColumn = col.accessor('created_at', {
  header: 'Requested',
  meta: { className: 'w-36 whitespace-nowrap' },
  cell: (c) => <TimeAgo iso={c.getValue()} className="text-muted-foreground" />,
})

const statusColumn = col.accessor('status', {
  header: 'Status',
  meta: { className: 'w-40 whitespace-nowrap' },
  cell: (c) => {
    const r = c.row.original
    const meta = SIGNUP_STATUS_META[r.status]
    return (
      <div className="flex flex-col items-start gap-0.5">
        <Badge variant={meta.variant} data-testid="signup-row-status">
          <span className="size-1.5 rounded-full bg-current" aria-hidden />
          {meta.label}
        </Badge>
        {r.decided_at ? <TimeAgo iso={r.decided_at} className="text-xs text-muted-foreground" /> : null}
      </div>
    )
  },
})

const outcomeColumn = col.display({
  id: 'outcome',
  header: 'Outcome',
  meta: { className: 'min-w-48' },
  cell: (c) => {
    const r = c.row.original
    if (r.status === 'approved' && r.tenant_id)
      return (
        <span className="flex min-w-0 flex-col">
          <span className="text-xs text-muted-foreground">Workspace</span>
          <code className="max-w-56 truncate font-mono text-[11px]" title={r.tenant_id}>
            {r.tenant_id}
          </code>
        </span>
      )
    if (r.status === 'rejected' && r.reason)
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0} className="line-clamp-2 max-w-72 rounded-sm text-sm whitespace-normal text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none">
              {r.reason}
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-80 whitespace-pre-wrap">{r.reason}</TooltipContent>
        </Tooltip>
      )
    return <span className="text-muted-foreground">Awaiting review</span>
  },
})

function DecisionButtons({ row }: { row: SignupRequest }) {
  const decide = useContext(DecideContext)
  if (row.status !== 'pending') return null
  return (
    <div className="flex justify-end gap-1.5">
      <Button size="sm" variant="outline" onClick={() => decide(row, 'reject')} data-testid="signup-reject" aria-label={`Reject ${row.brand_name}`}>
        <Icon name="x" size={16} data-icon="inline-start" />
        Reject
      </Button>
      <Button size="sm" onClick={() => decide(row, 'approve')} data-testid="signup-approve" aria-label={`Approve ${row.brand_name}`}>
        <Icon name="check" size={16} data-icon="inline-start" />
        Approve
      </Button>
    </div>
  )
}

const actionsColumn = col.display({
  id: 'actions',
  header: () => <span className="sr-only">Actions</span>,
  meta: { className: 'w-48 text-right' },
  cell: (c) => <DecisionButtons row={c.row.original} />,
})

/** The review queue: who is waiting, oldest first, and the two decisions. */
const PENDING_COLUMNS = col.columns([brandColumn, ownerColumn, requestedColumn, actionsColumn])
/** Decided (or every) request: what was decided and when. */
const HISTORY_COLUMNS = col.columns([brandColumn, ownerColumn, requestedColumn, statusColumn, outcomeColumn, actionsColumn])
const DECIDED_COLUMNS = col.columns([brandColumn, ownerColumn, requestedColumn, statusColumn, outcomeColumn])

const EMPTY: Record<QueueTab, { title: string; description: string }> = {
  pending: { title: 'No requests waiting', description: 'New brand sign-ups appear here, oldest first, for you to approve or reject.' },
  approved: { title: 'No approved requests yet', description: 'Brands you approve appear here with the workspace created for them.' },
  rejected: { title: 'No rejected requests', description: 'Requests you reject appear here with the reason the brand sees.' },
  all: { title: 'No sign-up requests yet', description: 'Brands request access from the public sign-up page.' },
}

export function SignupQueue({ tab, onTabChange }: { tab: QueueTab; onTabChange: (tab: QueueTab) => void }) {
  const list = useSignupQueue(tab)
  const [target, setTarget] = useState<{ row: SignupRequest; kind: 'approve' | 'reject' } | null>(null)
  const [open, setOpen] = useState(false)
  const decide: Decide = (row, kind) => {
    setTarget({ row, kind })
    setOpen(true)
  }
  const close = () => setOpen(false)

  const columns = tab === 'pending' ? PENDING_COLUMNS : tab === 'all' ? HISTORY_COLUMNS : DECIDED_COLUMNS
  const loaded = list.rows.length
  const empty = EMPTY[tab]

  return (
    <DecideContext.Provider value={decide}>
      <DataTable
        label="Sign-up requests"
        list={list}
        columns={columns}
        getRowId={(r) => r.id}
        toolbar={
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Tabs value={tab} onValueChange={(v) => onTabChange(v as QueueTab)}>
              <TabsList aria-label="Filter by status">
                {QUEUE_TABS.map((t) => (
                  <TabsTrigger key={t} value={t} className="px-3 text-[0.8125rem]" data-testid={`signup-tab-${t}`}>
                    {QUEUE_TAB_LABEL[t]}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <span className="text-xs text-muted-foreground tabular-nums" aria-live="polite">
              {list.isPending ? 'Loading…' : `${loaded}${list.hasNextPage ? '+' : ''} ${loaded === 1 ? 'request' : 'requests'} · oldest first`}
            </span>
          </div>
        }
        empty={
          <EmptyState
            compact
            icon={tab === 'pending' ? CONCEPT_ICON.signups : 'inbox'}
            title={empty.title}
            description={empty.description}
            actions={
              tab === 'pending' ? (
                <Button size="sm" variant="outline" onClick={() => onTabChange('all')}>
                  See every request
                </Button>
              ) : null
            }
          />
        }
      />
      <ApproveDialog request={target?.kind === 'approve' ? target.row : null} open={open && target?.kind === 'approve'} onClose={close} />
      <RejectDialog request={target?.kind === 'reject' ? target.row : null} open={open && target?.kind === 'reject'} onClose={close} />
    </DecideContext.Provider>
  )
}
