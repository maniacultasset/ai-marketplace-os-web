import { AlertCircle, TriangleAlert } from 'lucide-react'
import type { ErrorItem } from '@/api/types'
import { cn } from '@/lib/utils'

/** Errors before warnings. */
export function sortErrorItems(items: readonly ErrorItem[]) {
  return [...items].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1))
}

/**
 * Renders ErrorItem[] from an ErrorReport (import file errors, import rows, job errors):
 * severity, field, code, message, suggestion, source, marketplace; value_submitted truncated.
 */
export function ErrorReportList({
  items,
  className,
  dense,
}: {
  items: readonly ErrorItem[]
  className?: string
  dense?: boolean
}) {
  if (!items.length) return null
  return (
    <ul className={cn('divide-y rounded-lg border bg-card', className)} data-testid="error-report-list">
      {sortErrorItems(items).map((item, i) => {
        const warn = item.severity === 'warning'
        const Icon = warn ? TriangleAlert : AlertCircle
        return (
          <li
            key={`${item.error_code}-${item.field}-${i}`}
            className={cn('flex gap-3', dense ? 'px-3 py-2' : 'px-4 py-3')}
            data-severity={item.severity}
            data-code={item.error_code}
          >
            <Icon
              className={cn('mt-0.5 size-4 shrink-0', warn ? 'text-warning' : 'text-destructive')}
              aria-label={warn ? 'Warning' : 'Error'}
            />
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                <code
                  className={cn(
                    'rounded px-1.5 py-0.5 font-mono text-[11px] font-medium',
                    warn ? 'bg-warning/10 text-warning' : 'bg-destructive/10 text-destructive',
                  )}
                >
                  {item.error_code}
                </code>
                <span className="font-mono text-muted-foreground">{item.field}</span>
                {item.marketplace ? (
                  <span className="text-muted-foreground capitalize">· {item.marketplace}</span>
                ) : null}
                {item.source ? <span className="text-muted-foreground">· {item.source.replace(/_/g, ' ')}</span> : null}
              </div>
              <p className="text-sm break-words">{item.message}</p>
              {item.value_submitted ? (
                <p className="truncate font-mono text-xs text-muted-foreground" title={item.value_submitted}>
                  Value: {item.value_submitted}
                </p>
              ) : null}
              {item.suggestion ? <p className="text-xs text-muted-foreground">{item.suggestion}</p> : null}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
