/**
 * The hero's marketplace rail: the six marketplaces in three honest stages (MARKET_STATUS), lit in
 * three levels. Amazon is live and keeps full colour; Flipkart is next and half lit; the four
 * roadmap marketplaces share one softened grey. Only the logo images are dimmed: every word stays at
 * 4.5:1 or more, and every stage is a glyph plus a word.
 *
 * It is a real list, so a screen reader reads it even though the stage around it is decorative.
 * `enter` lets the hero's entrance raise each segment in (600, 670, 740ms); `ring` replays the live
 * dot's single soft ring each time it changes (the element remounts, so the ring runs once).
 */
import { m } from 'motion/react'
import type { ReactNode } from 'react'
import { MarketplaceTile, type MarketplaceId } from '@/components/la/marketplace'
import { CHIP_META, Glyph } from '@/components/la/status-chip'
import { cn } from '@/lib/utils'
import { ENTRANCE } from './hero-story'
import { MARKET_STATUS, STAGE_CHIP, type MarketStage } from './model'

/**
 * One soft grey for every roadmap marketplace. Grayscale alone turned the dark Meesho and Nykaa
 * icons into heavy blocks next to the light Myntra and AJIO ones. Grey first, then flatten the
 * contrast and lift it, so dark tiles and dark marks settle on the same light grey.
 */
export const MUTED_LOGO = '[&_img]:opacity-55 [&_img]:[filter:grayscale(1)_contrast(0.3)_brightness(1.6)]'

/** Half lit: the next marketplace keeps its colour, softened, so it sits between live and roadmap. */
export const NEXT_LOGO = '[&_img]:opacity-80 [&_img]:saturate-[.45]'

const STAGE_INK = { success: 'text-success', neutral: 'text-ink-2', muted: 'text-ink-2' } as const

const TEST_ID: Record<MarketStage, string> = { live: 'rail-live', soon: 'rail-next', roadmap: 'rail-roadmap' }

function Stage({ stage, ring, ringDelay }: { stage: MarketStage; ring?: number; ringDelay?: number }) {
  const chip = STAGE_CHIP[stage]
  const tone = CHIP_META[chip.status].tone as keyof typeof STAGE_INK
  return (
    <span className={cn('flex items-center gap-1.5 text-caption font-semibold whitespace-nowrap', STAGE_INK[tone] ?? 'text-ink-2')}>
      <span className="relative inline-flex">
        <Glyph status={chip.status} glyph={chip.glyph} />
        {ring ? <span key={ring} aria-hidden className="hero-ring" style={{ animationDelay: `${ringDelay ?? 0}ms` }} /> : null}
      </span>
      {chip.label}
    </span>
  )
}

function Tiles({ ids, stage }: { ids: MarketplaceId[]; stage: MarketStage }) {
  if (stage === 'roadmap') {
    return (
      <span className="flex shrink-0 -space-x-1.5">
        {ids.map((id) => (
          <MarketplaceTile key={id} id={id} size="xs" className={cn('ring-2 ring-surface', MUTED_LOGO)} />
        ))}
      </span>
    )
  }
  return <MarketplaceTile id={ids[0]!} size="sm" unavailable={stage !== 'live'} className={cn(stage === 'soon' && NEXT_LOGO)} />
}

export function MarketplaceRail({
  enter = false,
  ring,
  ringDelay,
  className,
}: {
  /** Raise each segment in with the hero entrance (the caller has checked reduced motion). */
  enter?: boolean
  /** Bump to give Amazon's live dot one soft ring. 0 or undefined: no ring. */
  ring?: number
  ringDelay?: number
  className?: string
}) {
  return (
    <ul
      aria-label="Marketplaces"
      className={cn(
        // Laid out by the room it has (the tray), not the page: one column, then two with the
        // roadmap below, then one row of three.
        'grid rounded-card border border-line bg-surface shadow-raised-sm @[360px]/tray:grid-cols-2 @[500px]/tray:grid-cols-[auto_auto_minmax(0,1fr)]',
        className,
      )}
    >
      {MARKET_STATUS.map((mk, i): ReactNode => {
        const cls = cn(
          'flex min-w-0 items-center gap-2.5 px-4 py-3 @[500px]/tray:px-3.5',
          i === 1 && 'border-t border-line @[360px]/tray:border-t-0 @[360px]/tray:border-l',
          i === 2 && 'border-t border-line @[360px]/tray:col-span-2 @[500px]/tray:col-span-1 @[500px]/tray:border-t-0 @[500px]/tray:border-l',
        )
        const body = (
          <>
            <Tiles ids={mk.ids} stage={mk.stage} />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-small font-semibold text-pretty text-ink">{mk.name}</span>
              <Stage stage={mk.stage} ring={mk.stage === 'live' ? ring : undefined} ringDelay={ringDelay} />
            </span>
          </>
        )
        return enter ? (
          <m.li
            key={mk.name}
            data-testid={TEST_ID[mk.stage]}
            className={cls}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.44, delay: (ENTRANCE.rail[i] ?? 0) / 1000, ease: [0.22, 1, 0.36, 1] }}
          >
            {body}
          </m.li>
        ) : (
          <li key={mk.name} data-testid={TEST_ID[mk.stage]} className={cls}>
            {body}
          </li>
        )
      })}
    </ul>
  )
}
