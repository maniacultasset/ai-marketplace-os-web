import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { MARKETPLACE_META } from '@/features/marketplaces/meta'
import { cn } from '@/lib/utils'
import { MARKETPLACE_LABEL, type Marketplace, type Rule } from './labels'

const Dot = () => <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current" />

export function SeverityBadge({ severity }: { severity: Rule['severity'] }) {
  return (
    <Badge variant={severity === 'error' ? 'danger' : 'warning'} className="capitalize">
      <Dot />
      {severity}
    </Badge>
  )
}

export function ScopeBadge({ scope }: { scope: Rule['scope'] }) {
  return <Badge variant={scope === 'tenant' ? 'brand' : 'muted'}>{scope === 'tenant' ? 'Brand' : 'Platform'}</Badge>
}

export function EnabledDot({ enabled }: { enabled: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <span
        aria-hidden
        className={cn('size-1.5 rounded-full', enabled ? 'bg-success' : 'bg-muted-foreground/40')}
      />
      <span className={enabled ? '' : 'text-muted-foreground'}>{enabled ? 'On' : 'Off'}</span>
    </span>
  )
}

/** Drawn marketplace icon in a tinted tile (same identity as the Marketplaces screen). */
export function MarketplaceTile({ marketplace, className }: { marketplace: Marketplace; className?: string }) {
  const meta = MARKETPLACE_META[marketplace]
  const Icon = meta.icon
  return (
    <span
      aria-hidden
      className={cn('flex size-6 shrink-0 items-center justify-center rounded-md ring-1 ring-inset', meta.tileClass, className)}
    >
      <Icon className="size-3.5" strokeWidth={2} />
    </span>
  )
}

export function MarketplaceMark({
  marketplace,
  className,
  compact,
}: {
  marketplace: Marketplace
  className?: string
  /** Hide the name below the sm breakpoint (the icon tile stays). */
  compact?: boolean
}) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <MarketplaceTile marketplace={marketplace} />
      <span className={compact ? 'sr-only sm:not-sr-only' : undefined}>{MARKETPLACE_LABEL[marketplace]}</span>
    </span>
  )
}

/** Category slug. Sans (DESIGN: no mono for categories); the slug still reads as typed. */
export function CategoryText({ category }: { category: string | null | undefined }) {
  return category ? (
    <span className="text-foreground">{category}</span>
  ) : (
    <span className="text-muted-foreground">All categories</span>
  )
}

/** A field path (`content.title`) people copy: mono in a quiet chip. */
export function FieldChip({ children, className, title }: { children: ReactNode; className?: string; title?: string }) {
  return (
    <code
      title={title}
      className={cn(
        'inline-block max-w-full truncate rounded-md bg-muted px-1.5 py-0.5 align-middle font-mono text-[12px] leading-5 text-foreground ring-1 ring-inset ring-border/60',
        className,
      )}
    >
      {children}
    </code>
  )
}
