import { Badge } from '@/components/ui/badge'
import type { TenantOut } from './profile-model'

const STATUS: Record<TenantOut['status'], { label: string; variant: 'brand' | 'success' | 'danger' | 'muted' }> = {
  trial: { label: 'Trial', variant: 'brand' },
  active: { label: 'Active', variant: 'success' },
  suspended: { label: 'Suspended', variant: 'danger' },
  offboarded: { label: 'Offboarded', variant: 'muted' },
}

/** The tenant's lifecycle status from GET /tenants/me. */
export function TenantStatusBadge({ status }: { status: TenantOut['status'] }) {
  const s = STATUS[status]
  return (
    <Badge variant={s.variant} data-testid="brand-status" data-status={status}>
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {s.label}
    </Badge>
  )
}
