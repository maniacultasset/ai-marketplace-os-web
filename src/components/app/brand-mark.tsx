import { cn } from '@/lib/utils'

/** App mark: an indigo tile with a soft top light and a drawn "M" stroke. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'relative flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-[0.5rem] bg-[linear-gradient(160deg,oklch(0.62_0.2_274),oklch(0.46_0.22_276))] text-white shadow-[var(--elev-1),inset_0_1px_0_0_oklch(1_0_0/0.25)] ring-1 ring-black/10',
        className,
      )}
    >
      <svg viewBox="0 0 24 24" className="size-[58%]" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
        <path d="M4.5 17.5V7l7.5 6 7.5-6v10.5" />
      </svg>
    </span>
  )
}
