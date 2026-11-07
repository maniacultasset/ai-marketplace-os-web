/**
 * "Fixed for you" (review, near the quality gates) and the "auto-fixed" chip (product listing
 * cards). Both read the same rows: GET /issues?status=auto_fixed&listing_id=… (auto-fix-model.ts).
 * Quiet by design: one summary line, open on demand, and nothing at all when Kuinn fixed nothing.
 */
import { Link } from '@tanstack/react-router'
import { useEffect, useId, useRef, useState } from 'react'
import { LaCard } from '@/components/la/cards'
import { Icon } from '@/components/la/icons'
import { ErrorState } from '@/components/states/error-state'
import { cn } from '@/lib/utils'
import { autoFixedChipText, FIXED_FOR_YOU_HASH, fixedSummary, type AutoFix } from './auto-fix-model'
import { clock } from './format'

export function FixedForYouCard({
  fixes,
  error,
  onRetry,
  defaultOpen = false,
}: {
  fixes: readonly AutoFix[]
  /** The trail could not be read: say so, since the reviewer should see it before approving. */
  error?: unknown
  onRetry?: () => void
  /** Opened from a chip link (`#fixed-for-you`): start open and bring it into view. */
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const panelId = useId()
  const ref = useRef<HTMLDivElement>(null)
  const shown = fixes.length > 0
  useEffect(() => {
    if (defaultOpen && shown) ref.current?.scrollIntoView?.({ block: 'start' })
  }, [defaultOpen, shown])

  if (error)
    return (
      <LaCard pad="sm" data-testid="fixed-for-you-error">
        <ErrorState compact error={error} title="Couldn’t load what Kuinn fixed" onRetry={onRetry} />
      </LaCard>
    )
  if (!shown) return null
  return (
    <LaCard pad="none" ref={ref} id={FIXED_FOR_YOU_HASH} className="scroll-mt-20" data-testid="fixed-for-you">
      <button
        type="button"
        className="focus-ring flex min-h-12 w-full items-center gap-2.5 rounded-card px-4 py-3 text-left transition-colors duration-150 hover:bg-hover"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        data-testid="fixed-for-you-toggle"
      >
        <span aria-hidden className="inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-success-line bg-success-bg text-success">
          <Icon name="check" size={13} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-small font-semibold text-ink" data-testid="fixed-for-you-summary">
            {fixedSummary(fixes.length)}
          </span>
          {open ? null : <span className="block text-caption text-ink-3">Check what changed before you approve.</span>}
        </span>
        <Icon name="chev" size={16} aria-hidden className={cn('shrink-0 text-ink-3 motion-safe:transition-transform motion-safe:duration-150', open && 'rotate-180')} />
      </button>
      <div id={panelId} hidden={!open} className="border-t border-line px-4 pb-3">
        <ul className="m-0 list-none p-0" data-testid="fixed-for-you-list">
          {fixes.map((f) => (
            <li key={f.id} className="border-b border-line py-3 last:border-b-0 last:pb-1" data-testid="fixed-for-you-item">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-ink-3">
                <span className="font-semibold text-ink-2" title={f.fieldPath}>
                  {f.field}
                </span>
                <span aria-hidden>·</span>
                <time dateTime={f.at} className="tabular-nums">
                  {clock(f.at)}
                </time>
                {f.rewritten ? <RewrittenBadge /> : null}
              </div>
              <dl className="mt-1.5 grid gap-y-1 text-small">
                <div>
                  <dt className="sr-only">What was wrong</dt>
                  <dd className="text-ink-2" data-testid="fix-problem">
                    {f.problem}
                  </dd>
                </div>
                <div>
                  <dt className="sr-only">What Kuinn changed</dt>
                  <dd className="text-ink" data-testid="fix-change">
                    {f.change}
                  </dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
        <p className="mt-1 text-caption text-ink-3">Kuinn fixes only safe things, like length and spelling. It never makes up a product fact.</p>
      </div>
    </LaCard>
  )
}

/** Marks a fix the agent made by rewriting the failed field (not a code fix). */
export function RewrittenBadge() {
  return (
    <span className="inline-flex h-[18px] shrink-0 items-center rounded-[5px] border border-brand-line bg-brand-bg px-1.5 text-[11px] leading-none font-semibold whitespace-nowrap text-brand">
      Rewritten by the agent
    </span>
  )
}

/** "✓ 2 auto-fixed" on a listing card: opens that listing's review at "Fixed for you". */
export function AutoFixedChip({ listingId, count, className }: { listingId: string; count: number; className?: string }) {
  if (count <= 0) return null
  return (
    <Link
      to="/listings/$listingId/review"
      params={{ listingId }}
      hash={FIXED_FOR_YOU_HASH}
      aria-label={`${fixedSummary(count)}. See what changed.`}
      title="See what Kuinn changed"
      className={cn(
        'focus-ring inline-flex h-[22px] shrink-0 items-center gap-1 rounded-full border border-success-line bg-success-bg px-[9px] text-caption font-semibold whitespace-nowrap text-success tabular-nums transition-colors duration-150 hover:border-success',
        className,
      )}
      data-testid="auto-fixed-chip"
    >
      <Icon name="check" size={12} aria-hidden />
      {autoFixedChipText(count)}
    </Link>
  )
}
