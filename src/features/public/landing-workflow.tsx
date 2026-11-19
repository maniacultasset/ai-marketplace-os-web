/**
 * One workflow, multiple marketplaces (brief section 9, moved up the page as the founder asked):
 * your product goes into the Kuinn agent once and branches out to each marketplace. Every branch
 * carries that marketplace's honest stage from MARKET_STATUS: a flowing line for live, a dashed one
 * for next, a faint idle one for the roadmap. Below md the branches give way to a plain grid.
 */
import { Sparkles } from 'lucide-react'
import { IconGlyph } from '@/components/la/icons'
import { marketplaceInfo, MarketplaceTile } from '@/components/la/marketplace'
import { StatusChip } from '@/components/la/status-chip'
import { cn } from '@/lib/utils'
import { SHIRT, WORKFLOW, WORKFLOW_MARKETS } from './landing-content'
import { SectionHeading, SECTION_Y, WRAP } from './landing-kit'
import { STAGE_CHIP, stageOf } from './model'

const W = 1200
const H = 150

export function WorkflowSection() {
  const n = WORKFLOW_MARKETS.length
  return (
    <section id="marketplaces" aria-labelledby="marketplaces-h" className="relative overflow-hidden bg-surface">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_45%_at_50%_42%,var(--brand-bg)_0%,transparent_75%)]" />
      <div className={cn(WRAP, SECTION_Y, 'relative')}>
        <SectionHeading id="marketplaces" eyebrow={WORKFLOW.eyebrow} title={WORKFLOW.title} lede={WORKFLOW.body} align="center" />

        <div data-reveal className="mx-auto mt-14 flex max-w-[1080px] flex-col items-center md:mt-16">
          {/* Your product */}
          <div className="flex items-center gap-3 rounded-card border border-line bg-surface py-2 pr-5 pl-2 shadow-raised-md">
            <img src={SHIRT.photo} alt="" width={44} height={56} loading="lazy" decoding="async" className="h-14 w-11 rounded-lg bg-photo object-cover object-top" />
            <span>
              <span className="block text-[15px] font-bold text-ink">Your product</span>
              <span className="block text-small text-ink-3">Photos and basic details, once</span>
            </span>
          </div>
          <div aria-hidden className="h-10 w-px bg-gradient-to-b from-line-strong to-brand" />

          {/* The agent */}
          <div className="edge-gradient relative flex items-center gap-3 rounded-pill bg-surface px-6 py-3.5 shadow-raised-lg">
            <span className="grid size-9 place-items-center rounded-full bg-brand text-white shadow-raised-brand">
              <IconGlyph icon={Sparkles} size={18} />
            </span>
            <span className="font-display text-[clamp(1.125rem,0.6vw+1rem,1.5rem)] font-bold tracking-[-0.02em] text-ink">Kuinn marketplace agent</span>
          </div>

          {/* Branches, md and up */}
          <svg aria-hidden viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-[110px] w-full max-md:hidden lg:h-[130px]">
            {WORKFLOW_MARKETS.map((id, i) => {
              const x = ((i + 0.5) * W) / n
              const stage = stageOf(id)
              const d = `M ${W / 2} 0 C ${W / 2} ${H * 0.55}, ${x} ${H * 0.35}, ${x} ${H}`
              return (
                <path
                  key={id}
                  d={d}
                  fill="none"
                  vectorEffect="non-scaling-stroke"
                  strokeWidth={stage === 'live' ? 2 : 1.5}
                  strokeLinecap="round"
                  className={cn('flow-line', stage === 'live' ? 'stroke-brand' : stage === 'soon' ? 'stroke-brand-line' : 'stroke-line-strong')}
                  data-idle={stage === 'roadmap' || undefined}
                  style={stage === 'soon' ? { animationDuration: '3.2s' } : undefined}
                />
              )
            })}
          </svg>
          <div aria-hidden className="h-8 w-px bg-brand md:hidden" />

          <ul className="grid w-full grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6 md:gap-4">
            {WORKFLOW_MARKETS.map((id) => {
              const m = marketplaceInfo(id)
              const stage = stageOf(id)
              const chip = STAGE_CHIP[stage]
              return (
                <li
                  key={id}
                  className={cn(
                    'flex flex-col items-center gap-2.5 rounded-card border px-2 py-4 text-center',
                    stage === 'roadmap' ? 'border-dashed border-line-strong bg-surface/60' : 'border-line bg-surface shadow-raised-md',
                  )}
                >
                  <MarketplaceTile id={id} size="big" unavailable={stage === 'roadmap'} />
                  <span className="text-[15px] font-bold text-ink">{m.short}</span>
                  <StatusChip status={chip.status} glyph={chip.glyph}>
                    {chip.short}
                  </StatusChip>
                </li>
              )
            })}
          </ul>
          <p className="mt-8 max-w-[60ch] text-center text-small text-ink-3">
            Amazon is live. Flipkart is built and switches on next. The others are on the roadmap, with no dates yet, and will use the same
            catalog and approval step.
          </p>
        </div>
      </div>
    </section>
  )
}
