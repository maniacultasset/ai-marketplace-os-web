/**
 * Footer bar (hi-fi p02, p03, p08, p09, p11): pinned to the bottom of the content column, white,
 * 1px top line, padding 14 28 (16 on mobile). Left: save state / reassurance copy. Right: Back +
 * the one primary action.
 */
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function FooterBar({ status, children, className }: { status?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'sticky bottom-0 z-20 flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface px-4 py-3.5 md:px-7',
        className,
      )}
    >
      <div className="min-w-0 text-small text-ink-2">{status}</div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  )
}
