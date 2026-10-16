/**
 * Cards (hi-fi Components → Card, task card, toast). White, 1px line, radius 12, shadow-sm,
 * padding 20 (16 for "dense"). Emphasis: default | attention (something needs the seller) |
 * success | dashed (not connected / not listed) | selected (1px brand border + 3px ring) |
 * tint (canvas fill, no shadow; repeater rows).
 */
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type CardEmphasis = 'default' | 'attention' | 'success' | 'dashed' | 'selected' | 'tint'

const EMPHASIS: Record<CardEmphasis, string> = {
  default: 'border-line bg-surface shadow-sm',
  attention: 'border-attention-line bg-attention-tint shadow-sm',
  success: 'border-success-line bg-success-tint shadow-sm',
  dashed: 'border-dashed border-line-strong bg-transparent',
  selected: 'border-brand bg-surface shadow-selected',
  tint: 'border-line bg-canvas',
}

export function LaCard({
  emphasis = 'default',
  pad = 'md',
  className,
  ...props
}: ComponentProps<'div'> & { emphasis?: CardEmphasis; pad?: 'none' | 'sm' | 'md' }) {
  return (
    <div
      data-emphasis={emphasis}
      className={cn('rounded-card border', EMPHASIS[emphasis], pad === 'md' && 'p-5', pad === 'sm' && 'p-4', className)}
      {...props}
    />
  )
}

/** Card title row: H3 title + optional muted sub + right-aligned action. */
export function CardHead({ title, sub, action, className }: { title: ReactNode; sub?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        <h3 className="text-h3 text-ink">{title}</h3>
        {sub ? <p className="mt-0.5 text-small text-ink-2">{sub}</p> : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  )
}

export function AttentionCard(props: Omit<ComponentProps<typeof LaCard>, 'emphasis'>) {
  return <LaCard emphasis="attention" {...props} />
}

export function DashedCard(props: Omit<ComponentProps<typeof LaCard>, 'emphasis'>) {
  return <LaCard emphasis="dashed" {...props} />
}

/**
 * Task row (Home "Waiting for you", Inbox list): leading visual, title, one meta line, action.
 * Rows are separated by hairlines when stacked inside a card.
 */
export function TaskRow({
  leading,
  title,
  meta,
  action,
  className,
}: {
  leading?: ReactNode
  title: ReactNode
  meta?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex items-center gap-3 border-b border-line py-3 last:border-b-0', className)}>
      {leading}
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-ink">{title}</p>
        {meta ? <p className="truncate text-small text-ink-2">{meta}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}

/** Big-number tile (Home metrics): chip, display number, caption; optional action. */
export function MetricTile({
  chip,
  value,
  caption,
  action,
  emphasis = 'default',
  className,
}: {
  chip: ReactNode
  value: ReactNode
  caption: ReactNode
  action?: ReactNode
  emphasis?: 'default' | 'attention'
  className?: string
}) {
  return (
    <LaCard emphasis={emphasis} className={cn('flex flex-col items-start gap-2', className)}>
      {chip}
      <p className="font-display text-display text-ink tabular-nums">{value}</p>
      <p className={cn('text-small', emphasis === 'attention' ? 'text-attention-ink' : 'text-ink-2')}>{caption}</p>
      {action ? <div className="mt-1">{action}</div> : null}
    </LaCard>
  )
}
