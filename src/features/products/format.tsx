import { format, formatDistanceToNowStrict } from 'date-fns'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { Product } from './api'

export function StatusBadge({ status }: { status: Product['status'] }) {
  return (
    <Badge variant={status === 'active' ? 'success' : 'muted'} className="capitalize" data-testid="product-status">
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {status}
    </Badge>
  )
}

export function absoluteTime(iso: string) {
  return format(new Date(iso), 'd MMM yyyy, HH:mm:ss')
}

/** Relative time with the exact timestamp on hover/focus. `tooltip` replaces the default tooltip text. */
export function RelativeTime({ iso, className, tooltip }: { iso: string; className?: string; tooltip?: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <time
          dateTime={iso}
          tabIndex={0}
          className={cn('rounded-sm focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none', className)}
        >
          {formatDistanceToNowStrict(new Date(iso), { addSuffix: true })}
        </time>
      </TooltipTrigger>
      <TooltipContent>
        {tooltip ?? absoluteTime(iso)}
      </TooltipContent>
    </Tooltip>
  )
}

/** `literal`: the stored JSON text when a JS number can't reproduce it (see parseProductJson). */
export function formatAttributeValue(v: string | number | boolean, literal?: string) {
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (typeof v === 'number' && literal !== undefined) return literal
  return String(v)
}
