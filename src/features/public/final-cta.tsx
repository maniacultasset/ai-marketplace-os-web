/**
 * The landing's final call to action: list your next collection on Amazon. The panel is the page's
 * last raised surface (canvas only in its far corner) and leads with the real Amazon logo, unchanged,
 * at 64px with a Live chip. From lg an inset well holds three example listing slips.
 *
 * Motion: the panel uses the page's one reveal (use-reveal.ts). Once it is shown, the slips spread
 * once from a stack, 70ms apart (`cta-fan` in index.css). They are offset, never rotated, so their
 * text stays crisp. Nothing loops. With reduced motion, or before the reveal hook runs, the slips
 * simply rest spread.
 */
import { Link } from '@tanstack/react-router'
import { useRef, type CSSProperties } from 'react'
import { MarketplaceTile } from '@/components/la/marketplace'
import { StatusChip, TagChip } from '@/components/la/status-chip'
import { Button } from '@/components/ui/button'
import { useRevealed } from '@/lib/use-reveal'
import { cn } from '@/lib/utils'
import { CTA_SLIPS } from './hero-story'

const FAN = [
  { x: '0px', y: '0px' },
  { x: '8px', y: '12px' },
  { x: '16px', y: '24px' },
] as const

export function FinalCta({ wrap, h2 }: { wrap: string; h2: string }) {
  const panel = useRef<HTMLDivElement>(null)
  const fanned = useRevealed(panel)
  return (
    <section aria-labelledby="cta-h" data-testid="final-cta">
      <div className={cn(wrap, 'py-20 md:py-28')}>
        <div
          ref={panel}
          data-reveal
          className="hero-field-corner grid gap-10 rounded-stage border border-line p-6 shadow-raised-md contrast-more:border-line-strong md:p-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] lg:items-center lg:gap-12 lg:p-12"
        >
          <div className="flex min-w-0 flex-col items-start">
            {/* The lockup keeps at least 8px of clear space around the logo. */}
            <div className="flex items-center gap-3 md:gap-4" data-testid="cta-lockup">
              <MarketplaceTile id="amazon" size="xl" className="max-md:size-11 max-md:rounded-xl" />
              <span className="text-[20px] leading-7 font-semibold text-ink md:text-[22px]">Amazon</span>
              <StatusChip status="live" />
            </div>
            <h2 id="cta-h" className={cn(h2, 'mt-6')}>
              List your next collection on Amazon, <span className="whitespace-nowrap">in your own voice.</span>
            </h2>
            <p className="mt-4 max-w-[58ch] text-[17px] leading-[1.55] text-ink">
              Set up your products once. When Flipkart and the next marketplaces go live, they connect to that same catalog.
            </p>
            <p className="mt-2 max-w-[58ch] text-[15px] leading-[1.55] text-ink-2">
              Our team reviews every request. Share your brand and work email to get started.
            </p>
            <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <Button asChild size="lg" className="w-full sm:w-auto">
                <Link to="/signup">Request access</Link>
              </Button>
              <Button asChild size="lg" variant="secondary" className="w-full sm:w-auto">
                <Link to="/signup/status">Check a request</Link>
              </Button>
            </div>
          </div>

          <div aria-hidden className="flex flex-col gap-4 rounded-card bg-canvas p-6 pr-10 pb-10 shadow-inset-md max-lg:hidden">
            <TagChip tone="plain" className="self-start">
              Example
            </TagChip>
            <ul className="cta-fan flex flex-col gap-3 [--stack:-84px]" data-fanned={fanned || undefined}>
              {CTA_SLIPS.map((name, i) => (
                <li
                  key={name}
                  style={{ '--i': i, '--x': FAN[i]!.x, '--y': FAN[i]!.y, zIndex: i } as CSSProperties}
                  className="relative flex h-18 min-w-0 items-center gap-3 rounded-tile border border-line bg-surface px-4 shadow-raised-sm"
                >
                  <MarketplaceTile id="amazon" size="sm" />
                  <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
                    <span className="max-w-full truncate text-small font-semibold text-ink">{name}</span>
                    <StatusChip status="ready">Ready to approve</StatusChip>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}
