/**
 * Stepper, Progress bar and ProgressRing (hi-fi Components → Tabs, segmented, stepper, progress).
 * Stepper is only for real sequences (setup, bulk upload): 3px top rule, 24px numbered circle,
 * done = success + check, current = brand.
 *
 * By default every step before `current` is done (a gated sequence such as bulk upload). Pass
 * `done` when a step can be passed without being completed (setup): only steps whose entry is
 * true get the check; an earlier step that is not done reads "(not done yet)" to screen readers.
 */
import { cn } from '@/lib/utils'
import { Icon } from './icons'

export interface StepDef {
  label: string
}

export function Stepper({
  steps,
  current,
  done,
  className,
}: {
  steps: readonly StepDef[]
  /** 0-based */
  current: number
  /** Real completion per step. Omit only when position alone proves completion. */
  done?: readonly boolean[]
  className?: string
}) {
  return (
    <ol className={cn('flex gap-3', className)} aria-label="Progress">
      {steps.map((s, i) => {
        const isDone = done ? !!done[i] && i !== current : i < current
        const state = isDone ? 'done' : i === current ? 'on' : 'todo'
        const skipped = state === 'todo' && i < current
        return (
          <li
            key={s.label}
            aria-current={state === 'on' ? 'step' : undefined}
            className={cn(
              'flex min-w-0 flex-1 items-center gap-2.5 border-t-[3px] pt-3 font-semibold',
              state === 'done' && 'border-success text-success',
              state === 'on' && 'border-brand text-ink',
              state === 'todo' && 'border-line-strong text-ink-3',
            )}
          >
            <span
              className={cn(
                'inline-flex size-6 shrink-0 items-center justify-center rounded-full border-[1.5px] text-caption',
                state === 'done' && 'border-success bg-success text-white',
                state === 'on' && 'border-brand bg-brand text-white',
                state === 'todo' && 'border-current',
              )}
            >
              {state === 'done' ? <Icon name="check" size={14} strokeWidth={2.5} /> : i + 1}
            </span>
            <span className="truncate">
              {s.label}
              {state === 'done' ? <span className="sr-only"> (done)</span> : null}
              {skipped ? <span className="sr-only"> (not done yet)</span> : null}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

/** 6px bar. `value` 0..1. Pass `label` for the accessible name. */
export function ProgressBar({ value, tone = 'brand', label, className }: { value: number; tone?: 'brand' | 'success'; label: string; className?: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100)
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className={cn('h-1.5 overflow-hidden rounded-full bg-subtle', className)}
    >
      <div className={cn('h-full rounded-full transition-[width] duration-300', tone === 'success' ? 'bg-success' : 'bg-brand')} style={{ width: `${pct}%` }} />
    </div>
  )
}

/** 56px ring with a 7px stroke and "done/total" in the middle (Home first run "3/4"). */
export function ProgressRing({ done, total, label, size = 56, className }: { done: number; total: number; label: string; size?: number; className?: string }) {
  const stroke = 7
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const frac = total > 0 ? Math.max(0, Math.min(1, done / total)) : 0
  return (
    <div
      role="img"
      aria-label={`${label}: ${done} of ${total}`}
      className={cn('relative inline-flex shrink-0 items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--subtle)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--brand)"
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
        />
      </svg>
      <b className="absolute text-small font-bold text-ink tabular-nums">
        {done}/{total}
      </b>
    </div>
  )
}
