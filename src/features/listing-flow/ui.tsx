/**
 * Pieces shared by the listing-flow screens (p12, p13, p14, p18): the page head with the product
 * tile, the vertical timeline (hi-fi `.tl`: dot 12, line 2), the quality-gate list, the
 * key-value proof list and content-shaped skeletons.
 */
import type { ComponentProps, ReactNode } from 'react'
import { CHIP_META, Icon, StatusChip, UnavailableButton, type ChipStatus } from '@/components/la'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { ActionState } from '@/features/listings/model'
import { cn } from '@/lib/utils'
import type { GateResult, GateState } from './gates'
import type { StepState } from './run-steps'

/* ---------------------------------------------------------------------------------------------- */

/**
 * 56px product tile. The API has no image URL for a product, so it is the neutral box glyph in a
 * raised matte squircle (same tokens as `IconTile`, one size up).
 */
export function ProductTile({ size = 56, className }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      data-slot="icon-tile"
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-[14px] border border-[var(--tile-neutral-line)] bg-[var(--tile-neutral-bg)] text-[var(--tile-neutral-fg)] shadow-raised-sm',
        className,
      )}
      style={{ width: size, height: size }}
    >
      <Icon name="box" size={Math.round(size * 0.46)} />
    </span>
  )
}

/** hi-fi `.phd`: tile + H1 + one muted line on the left, chips and actions on the right. */
export function ScreenHead({
  title,
  sub,
  right,
  tile = true,
}: {
  title: ReactNode
  sub?: ReactNode
  right?: ReactNode
  tile?: boolean
}) {
  return (
    <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="flex min-w-0 items-center gap-3.5">
        {tile ? <ProductTile /> : null}
        <div className="min-w-0">
          <h1 className="font-display text-h1 break-words text-ink sm:truncate" data-testid="screen-title">
            {title}
          </h1>
          {sub ? <p className="mt-1 text-body text-ink-2">{sub}</p> : null}
        </div>
      </div>
      {right ? <div className="flex shrink-0 flex-wrap items-center gap-2">{right}</div> : null}
    </header>
  )
}

/* ---------------------------------------------------------------------------------------------- */

export type DotTone = 'ok' | 'now' | 'need' | 'bad' | 'todo'

const DOT: Record<DotTone, string> = {
  ok: 'border-success bg-success',
  now: 'border-brand bg-brand shadow-selected',
  need: 'border-attention bg-attention',
  bad: 'border-danger bg-danger',
  todo: 'border-ink-3 bg-field shadow-inset-sm',
}

const DOT_WORD: Record<DotTone, string> = { ok: 'Done', now: 'In progress', need: 'Needs you', bad: 'Failed', todo: 'Not started' }

export const stepTone = (s: StepState): DotTone =>
  s === 'done' ? 'ok' : s === 'now' ? 'now' : s === 'needs-you' ? 'need' : s === 'failed' ? 'bad' : 'todo'

/** hi-fi `.tl`. Each item's state is in its accessible text, never the dot colour alone. */
export function Timeline({ children, className, label }: { children: ReactNode; className?: string; label?: string }) {
  return (
    <ol aria-label={label} className={cn('relative m-0 list-none pl-5 before:absolute before:top-1.5 before:bottom-1.5 before:left-[5px] before:w-0.5 before:bg-line', className)}>
      {children}
    </ol>
  )
}

export function TimelineItem({
  tone,
  children,
  meta,
  className,
}: {
  tone: DotTone
  children: ReactNode
  /** Small ink-3 line (the hi-fi `small`): above the text for log entries, below for steps. */
  meta?: ReactNode
  className?: string
}) {
  return (
    <li className={cn('relative pb-3.5 text-small last:pb-0', className)} data-tone={tone}>
      <span aria-hidden className={cn('absolute top-[3px] -left-5 size-3 rounded-full border-2', DOT[tone])} />
      <span className="sr-only">{DOT_WORD[tone]}: </span>
      {children}
      {meta ? <span className="block text-caption text-ink-3">{meta}</span> : null}
    </li>
  )
}

/* ---------------------------------------------------------------------------------------------- */

