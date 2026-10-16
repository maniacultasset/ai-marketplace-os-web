/**
 * The landing hero's marketing visual: one example product with the findings the rules engine
 * would raise, drawn with the real kit (StatusChip, SourceBadge, MarketplaceTile). It is clearly
 * labelled as an example and is never app data. Buttons inside are drawings, not controls.
 */
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
        primary ? 'border-brand bg-brand text-white shadow-primary' : 'border-line-strong bg-surface text-ink',
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
      <div className="overflow-hidden rounded-card border border-line bg-surface shadow-lg">
        <div className="flex items-center gap-2 border-b border-line bg-canvas px-4 py-2.5">
          <span aria-hidden className="flex gap-1.5">
            <span className="size-2 rounded-full bg-line-strong" />
            <span className="size-2 rounded-full bg-line-strong" />
            <span className="size-2 rounded-full bg-line-strong" />
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
            <p className="mt-1 text-small leading-5 text-ink">
              {words.map((w, i) => (
                <span key={i}>
                  {w.toLowerCase() === HERO_EXAMPLE.bannedTerm ? (
                    <mark className="rounded-[3px] bg-danger-bg px-0.5 text-danger-ink">{w}</mark>
                  ) : (
                    w
                  )}
                  {i < words.length - 1 ? ' ' : ''}
                </span>
              ))}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusChip status="error">
                {len} / {HERO_EXAMPLE.limits.flipkart} characters
              </StatusChip>
              <span className="text-caption text-ink-2">Flipkart’s limit for kurta sets</span>
            </div>
          </div>
          <ul className="flex flex-col gap-2.5">
            {findings.map((f) => (
              <li key={`${f.marketplace}:${f.code}`} className="rounded-[10px] border border-danger-line bg-surface p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <MarketplaceTile id={f.marketplace} size="sm" className="size-6 text-[11px]" />
                  <code className="text-caption font-semibold text-ink">{f.field}</code>
                  <span className="text-caption font-bold text-danger">{f.code}</span>
                  <SourceBadge source={{ kind: 'rule' }} className="ml-auto" />
                </div>
                <p className="mt-1.5 text-small text-ink">{f.message}</p>
                <p className="mt-1 text-caption text-ink-2">Fix: {f.fix}</p>
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
