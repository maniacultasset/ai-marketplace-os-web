/**
 * Cards (hi-fi Components → Card, task card, toast). Matte surface, 1px hairline, radius 12,
 * raised (soft card shadow), padding 20 (16 for "dense"). Emphasis: default | attention (tinted,
 * something needs the seller) | success (tinted) | dashed (flat: not connected / not listed) |
 * selected (brand hairline + 3px ring, still raised) | tint (flat canvas fill; repeater rows).
 */
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { IconTile, type IconSource, type TileTone } from './icons'

export type CardEmphasis = 'default' | 'attention' | 'success' | 'dashed' | 'selected' | 'tint'

const EMPHASIS: Record<CardEmphasis, string> = {
  default: 'border-line bg-surface shadow-card',
  attention: 'border-attention-line bg-attention-tint shadow-card',
  success: 'border-success-line bg-success-tint shadow-card',
  dashed: 'border-dashed border-line-strong bg-transparent',
  selected: 'border-brand bg-surface shadow-[var(--selected-ring),var(--shadow-card)]',
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
export function CardHead({
  title,
  sub,
  action,
  icon,
  iconTone = 'neutral',
  className,
}: {
  title: ReactNode
  sub?: ReactNode
  action?: ReactNode
  /** Optional leading icon tile (36px). */
  icon?: IconSource
  iconTone?: TileTone
  className?: string
}) {
  return (
    <div className={cn('flex items-start justify-between gap-3', className)}>
      {icon ? <IconTile icon={icon} tone={iconTone} className="-my-0.5" /> : null}
      <div className="min-w-0 flex-1">
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
 * Rows are separated by hairlines when stacked inside a card. `interactive` rows get a hover/press
 * surface; pair it with an action link that stretches over the row (after:absolute after:inset-0).
 */
export function TaskRow({
  leading,
  title,
  meta,
  action,
  interactive,
  className,
}: {
  leading?: ReactNode
  title: ReactNode
  meta?: ReactNode
  action?: ReactNode
  interactive?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 border-b border-line py-3 last:border-b-0',
        // The hairline is drawn inset (::before) so it lines up with the card's content edge, not the -mx-3 hover plate.
        interactive &&
          "group relative -mx-3 rounded-[10px] border-b-0 px-3 tactile press before:pointer-events-none before:absolute before:inset-x-3 before:bottom-0 before:h-px before:bg-line before:content-[''] last:before:hidden hover:bg-hover has-[a:focus-visible]:bg-hover",
        className,
      )}
    >
      {leading}
      <div className="min-w-0 flex-1">
        <p className={cn('font-semibold text-ink', interactive ? 'line-clamp-2 break-words' : 'truncate')}>{title}</p>
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
    <LaCard emphasis={emphasis} className={cn('flex h-full min-h-[168px] flex-col items-start', className)}>
      {chip}
      <p className="mt-3 font-display text-[clamp(2.5rem,4vw,3.25rem)] leading-none font-semibold tracking-[-0.035em] text-ink tabular-nums [font-variant-numeric:tabular-nums_lining-nums]">
        {value}
      </p>
      <p className={cn('mt-1.5 max-w-[34ch] text-small', emphasis === 'attention' ? 'text-attention-ink' : 'text-ink-2')}>{caption}</p>
      {action ? <div className="mt-auto pt-4">{action}</div> : null}
    </LaCard>
  )
}
