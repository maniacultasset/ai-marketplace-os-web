import { Clock } from 'lucide-react'
import { EmptyState } from './empty-state'

/** Neutral state for 501 NOT_IMPLEMENTED (never red). */
export function NotAvailableYet({
  title = 'Not available yet',
  description = 'This feature is not available on this server yet.',
  compact,
}: {
  title?: string
  description?: string
  compact?: boolean
}) {
  return <EmptyState icon={Clock} title={title} description={description} compact={compact} />
}
