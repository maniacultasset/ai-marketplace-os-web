/**
 * Footer bar (hi-fi p02, p03, p08, p09, p11): pinned to the bottom of the content column, white,
 * 1px top line, padding 14 28 (16 on mobile). Left: save state / reassurance copy. Right: Back +
 * the one primary action. From md up the buttons never wrap under a long status line.
 */
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

const ROW = 'flex flex-wrap items-center justify-between gap-3 md:flex-nowrap'

export function FooterBar({
  status,
  children,
  className,
  innerClassName,
}: {
  status?: ReactNode
  children: ReactNode
  className?: string
  /** When given, status + actions sit in an inner row with these classes (e.g. to cap its width). */
  innerClassName?: string
}) {
  const content = (
    <>
      <div className="min-w-0 flex-1 text-small text-ink-2" aria-live="polite">
        {status}
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2 md:shrink-0">{children}</div>
    </>
  )
  return (
    <div
      data-slot="footer-bar"
      className={cn(
        'sticky bottom-0 z-20 border-t border-line bg-surface px-4 pt-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] shadow-raised-up md:px-7',
        innerClassName ? 'flex items-center' : ROW,
        className,
      )}
    >
      {innerClassName ? <div className={cn(ROW, 'w-full', innerClassName)}>{content}</div> : content}
    </div>
  )
}