export const GATE_CHIP: Record<GateState, ChipStatus> = {
  passed: 'live',
  working: 'working',
  warning: 'needs-you',
  blocked: 'blocked',
  unchecked: 'not-listed',
}

const GATE_WORD: Record<GateState, string> = {
  passed: 'Passed',
  working: 'In progress',
  warning: 'Warning',
  blocked: 'Blocked',
  unchecked: 'Not checked yet',
}

/** p13 grid (two columns, chip then label) or p18 list (label left, chip right). */
export function GateList({ gates, layout = 'grid' }: { gates: readonly GateResult[]; layout?: 'grid' | 'list' }) {
  return (
    <ul
      data-testid="quality-gates"
      className={cn('m-0 list-none p-0', layout === 'grid' ? 'mt-3 grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2' : 'mt-3 flex flex-col gap-2')}
    >
      {gates.map((g) => {
        const chip = <StatusChip status={GATE_CHIP[g.state]} iconOnly label={`${g.label}: ${GATE_WORD[g.state]}. ${g.note}`} />
        return (
          <li
            key={g.id}
            data-gate={g.id}
            data-state={g.state}
            className={cn('flex items-center gap-1.5 text-small', layout === 'list' && 'min-h-7 justify-between text-body')}
          >
            {layout === 'grid' ? chip : null}
            <span className={cn(g.state === 'unchecked' ? 'text-ink-2' : 'text-ink')}>{g.label}</span>
            {layout === 'list' ? (
              g.state === 'blocked' ? <StatusChip status="blocked" /> : chip
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

/** The glyph legend under a gate list, so the states never rely on colour or hover alone. */
export function GateLegend({ className }: { className?: string }) {
  const items: [ChipStatus, string][] = [
    ['live', 'passed'],
    ['needs-you', 'warning'],
    ['blocked', 'blocked'],
    ['not-listed', 'not checked yet'],
  ]
  return (
    <p className={cn('text-caption text-ink-3', className)}>
      {items.map(([s, w], i) => (
        <span key={s}>
          {i ? ' · ' : ''}
          <span aria-hidden>{CHIP_META[s].glyph}</span> {w}
        </span>
      ))}
    </p>
  )
}

/* ---------------------------------------------------------------------------------------------- */

/** hi-fi `.kv`: 130px muted terms, 13px values. */
export function KeyValues({ rows, className }: { rows: readonly { term: string; value: ReactNode; testId?: string }[]; className?: string }) {
  return (
    <dl className={cn('grid grid-cols-[130px_minmax(0,1fr)] gap-x-3 gap-y-2 text-small', className)}>
      {rows.map((r) => (
        <div key={r.term} className="contents">
          <dt className="text-ink-3">{r.term}</dt>
          <dd className="m-0 min-w-0 break-words text-ink" data-testid={r.testId}>
            {r.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/* ---------------------------------------------------------------------------------------------- */

export function HeadSkeleton() {
  return (
    <div className="mb-5 flex items-center gap-3.5" aria-hidden>
      <Skeleton className="size-14 rounded-[10px]" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-72 max-w-[60vw]" />
        <Skeleton className="h-4 w-48" />
      </div>
    </div>
  )
}

export function CardSkeleton({ lines = 4, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('rounded-card border border-line bg-surface p-5 shadow-raised-md', className)} aria-hidden>
      <Skeleton className="h-5 w-32" />
      <div className="mt-4 flex flex-col gap-3">
        {Array.from({ length: lines }, (_, i) => (
          <Skeleton key={i} className="h-4" style={{ width: `${85 - i * 9}%` }} />
        ))}
      </div>
    </div>
  )
}

/** A real action that is off for a reason: the reason is the tooltip and accessible description. */
export function ActionButton({
  state,
  children,
  ...props
}: { state: ActionState; children: ReactNode } & Omit<ComponentProps<typeof Button>, 'children'>) {
  if (!state.show) return null
  if (state.enabled) return <Button {...props}>{children}</Button>
  const { onClick: _ignored, disabled: _d, asChild: _a, ...rest } = props
  return (
    <UnavailableButton {...rest} reason={state.reason ?? 'Not available right now.'}>
      {children}
    </UnavailableButton>
  )
}
