import { format, formatDistanceToNowStrict } from 'date-fns'
import { cn } from '@/lib/utils'

/** "3 days ago" with the exact time in `title`, inside a `<time dateTime>`. */
export function TimeAgo({ iso, className }: { iso: string; className?: string }) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return <span className={className}>—</span>
  return (
    <time dateTime={iso} title={format(d, 'd MMM yyyy, HH:mm')} className={cn('tabular-nums', className)}>
      {formatDistanceToNowStrict(d, { addSuffix: true })}
    </time>
  )
}
