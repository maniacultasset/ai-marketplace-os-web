/**
 * Source badge (hi-fi Components → Source badge): where a value came from. Height 18, padding 0 6,
 * radius 5, 11px semibold. Agent-inferred values use the brand tint and always show confidence;
 * a value read from the photos is "From photo" until the seller confirms it.
 * A critical fact can never carry an Agent badge without a Confirm action next to it.
 *
 * SI12 adds where a seller value came from: "From sheet" (the CSV import), "Size chart" (rows read
 * from the size-chart photo and saved by the seller) and "Suggested" (a value offered, not saved
 * yet). "Needed" can name the marketplaces that need the field: "Flipkart needs this".
 */
import { cn } from '@/lib/utils'

export type Source =
  | { kind: 'you'; detail?: string }
  | { kind: 'brand-profile' }
  | { kind: 'rule' }
  | { kind: 'agent'; confidence: number; detail?: string }
  /** Read from the product photos and not confirmed yet (SI3). `unconfirmed` says so in words. */
  | { kind: 'photo'; unconfirmed?: boolean }
  | { kind: 'confirmed' }
  /** Imported from the seller's spreadsheet (SI12). */
  | { kind: 'sheet' }
  /** Read from the size-chart photo; the seller saved or is editing it (SI12). */
  | { kind: 'size-chart' }
  /** Offered for the seller to confirm by saving; not stored yet (SI12). */
  | { kind: 'suggested' }
  /** Missing; `detail` says who needs it ("Flipkart needs this"). */
  | { kind: 'needed'; detail?: string }

const BASE = 'inline-flex h-[18px] shrink-0 items-center rounded-[5px] border px-1.5 text-[11px] leading-none font-semibold whitespace-nowrap'

/** 0.82 or 82 → "82%". */
export function formatConfidence(c: number): string {
  const pct = c <= 1 ? c * 100 : c
  return `${Math.round(Math.max(0, Math.min(100, pct)))}%`
}

export function sourceLabel(s: Source): string {
  switch (s.kind) {
    case 'you':
      return s.detail ? `You · ${s.detail}` : 'You'
    case 'brand-profile':
      return 'Brand profile'
    case 'rule':
      return 'Rule'
    case 'agent':
      return ['Agent', s.detail, formatConfidence(s.confidence)].filter(Boolean).join(' · ')
    case 'photo':
      return s.unconfirmed ? 'From photo, not confirmed' : 'From photo'
    case 'confirmed':
      return 'Confirmed'
    case 'sheet':
      return 'From sheet'
    case 'size-chart':
      return 'Size chart'
    case 'suggested':
      return 'Suggested'
    case 'needed':
      return s.detail ?? 'Needed'
  }
}

const TONE: Record<Source['kind'], string> = {
  you: 'border-line bg-subtle text-ink-2',
  'brand-profile': 'border-line bg-subtle text-ink-2',
  rule: 'border-line bg-subtle text-ink-2',
  agent: 'border-brand-line bg-brand-bg text-brand',
  photo: 'border-brand-line bg-brand-bg text-brand',
  confirmed: 'border-success-line bg-success-bg text-success',
  sheet: 'border-line bg-subtle text-ink-2',
  'size-chart': 'border-brand-line bg-brand-bg text-brand',
  suggested: 'border-brand-line bg-brand-bg text-brand',
  needed: 'border-attention-line bg-attention-bg text-attention',
}

export function SourceBadge({ source, className }: { source: Source; className?: string }) {
  const label = sourceLabel(source)
  return (
    <span className={cn(BASE, TONE[source.kind], className)} aria-label={`Source: ${label}`}>
      {label}
    </span>
  )
}
