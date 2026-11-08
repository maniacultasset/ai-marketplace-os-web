/**
 * The hero's marketplace strip: every marketplace Kuinn is built to list on, each with its honest
 * stage (MARKET_STATUS). Only a live marketplace keeps full colour; the rest share one softened
 * grey treatment, so the strip shows the plan without implying they all work today.
 *
 * Motion: once the hero line around it has been revealed, the tiles rise in one after another
 * (`strip-rise`, --i) and Amazon's Live dot gives one soft ring, once (`live-ring`). Nothing loops.
 * With reduced motion, or before the reveal hook runs, everything simply shows.
 */
import type { CSSProperties } from 'react'
import { MARKETPLACES, MarketplaceTile } from '@/components/la/marketplace'
import { CHIP_META, Glyph } from '@/components/la/status-chip'
import { cn } from '@/lib/utils'
import { STAGE_CHIP, stageOf } from './model'

const STAGE_INK = { success: 'text-success', neutral: 'text-ink-2', muted: 'text-ink-3' } as const

/**
 * One soft grey for every marketplace that is not live. Grayscale alone turned the dark Meesho and
 * Nykaa icons into heavy blocks next to the light Myntra and AJIO ones. Grey first, then flatten the
 * contrast and lift it, so dark tiles and dark marks settle on the same light grey.
 */
export const MUTED_LOGO = '[&_img]:opacity-55 [&_img]:[filter:grayscale(1)_contrast(0.3)_brightness(1.6)]'

export function MarketplaceStrip({ className }: { className?: string }) {
  return (
    <ul aria-label="Marketplaces" className={cn('strip-rise grid grid-cols-2 gap-x-4 gap-y-3 min-[480px]:grid-cols-3', className)}>
      {MARKETPLACES.map((m, i) => {
        const chip = STAGE_CHIP[stageOf(m.id)]
        const live = chip.status === 'live'
        const tone = CHIP_META[chip.status].tone as keyof typeof STAGE_INK
        return (
          <li key={m.id} data-testid={`strip-${m.id}`} style={{ '--i': i } as CSSProperties} className="flex min-w-0 items-center gap-2.5">
            <MarketplaceTile id={m.id} size="sm" unavailable={!live} className={cn(!live && MUTED_LOGO)} />
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-small font-semibold text-ink">{m.name}</span>
              <span className={cn('flex items-center gap-1 text-caption whitespace-nowrap', STAGE_INK[tone] ?? 'text-ink-3')}>
                <Glyph status={chip.status} glyph={chip.glyph} className={cn(live && 'live-ring')} />
                {/* The short word only where the full one would wrap (under 375px). */}
                {chip.short === chip.label ? (
                  chip.label
                ) : (
                  <>
                    <span className="max-[374px]:hidden">{chip.label}</span>
                    <span className="hidden max-[374px]:inline">{chip.short}</span>
                  </>
                )}
              </span>
            </span>
          </li>
        )
      })}
    </ul>
  )
}
