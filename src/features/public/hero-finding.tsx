/**
 * The landing hero's marketing visual: one example product with the findings the rules engine
 * would raise and the safe fix Kuinn applies itself ("Fixed for you"), drawn with the real kit
 * (StatusChip, SourceBadge, MarketplaceTile). It is clearly labelled as an example and is never
 * app data. Nothing inside is a control.
 *
 * Motion (inside the landing's reveal scope): the title line arrives at 300ms, the banned word is
 * marked and the length counts up once that line is on screen, then each finding follows 100ms
 * apart. Everything settles in under a second.
 */
import { useRef } from 'react'
import { CountUp } from '@/components/la/count-up'
import { Icon } from '@/components/la/icons'
import { MarketplaceTile } from '@/components/la/marketplace'
import { SourceBadge } from '@/components/la/source-badge'
import { StatusChip, TagChip } from '@/components/la/status-chip'
import { useRevealed } from '@/lib/use-reveal'
import { FINDING_LABEL, HERO_EXAMPLE, heroFindings, heroTitleLength } from './model'

export function HeroFinding() {
  const len = heroTitleLength()
  const findings = heroFindings()
  const words = HERO_EXAMPLE.title.split(' ')
  const line = useRef<HTMLDivElement>(null)
  const lineShown = useRevealed(line)
  return (
    <figure className="relative min-w-0" data-testid="hero-example">
      <div className="overflow-hidden rounded-card border border-line bg-surface shadow-raised-md">
        <div className="flex items-center gap-2 border-b border-line bg-sunken px-4 py-2.5">
          <span aria-hidden className="flex gap-1.5 max-sm:hidden">
            <span className="size-2 rounded-full bg-line-strong shadow-inset-sm" />
            <span className="size-2 rounded-full bg-line-strong shadow-inset-sm" />
            <span className="size-2 rounded-full bg-line-strong shadow-inset-sm" />
          </span>
          <span className="truncate text-caption text-ink-2 sm:ml-2">
            <span className="max-sm:hidden">Review · </span>
            {HERO_EXAMPLE.product}
          </span>
          <TagChip tone="plain" className="ml-auto">
            Example
          </TagChip>
        </div>
        <div className="flex flex-col gap-4 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-2 text-small font-semibold text-ink">
              <MarketplaceTile id="amazon" size="sm" />
              Amazon
            </span>
            <span className="flex items-center gap-2 text-small font-semibold text-ink">
              <MarketplaceTile id="flipkart" size="sm" />
              Flipkart
            </span>
            <StatusChip status="needs-you" className="ml-auto" />
          </div>
          <div>
            <p className="text-caption font-bold text-ink-2">Title</p>
            {/* The catch: once this line is on screen the banned word is marked (one flat fill drawn
                left to right) and the length counts up to where it breaks Flipkart's limit. */}
            <div ref={line} data-reveal data-reveal-delay="300">
              <p className="mt-1 text-small leading-5 text-ink">
                {words.map((w, i) => (
                  <span key={i}>
                    {w.toLowerCase() === HERO_EXAMPLE.bannedTerm ? (
                      <mark data-sweep className="rounded-xs px-0.5 text-danger-ink">
                        {w}
                      </mark>
                    ) : (
                      w
                    )}
                    {i < words.length - 1 ? ' ' : ''}
                  </span>
                ))}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <StatusChip status="error">
                  <CountUp value={String(len)} duration={700} start={lineShown} /> / {HERO_EXAMPLE.limits.flipkart} characters
                </StatusChip>
                <span className="text-caption text-ink-2">Flipkart’s limit for kurta sets</span>
              </div>
            </div>
          </div>
          <ul className="flex flex-col gap-2.5">
            {findings.map((f, i) => (
              <li
                key={`${f.marketplace}:${f.code}`}
                data-reveal
                data-reveal-delay={380 + i * 100}
                className="flex gap-2.5 rounded-tile border border-line bg-sunken p-3"
              >
                <span aria-hidden className="mt-[9px] size-1.5 shrink-0 rounded-full bg-danger" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-2">
                    <MarketplaceTile id={f.marketplace} size="xs" className="shadow-none" />
                    <div className="flex min-h-6 min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="text-caption font-bold text-danger" title={f.code}>
                        {FINDING_LABEL[f.code]}
                      </span>
                    </div>
                    <SourceBadge source={{ kind: 'rule' }} className="mt-px shrink-0" />
                  </div>
                  <p className="mt-1.5 text-small text-ink">{f.message}</p>
                  <p className="mt-1 text-caption text-ink-2">Fix: {f.fix}</p>
                </div>
              </li>
            ))}
          </ul>
          <div
            data-reveal
            data-reveal-delay={380 + findings.length * 100}
            className="flex flex-col items-start gap-2 border-t border-line pt-4 min-[400px]:flex-row min-[400px]:gap-3"
          >
            <TagChip tone="brand" className="gap-1">
              <Icon name="check" size={14} />
              Fixed for you
            </TagChip>
            <p className="text-caption text-ink-2">
              Kuinn removes “{HERO_EXAMPLE.bannedTerm}” and trims the title to fit. You see each change before you approve.
            </p>
          </div>
        </div>
      </div>
      <figcaption className="mt-3 text-caption text-ink-2">
        An example listing, not real product data. The limits and the banned word come from the rules Kuinn checks for kurta sets.
      </figcaption>
    </figure>
  )
}
