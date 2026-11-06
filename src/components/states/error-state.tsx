import { describeError, isApiError, isNetworkError, isNotImplemented } from '@/api/errors'
import { CONCEPT_ICON } from '@/components/la/concept-icons'
import { Icon, IconTile } from '@/components/la/icons'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { NotAvailableYet } from './not-available-yet'
import { ReferenceId } from './reference-id'

/**
 * Inline error for a failed query: plain sentence, X-Request-ID reference, Try again.
 * 501 renders <NotAvailableYet/> instead (never a red error).
 */
export function ErrorState({
  error,
  onRetry,
  title,
  className,
  compact,
}: {
  error: unknown
  onRetry?: () => void
  title?: string
  className?: string
  compact?: boolean
}) {
  if (isNotImplemented(error)) return <NotAvailableYet compact={compact} />
  const offline = isNetworkError(error)
  const ref = isApiError(error) ? error.correlationId : null
  return (
    <div
      role="alert"
      data-slot="error-state"
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'gap-2 px-4 py-8' : 'gap-3 px-6 py-12',
        className,
      )}
    >
      <IconTile icon={offline ? CONCEPT_ICON.offline : 'alert'} tone="fail" size={compact ? 'md' : 'lg'} />
      <div className="max-w-sm space-y-1">
        <h3 className="font-display text-h3 text-balance text-ink">
          {title ?? (offline ? "Can't reach the server" : "We couldn't load this")}
        </h3>
        <p className="text-small text-pretty text-ink-2">{describeError(error)}</p>
      </div>
      <ReferenceId id={ref} />
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          <Icon name="refresh" size={16} data-icon="inline-start" />
          Try again
        </Button>
      ) : null}
    </div>
  )
}
