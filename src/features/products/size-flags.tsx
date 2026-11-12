/**
 * Feedback 8: sizes the variants have that the size chart lacks (they block approval), and chart
 * sizes no variant has (a note). Shown on the product page and while editing the chart.
 */
import { Icon } from '@/components/la/icons'
import { sizeList } from '@/features/analytics-images/images/photo-views'

export function SizeFlags({ missing, unused }: { missing: readonly string[]; unused: readonly string[] }) {
  if (!missing.length && !unused.length) return null
  return (
    <div className="flex flex-col gap-1 text-small" data-testid="size-flags">
      {missing.length ? (
        <p className="flex items-start gap-1.5 text-attention-ink" data-testid="size-flags-missing">
          <Icon name="alert" size={14} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            No chart row for {sizeList(missing)}. Add {missing.length === 1 ? 'it' : 'them'} before approval.
          </span>
        </p>
      ) : null}
      {unused.length ? (
        <p className="text-ink-2" data-testid="size-flags-unused">
          No variant in {sizeList(unused)} yet.
        </p>
      ) : null}
    </div>
  )
}
