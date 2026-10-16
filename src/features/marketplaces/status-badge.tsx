import { StatusChip } from '@/components/la/status-chip'
import type { AccountStatus } from './api'
import { STATUS_META } from './meta'

export function AccountStatusBadge({ status }: { status: AccountStatus }) {
  const m = STATUS_META[status]
  return (
    <span data-status={status} data-testid="account-status" className="inline-flex">
      <StatusChip status={m.chip}>{m.label}</StatusChip>
    </span>
  )
}

/** Same shape as the account chip, for a marketplace with no live account. */
export function NotConnectedBadge() {
  return (
    <span data-status="none" data-testid="account-status" className="inline-flex">
      <StatusChip status="not-listed">{STATUS_META.none.label}</StatusChip>
    </span>
  )
}
