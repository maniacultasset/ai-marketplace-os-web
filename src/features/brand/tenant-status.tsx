import { Badge } from '@/components/ui/badge'
import { trialDaysLeft } from '@/features/ai-credit/model'
import type { TenantOut } from './profile-model'

const STATUS: Record<TenantOut['status'], { label: string; variant: 'brand' | 'success' | 'danger' | 'muted' }> = {
  trial: { label: 'Trial', variant: 'brand' },
  active: { label: 'Active', variant: 'success' },
  suspended: { label: 'Suspended', variant: 'danger' },
  offboarded: { label: 'Offboarded', variant: 'muted' },
}

/** The tenant's lifecycle status from GET /tenants/me; a trial says its days left when `trial_ends_at` is sent. */
export function TenantStatusBadge({ status, trialEndsAt }: { status: TenantOut['status']; trialEndsAt?: string | null }) {
  const s = STATUS[status]
  const days = status === 'trial' ? trialDaysLeft(trialEndsAt) : null
  const label = days === null ? s.label : days === 0 ? 'Trial ends today' : `Trial · ${days} ${days === 1 ? 'day' : 'days'} left`
  return (
    <Badge variant={s.variant} data-testid="brand-status" data-status={status}>
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {label}
    </Badge>
  )
}
