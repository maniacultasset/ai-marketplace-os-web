/**
 * The hero's marketplace strip: every marketplace Kuinn is built to list on, each with its honest
 * stage (MARKET_STATUS). Only a live marketplace keeps full colour; the rest sit softened, so the
 * strip shows the aim without implying they all work today.
 */
import { MARKETPLACES, MarketplaceTile } from '@/components/la/marketplace'
import { CHIP_META, Glyph } from '@/components/la/status-chip'
import { cn } from '@/lib/utils'
import { STAGE_CHIP, stageOf } from './model'

const STAGE_INK = { success: 'text-success', neutral: 'text-ink-2', muted: 'text-ink-3' } as const

export function MarketplaceStrip({ className }: { className?: string }) {
  return (
    <ul aria-label="Marketplaces" className={cn('grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3', className)}>
      {MARKETPLACES.map((m) => {
        const chip = STAGE_CHIP[stageOf(m.id)]
        const tone = CHIP_META[chip.status].tone as keyof typeof STAGE_INK
        return (
          <li key={m.id} data-testid={`strip-${m.id}`} className="flex min-w-0 items-center gap-2.5">
            <MarketplaceTile id={m.id} size="sm" unavailable={chip.status !== 'live'} />
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-small font-semibold text-ink">{m.name}</span>
              <span className={cn('flex items-center gap-1 text-caption', STAGE_INK[tone] ?? 'text-ink-3')}>
                <Glyph status={chip.status} />
                {chip.label}
              </span>
            </span>
          </li>
        )
      })}
    </ul>
  )
}
