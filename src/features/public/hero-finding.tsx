/**
 * The landing hero's marketing visual: one example product with the findings the rules engine
 * would raise, drawn with the real kit (StatusChip, SourceBadge, MarketplaceTile). It is clearly
 * labelled as an example and is never app data. Buttons inside are drawings, not controls.
 */
import type { CSSProperties } from 'react'
import { CountUp } from '@/components/la/count-up'
import { MarketplaceTile } from '@/components/la/marketplace'
import { SourceBadge } from '@/components/la/source-badge'
import { StatusChip, TagChip } from '@/components/la/status-chip'
import { cn } from '@/lib/utils'
import { HERO_EXAMPLE, heroFindings, heroTitleLength } from './model'

function FakeButton({ children, primary }: { children: string; primary?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex h-[30px] shrink-0 items-center rounded-[7px] whitespace-nowrap border px-3 text-[13px] font-semibold',
        primary ? 'border-brand bg-brand text-white shadow-raised-brand' : 'border-line-strong bg-surface text-ink shadow-raised-sm',
      )}
    >
      {children}
    </span>
  )
}

export function HeroFinding() {
  const len = heroTitleLength()
  const findings = heroFindings()
  const words = HERO_EXAMPLE.title.split(' ')
  return (
    <figure className="relative min-w-0" data-testid="hero-example">
      <div className="overflow-hidden rounded-card border border-line bg-surface shadow-raised-md">
        <div className="flex items-center gap-2 border-b border-line bg-sunken px-4 py-2.5">
          <span aria-hidden className="flex gap-1.5">
            <span className="size-2 rounded-full bg-line-strong shadow-inset-sm" />
            <span className="size-2 rounded-full bg-line-strong shadow-inset-sm" />
            <span className="size-2 rounded-full bg-line-strong shadow-inset-sm" />
          </span>
          <span className="ml-2 truncate text-caption text-ink-2">Review · {HERO_EXAMPLE.product}</span>
          <TagChip tone="plain" className="ml-auto">
            Example
          </TagChip>
        </div>
        <div className="flex flex-col gap-4 p-5">
          <div className="flex items-center gap-2">
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
            {/* The catch: once this line is in view the banned word is marked (one flat fill drawn
                left to right) and the length counts up to where it breaks Flipkart's limit. */}
            <div data-reveal style={{ '--d': '420ms' } as CSSProperties}>
              <p className="mt-1 text-small leading-5 text-ink">
                {words.map((w, i) => (
                  <span key={i}>
                    {w.toLowerCase() === HERO_EXAMPLE.bannedTerm ? (
                      <mark
                        data-sweep
                        className="rounded-[3px] bg-[linear-gradient(var(--danger-bg),var(--danger-bg))] bg-no-repeat px-0.5 text-danger-ink transition-[background-size] [transition-delay:calc(var(--d,0ms)+200ms)] duration-500 ease-[var(--ease-spring)] [background-size:0%_100%]"
                      >
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
                  <CountUp value={String(len)} duration={700} /> / {HERO_EXAMPLE.limits.flipkart} characters
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
                style={{ '--d': `${520 + i * 140}ms` } as CSSProperties}
                className="flex gap-2.5 rounded-[10px] border border-line bg-sunken p-3"
              >
                <span aria-hidden className="mt-[9px] size-1.5 shrink-0 rounded-full bg-danger" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-2">
                    <MarketplaceTile id={f.marketplace} size="sm" className="size-6 shrink-0 rounded-[7px] text-[11px] shadow-none" />
                    <div className="flex min-h-6 min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5">
                      <code className="font-mono text-[11.5px] font-medium text-ink-2">{f.field}</code>
                      <span className="text-caption font-bold text-danger">{f.code}</span>
                    </div>
                    <SourceBadge source={{ kind: 'rule' }} className="mt-px shrink-0" />
                  </div>
                  <p className="mt-1.5 text-small text-ink">{f.message}</p>
                  <p className="mt-1 text-caption text-ink-2">Fix: {f.fix}</p>
                </div>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
            <FakeButton primary>Fix and recheck</FakeButton>
            <FakeButton>Send back with a note</FakeButton>
            <span className="ml-auto text-caption whitespace-nowrap text-ink-2">{findings.length} errors</span>
          </div>
        </div>
      </div>
      <figcaption className="mt-3 text-caption text-ink-2">
        An illustrative example of how a rule check reads. Not real product data.
      </figcaption>
    </figure>
  )
}
