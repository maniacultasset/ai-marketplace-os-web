import { CONCEPT_ICON } from '@/components/la/concept-icons'
import { IconGlyph } from '@/components/la/icons'
import { useState } from 'react'
import { columnHelper, DataTable } from '@/components/data-table'
import { EmptyState } from '@/components/states/empty-state'
import { Button } from '@/components/ui/button'
import { useCan } from '@/lib/permissions'
import type { CursorList } from '@/hooks/use-cursor-list'
import type { MarketplaceAccount } from './api'
import { accessText, formatDateTime, formatRelative } from './format'
import { MarketplaceMark } from './marketplace-mark'
import { MARKETPLACE_META } from './meta'
import { RevokeDialog } from './revoke-dialog'
import { AccountStatusBadge } from './status-badge'
import { useNow } from './use-now'
import { regionText } from '@/features/marketplaces-settings/model'

const col = columnHelper<MarketplaceAccount>()

const columns = col.columns([
  col.accessor('marketplace', {
    header: 'Marketplace',
    cell: (c) => (
      <span className="flex items-center gap-2.5 font-medium whitespace-nowrap">
        <MarketplaceMark marketplace={c.getValue()} size="sm" />
        {MARKETPLACE_META[c.getValue()].name}
      </span>
    ),
  }),
  col.accessor('seller_id', {
    header: 'Seller',
    cell: (c) => <span className="font-semibold text-ink">{c.getValue()}</span>,
    meta: { className: 'max-w-48 truncate' },
  }),
  col.accessor('status', {
    header: 'Status',
    cell: (c) => {
      const row = c.row.original
      return (
        <span className="flex flex-col items-start gap-1">
          <AccountStatusBadge status={row.status} />
          {row.status === 'needs_reconnect' && row.needs_reconnect_since ? (
            <ReconnectSince iso={row.needs_reconnect_since} />
          ) : null}
        </span>
      )
    },
  }),
  // Never the 1-hour access-token expiry (prod QA 9 Nov, item 19): it renews itself.
  col.display({
    id: 'access',
    header: 'Access',
    cell: (c) =>
      c.row.original.status === 'revoked' ? (
        <span className="text-ink-3">—</span>
      ) : (
        <span className="whitespace-nowrap" data-testid="history-access">
          {accessText(c.row.original.status)}
        </span>
      ),
  }),
  col.accessor('created_at', {
    header: 'Authorized',
    cell: (c) => (
      <time dateTime={c.getValue()} className="whitespace-nowrap">
        {formatDateTime(c.getValue())}
      </time>
    ),
  }),
  col.accessor('region', {
    header: 'Region',
    cell: (c) => regionText(c.row.original),
  }),
  col.display({
    id: 'actions',
    header: () => <span className="sr-only">Actions</span>,
    cell: (c) => <RowActions account={c.row.original} />,
    meta: { className: 'w-px text-right' },
  }),
])

/** "since 5 minutes ago", re-read on the same 30 s tick as the card. */
function ReconnectSince({ iso }: { iso: string }) {
  const now = useNow()
  return (
    <span className="text-xs text-ink-3" title={formatDateTime(iso)} data-testid="reconnect-since">
      since {formatRelative(iso, now)}
    </span>
  )
}

function RowActions({ account }: { account: MarketplaceAccount }) {
  const can = useCan()
  const [open, setOpen] = useState(false)
  if (!can('marketplace:connect') || account.status === 'revoked') return null
  return (
    <>
      <Button
        variant="ghost"
        size="xs"
        onClick={() => setOpen(true)}
        aria-label={`Revoke ${MARKETPLACE_META[account.marketplace].name} seller ${account.seller_id}`}
      >
        <IconGlyph icon={CONCEPT_ICON.revoke} size={16} />
        Revoke
      </Button>
      <RevokeDialog account={account} open={open} onOpenChange={setOpen} />
    </>
  )
}

/** Every account row (all statuses), newest first, with "Load more". */
export function AccountsHistory({ list }: { list: CursorList<MarketplaceAccount> }) {
  return (
    <DataTable
      label="Marketplace connection history"
      list={list}
      columns={columns}
      getRowId={(a) => a.id}
      skeletonRows={3}
      stickyHeader={false}
      renderCard={(a) => <HistoryCard account={a} />}
      empty={
        <EmptyState
          compact
          icon="clock"
          title="No connections yet"
          description="Every connection you make, including revoked ones, is listed here."
        />
      }
    />
  )
}

/** Below 1024px each row is a card (hi-fi build notes). */
function HistoryCard({ account }: { account: MarketplaceAccount }) {
  return (
    <div className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4 shadow-raised-md" data-testid="history-card">
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2.5 font-semibold">
          <MarketplaceMark marketplace={account.marketplace} size="sm" />
          <span className="truncate">{MARKETPLACE_META[account.marketplace].name}</span>
        </span>
        <AccountStatusBadge status={account.status} />
      </div>
      <dl className="grid grid-cols-[110px_minmax(0,1fr)] gap-x-3 gap-y-1 text-small">
        <dt className="text-ink-3">Seller</dt>
        <dd className="truncate">{account.seller_id}</dd>
        <dt className="text-ink-3">Authorized</dt>
        <dd>{formatDateTime(account.created_at)}</dd>
        {account.status !== 'revoked' ? (
          <>
            <dt className="text-ink-3">Access</dt>
            <dd>{accessText(account.status)}</dd>
          </>
        ) : null}
      </dl>
      <div className="flex justify-end empty:hidden">
        <RowActions account={account} />
      </div>
    </div>
  )
}
