/**
 * The landing's final call to action: list your next collection on Amazon. The panel is the page's
 * last raised surface (canvas only in its far corner) and leads with the real Amazon logo, unchanged,
 * at 64px with a Live chip. From lg a column of three listing slips sits beside it, each with its
 * real product photo, all on the same left and right edges.
 *
 * Motion: the panel uses the page's one reveal (use-reveal.ts). Once it is shown, the slips spread
 * once from a stack, 70ms apart (`cta-fan` in index.css). They move vertically only, never rotated,
 * so their text stays crisp. Nothing loops. With reduced motion, or before the reveal hook runs, the
 * slips simply rest spread.
 */
import { Link } from '@tanstack/react-router'
import { useRef, type CSSProperties } from 'react'
import { MarketplaceTile } from '@/components/la/marketplace'
import { StatusChip } from '@/components/la/status-chip'
import { Button } from '@/components/ui/button'
import { useRevealed } from '@/lib/use-reveal'
import { cn } from '@/lib/utils'
import { CTA_SLIPS } from './hero-story'


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

          {/* No well around the slips: one column on shared left and right edges, spaced evenly. */}
          <div aria-hidden className="max-lg:hidden">
            <ul className="cta-fan flex flex-col gap-3 [--stack:-92px]" data-fanned={fanned || undefined}>
              {CTA_SLIPS.map((slip, i) => (
                <li
                  key={slip.name}
                  style={{ '--i': i, zIndex: i } as CSSProperties}
                  className="relative flex h-20 min-w-0 items-center gap-3 rounded-tile border border-line bg-surface py-2 pr-4 pl-2 shadow-raised-sm"
                >
                  <img
                    src={slip.photo}
                    alt=""
                    width={48}
                    height={60}
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                    className="h-15 w-12 shrink-0 rounded-md border border-line bg-photo-white object-cover"
                  />
                  <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
                    <span className="max-w-full truncate text-small font-semibold text-ink">{slip.name}</span>
                    <StatusChip status="ready">Ready to approve</StatusChip>
                  </span>
                  <MarketplaceTile id="amazon" size="xs" className="self-start" />
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}
