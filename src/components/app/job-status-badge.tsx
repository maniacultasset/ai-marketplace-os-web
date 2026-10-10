import type { JobState } from '@/api/types'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const MAP: Record<JobState, { label: string; variant: 'muted' | 'brand' | 'success' | 'warning' | 'danger' }> = {
  queued: { label: 'Queued', variant: 'muted' },
  running: { label: 'Running', variant: 'brand' },
  succeeded: { label: 'Completed', variant: 'success' },
  partial: { label: 'Completed with failures', variant: 'warning' },
  failed: { label: 'Failed', variant: 'danger' },
  cancelled: { label: 'Cancelled', variant: 'muted' },
  dead_letter: { label: 'Failed permanently', variant: 'danger' },
}

function Dot({ live }: { live?: boolean }) {
  return <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full bg-current', live && 'motion-safe:animate-pulse')} />
}

/** Status pill for a JobEnvelope.status. Leading 6px dot per DESIGN.md. */
export function JobStatusBadge({ status }: { status: JobState | undefined }) {
  if (!status) {
    return (
      <Badge variant="muted">
        <Dot /> Unknown
      </Badge>
    )
  }
  const m = MAP[status]
  return (
    <Badge variant={m.variant} data-status={status}>
      <Dot live={status === 'running' || status === 'queued'} />
      {m.label}
    </Badge>
  )
}
