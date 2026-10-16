/**
 * Field (hi-fi Components → Field): label 13 bold 6px above, control 40 high, hint 12/16 ink-3 6px
 * below, error in danger replacing the hint. States: default, focus, filled, needs input (attention
 * border + tint), error, disabled. A source badge sits on the hint line ("You", "Agent · 82%").
 *
 * <LaField label="Brand name" htmlFor="brand" hint="Exactly as customers see it." source={{ kind: 'you' }}>
 *   <Input id="brand" … />
 * </LaField>
 */
import { useId, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { SourceBadge, type Source } from './source-badge'

export function LaField({
  label,
  htmlFor,
  hint,
  error,
  source,
  required,
  critical,
  needsInput,
  hintAction,
  children,
  className,
}: {
  label: ReactNode
  htmlFor?: string
  hint?: ReactNode
  error?: ReactNode
  source?: Source
  required?: boolean
  /** ★ critical fact: never filled by the agent. */
  critical?: boolean
  /** Attention state ("Needed"): the value is missing and blocks a listing. */
  needsInput?: boolean
  /** Inline action on the hint line, e.g. a 22px "Confirm" button. */
  hintAction?: ReactNode
  children: ReactNode
  className?: string
}) {
  const auto = useId()
  const hintId = `${htmlFor ?? auto}-hint`
  const showHintLine = error || hint || source || hintAction
  return (
    <div
      className={cn('min-w-0', className)}
      data-invalid={error ? true : undefined}
      data-needs-input={needsInput ? true : undefined}
    >
      <label htmlFor={htmlFor} className="mb-1.5 block text-small font-bold text-ink">
        {critical ? (
          <span aria-hidden className="mr-1 text-attention">
            ★
          </span>
        ) : null}
        {label}
        {critical ? <span className="sr-only"> (critical fact)</span> : null}
        {required ? <span className="sr-only"> (required)</span> : null}
      </label>
      <div
        className={cn(
          needsInput &&
            '[&_[data-slot=input]]:border-attention-line [&_[data-slot=input]]:bg-attention-tint [&_[data-slot=select-trigger]]:border-attention-line [&_[data-slot=select-trigger]]:bg-attention-tint',
        )}
      >
        {children}
      </div>
      {showHintLine ? (
        <div id={hintId} className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption font-normal">
          {source ? <SourceBadge source={source} /> : null}
          {needsInput && !source ? <SourceBadge source={{ kind: 'needed' }} /> : null}
          {error ? (
            <span role="alert" className="font-semibold text-danger">
              {error}
            </span>
          ) : hint ? (
            <span className="text-ink-3">{hint}</span>
          ) : null}
          {hintAction}
        </div>
      ) : null}
    </div>
  )
}

/** The id LaField gives its hint line, for `aria-describedby` on the control. */
export const fieldHintId = (htmlFor: string) => `${htmlFor}-hint`
