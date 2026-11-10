import { Icon } from '@/components/la/icons'
import type { ErrorItem } from '@/api/types'
import { MARKETPLACE_NAME } from '@/features/listing-flow/format'
import { humanizeSlug } from '@/features/products-add/catalog-model'
import { cn } from '@/lib/utils'

/** Errors before warnings. */
export function sortErrorItems(items: readonly ErrorItem[]) {
  return [...items].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1))
}

/**
 * Renders ErrorItem[] from an ErrorReport (import file errors, import rows, job errors):
 * severity (the code on hover), field, message, suggestion, source, marketplace; value_submitted truncated.
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
    <ul className={cn('divide-y divide-line rounded-lg border border-line bg-card', className)} data-testid="error-report-list">
      {sortErrorItems(items).map((item, i) => {
        const warn = item.severity === 'warning'
        return (
          <li
            key={`${item.error_code}-${item.field}-${i}`}
            className={cn('flex gap-3', dense ? 'px-3 py-2' : 'px-4 py-3')}
            data-severity={item.severity}
            data-code={item.error_code}
          >
            <Icon
              name="alert"
              size={16}
              className={cn('mt-0.5 shrink-0', warn ? 'text-warning' : 'text-destructive')}
            />
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                {/* A plain word leads; the machine code stays on hover for support. */}
                <span
                  className={cn(
                    'rounded px-1.5 py-0.5 text-[11px] font-medium',
                    warn ? 'bg-warning/10 text-warning' : 'bg-destructive/10 text-destructive',
                  )}
                  title={item.error_code}
                >
                  {warn ? 'Warning' : 'Error'}
                </span>
                {item.field ? (
                  <span className="max-w-full truncate font-mono text-muted-foreground" title={item.field}>
                    {item.field}
                  </span>
                ) : null}
                {item.marketplace ? (
                  <span className="text-muted-foreground">· {MARKETPLACE_NAME[item.marketplace] ?? humanizeSlug(item.marketplace)}</span>
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
