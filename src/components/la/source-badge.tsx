/**
 * Source badge (hi-fi Components → Source badge): where a value came from. Height 18, padding 0 6,
 * radius 5, 11px semibold. Agent-inferred values use the brand tint and always show confidence.
 * A critical fact can never carry an Agent badge without a Confirm action next to it.
 */
import { cn } from '@/lib/utils'

export type Source =
  | { kind: 'you'; detail?: string }
  | { kind: 'brand-profile' }
  | { kind: 'rule' }
  | { kind: 'agent'; confidence: number; detail?: string }
  | { kind: 'confirmed' }
  | { kind: 'needed' }

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
    case 'confirmed':
      return 'Confirmed'
    case 'needed':
      return 'Needed'
  }
}

const TONE: Record<Source['kind'], string> = {
  you: 'border-line bg-subtle text-ink-2',
  'brand-profile': 'border-line bg-subtle text-ink-2',
  rule: 'border-line bg-subtle text-ink-2',
  agent: 'border-brand-line bg-brand-bg text-brand',
  confirmed: 'border-success-line bg-success-bg text-success',
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
