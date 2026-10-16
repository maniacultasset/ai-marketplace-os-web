/**
 * Status chip (hi-fi Components → Status chip). One shape, glyph, word and colour per status;
 * never colour alone. Height 22, padding 0 9, pill, caption type. The icon-only variant (24px
 * circle) is for dense table cells and carries the word in a tooltip and the accessible name.
 */
import type { ReactNode } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

export type ChipStatus =
  | 'draft'
  | 'working'
  | 'ready'
  | 'live'
  | 'partly-live'
  | 'needs-you'
  | 'blocked'
  | 'error'
  | 'paused'
  | 'not-listed'

interface ChipMeta {
  label: string
  glyph: string
  tone: 'neutral' | 'brand' | 'success' | 'attention' | 'danger' | 'muted'
}

export const CHIP_META: Record<ChipStatus, ChipMeta> = {
  draft: { label: 'Draft', glyph: '○', tone: 'neutral' },
  working: { label: 'Working', glyph: '◐', tone: 'brand' },
  ready: { label: 'Ready to list', glyph: '◔', tone: 'brand' },
  live: { label: 'Live', glyph: '●', tone: 'success' },
  'partly-live': { label: 'Partly live', glyph: '◑', tone: 'success' },
  'needs-you': { label: 'Needs you', glyph: '▲', tone: 'attention' },
  blocked: { label: 'Blocked', glyph: '■', tone: 'attention' },
  error: { label: 'Error', glyph: '✕', tone: 'danger' },
  paused: { label: 'Paused', glyph: '❚❚', tone: 'neutral' },
  'not-listed': { label: 'Not listed', glyph: '–', tone: 'muted' },
}

export const CHIP_TONE: Record<ChipMeta['tone'], string> = {
  neutral: 'bg-subtle text-ink-2 border-line-strong',
  muted: 'bg-subtle text-ink-2 border-line-strong border-dashed',
  brand: 'bg-brand-bg text-brand border-brand-line',
  success: 'bg-success-bg text-success border-success-line',
  attention: 'bg-attention-bg text-attention border-attention-line',
  danger: 'bg-danger-bg text-danger border-danger-line',
}

const BASE =
  'inline-flex h-[22px] shrink-0 items-center gap-[5px] rounded-full border px-[9px] text-caption font-semibold whitespace-nowrap'

export function Glyph({ status, className }: { status: ChipStatus; className?: string }) {
  const g = CHIP_META[status].glyph
  return (
    <span aria-hidden className={cn('leading-none', g === '❚❚' ? 'text-[7px] tracking-[-1px]' : 'text-[10px]', className)}>
      {g}
    </span>
  )
}

/**
 * <StatusChip status="live" />             → "● Live"
 * <StatusChip status="live">52 live</StatusChip>   → same look, custom word
 * <StatusChip status="error" iconOnly />    → 24px circle, tooltip "Error"
 */
export function StatusChip({
  status,
  children,
  iconOnly,
  label,
  className,
}: {
  status: ChipStatus
  /** Replaces the default word (keep it a word or a short count phrase). */
  children?: ReactNode
  iconOnly?: boolean
  /** Accessible name / tooltip for the icon-only variant (defaults to the status word). */
  label?: string
  className?: string
}) {
  const meta = CHIP_META[status]
  if (iconOnly) {
    const name = label ?? meta.label
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            role="img"
            aria-label={name}
            tabIndex={0}
            className={cn(
              'focus-ring inline-flex size-6 shrink-0 items-center justify-center rounded-full border',
              CHIP_TONE[meta.tone],
              className,
            )}
          >
            <Glyph status={status} className={meta.glyph === '❚❚' ? undefined : 'text-[11px]'} />
          </span>
        </TooltipTrigger>
        <TooltipContent>{name}</TooltipContent>
      </Tooltip>
    )
  }
  return (
    <span data-status={status} className={cn(BASE, CHIP_TONE[meta.tone], className)}>
      <Glyph status={status} />
      {children ?? meta.label}
    </span>
  )
}

/** A chip without a glyph, for neutral tags ("Recommended", "Later"). */
export function TagChip({ children, tone = 'tag', className }: { children: ReactNode; tone?: 'tag' | 'plain' | 'brand'; className?: string }) {
  return (
    <span
      className={cn(
        BASE,
        tone === 'tag' && 'border-line-strong bg-surface text-ink-2',
        tone === 'plain' && 'border-line-strong bg-subtle text-ink-2',
        tone === 'brand' && 'border-brand-line bg-brand-bg text-brand',
        className,
      )}
    >
      {children}
    </span>
  )
}
