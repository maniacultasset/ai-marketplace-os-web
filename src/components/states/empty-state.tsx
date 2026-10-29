import type { ReactNode } from 'react'
import { IconTile, type IconSource, type TileTone } from '@/components/la/icons'
import { cn } from '@/lib/utils'

export function EmptyState({
  icon = 'inbox',
  tone = 'neutral',
  title,
  description,
  actions,
  className,
  compact,
}: {
  /** A hi-fi icon name or a lucide icon. */
  icon?: IconSource
  tone?: TileTone
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
      <IconTile icon={icon} tone={tone} size={compact ? 'md' : 'lg'} />
      <div className="max-w-sm space-y-1">
        <h3 className="text-[0.9375rem] font-semibold tracking-tight text-balance">{title}</h3>
        {description ? <p className="text-sm text-pretty text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="mt-1 flex flex-wrap items-center justify-center gap-2">{actions}</div> : null}
    </div>
  )
}
