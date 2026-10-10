import { AlertTriangle, RotateCw, WifiOff } from 'lucide-react'
import { describeError, isApiError, isNetworkError, isNotImplemented } from '@/api/errors'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { NotAvailableYet } from './not-available-yet'
import { ReferenceId } from './reference-id'

/**
 * Inline error for a failed query: plain sentence, X-Request-ID reference, Retry.
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
  const Icon = offline ? WifiOff : AlertTriangle
  const ref = isApiError(error) ? error.correlationId : null
  return (
    <div
      role="alert"
      data-slot="error-state"
      className={cn(
        'flex flex-col items-center justify-center gap-3 text-center',
        compact ? 'px-4 py-8' : 'px-6 py-16',
        className,
      )}
    >
      <div className="flex size-10 items-center justify-center rounded-lg border border-destructive/20 bg-destructive/5 text-destructive">
        <Icon className="size-5" aria-hidden />
      </div>
      <div className="max-w-md space-y-1">
        <h3 className="text-sm font-medium">{title ?? (offline ? "Can't reach the server" : 'Something went wrong')}</h3>
        <p className="text-sm text-muted-foreground">{describeError(error)}</p>
      </div>
      <ReferenceId id={ref} />
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCw data-icon="inline-start" />
          Retry
        </Button>
      ) : null}
    </div>
  )
}
