import { cn } from '@/lib/utils'

/**
 * The count pill. Hidden while zero (hi-fi p05). Attention pill: "needs you" items.
 * `compact` overlays it on the corner of the 28px icon slot in the collapsed rail (styling only).
 */
export function InboxNavBadge({ label, compact = false }: { label: string | null; compact?: boolean }) {
  if (!label) return null
  return (
    <span
      data-testid="inbox-nav-badge"
      aria-label={`${label} open items`}
      className={cn(
        'rounded-full border border-attention-line bg-attention-bg text-caption font-bold text-attention tabular-nums',
        compact
          ? 'absolute -top-1 -right-1 inline-flex h-4 min-w-4 items-center justify-center px-1 text-[11px] leading-none ring-2 ring-canvas'
          : 'ml-auto px-[7px] leading-[18px]',
      )}
    >
      {label}
    </span>
  )
}
