import { Badge } from '@/components/ui/badge'
import type { AccountStatus } from './api'
import { STATUS_META } from './meta'

function Dot() {
  return <span aria-hidden className="size-1.5 rounded-full bg-current" />
}

export function AccountStatusBadge({ status }: { status: AccountStatus }) {
  const m = STATUS_META[status]
  return (
    <Badge variant={m.variant} data-status={status} data-testid="account-status">
      <Dot />
      {m.label}
    </Badge>
  )
}

/** Same shape as the account badge, for a marketplace with no live account. */
export function NotConnectedBadge() {
  return (
    <Badge variant="muted" data-status="none" data-testid="account-status">
      <Dot />
      Not connected
    </Badge>
  )
}
