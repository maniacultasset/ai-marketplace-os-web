import type { LucideIcon } from 'lucide-react'
import { Inbox } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  actions,
  className,
  compact,
}: {
  icon?: LucideIcon
  title: string
  description?: ReactNode
  actions?: ReactNode
  className?: string
  /** Smaller padding for use inside tables/cards. */
  compact?: boolean
}) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'gap-2 px-4 py-8' : 'gap-3 px-6 py-12',
        className,
      )}
    >
      <div
        className={cn(
          'flex items-center justify-center rounded-xl border bg-card text-muted-foreground shadow-elev-2',
          compact ? 'size-10' : 'size-11',
        )}
      >
        <Icon className={compact ? 'size-[1.125rem]' : 'size-5'} aria-hidden />
      </div>
      <div className="max-w-sm space-y-1">
        <h3 className="text-[0.9375rem] font-semibold tracking-tight text-balance">{title}</h3>
        {description ? <p className="text-sm text-pretty text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="mt-1 flex flex-wrap items-center justify-center gap-2">{actions}</div> : null}
    </div>
  )
}
