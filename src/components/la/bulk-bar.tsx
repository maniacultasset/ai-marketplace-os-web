/**
 * Bulk action bar (hi-fi p07): appears on selection, pinned to the bottom of the viewport, white,
 * radius 12, shadow-lg. "N selected" on the left, actions on the right (one primary at most).
 * Actions the backend cannot do yet use UnavailableButton with a reason.
 */
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function BulkBar({ count, onClear, children, className }: { count: number; onClear?: () => void; children: ReactNode; className?: string }) {
  return (
    <div className="pointer-events-none sticky bottom-4 z-30 flex justify-center px-2">
      <div
        role="region"
        aria-label="Bulk actions"
        className={cn(
          'pointer-events-auto flex w-full max-w-[770px] flex-wrap items-center gap-2 rounded-card border border-line bg-surface px-4 py-3 shadow-lg',
          className,
        )}
      >
        <p className="mr-auto font-semibold text-ink" aria-live="polite">
          {count} selected
        </p>
        {onClear ? (
          <Button variant="ghost" size="sm" onClick={onClear}>
            Clear
          </Button>
        ) : null}
        {children}
      </div>
    </div>
  )
}
