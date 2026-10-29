/**
 * Field (hi-fi Components → Field): label 13 bold 6px above, control 40 high, hint 12/16 ink-3 6px
 * below, error in danger replacing the hint. States: default, focus, filled, needs input (attention
 * border + tint), error, disabled. A source badge sits on the hint line ("You", "Agent · 82%").
 *
 * <LaField label="Brand name" htmlFor="brand" hint="Exactly as customers see it." source={{ kind: 'you' }}
 *   error={errors.brand?.message} submitCount={formState.submitCount} confirmFix>
 *   <Input id="brand" aria-invalid={!!errors.brand} aria-describedby={fieldHintId('brand')} … />
 * </LaField>
 *
 * Motion (all off under prefers-reduced-motion):
 * - The error line opens with a height + opacity reveal (grid rows 0fr → 1fr, --ease-spring) and
 *   cross-fades with the hint; it fades out with its text when fixed.
 * - Pass `submitCount` (react-hook-form `formState.submitCount`) and the control gives one small
 *   horizontal nudge when a submit turns up an error it did not have at the last submit.
 * - `confirmFix` shows a small success tick for a moment once an error is fixed.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { CONCEPT_ICON } from './concept-icons'
import { Icon, IconGlyph } from './icons'
import { SourceBadge, type Source } from './source-badge'

/** Matches --dur-spring: the error line opens and folds away on the same spring. */
const REVEAL_MS = 480
const EXIT_MS = REVEAL_MS
const TICK_MS = 1600

const reducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

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
  submitCount,
  confirmFix,
  children,
  className,
}: {
  label: ReactNode
  htmlFor?: string
  hint?: ReactNode
  error?: ReactNode
  source?: Source
  required?: boolean
  /** Critical fact (star mark): never filled by the agent. */
  critical?: boolean
  /** Attention state ("Needed"): the value is missing and blocks a listing. */
  needsInput?: boolean
  /** Inline action on the hint line, e.g. a 22px "Confirm" button. */
  hintAction?: ReactNode
  /** The form's submit count (react-hook-form `formState.submitCount`): enables the submit nudge. */
  submitCount?: number
  /** Show a brief success tick when an error on this field is fixed. */
  confirmFix?: boolean
  children: ReactNode
  className?: string
}) {
  const auto = useId()
  const hintId = `${htmlFor ?? auto}-hint`
  const hasError = error !== undefined && error !== null && error !== false && error !== ''

  // Keep the last message on screen while the line fades and folds away, so it never empties
  // mid-collapse.
  const [shownError, setShownError] = useState<ReactNode>(hasError ? error : null)
  // Strings compare by value; a node error is captured once per episode (a fresh element each
  // render would otherwise loop).
  if (hasError && (shownError === null || (typeof error === 'string' && error !== shownError))) setShownError(error)
  useEffect(() => {
    if (hasError || shownError === null) return
    const t = window.setTimeout(() => setShownError(null), reducedMotion() ? 0 : EXIT_MS)
    return () => window.clearTimeout(t)
  }, [hasError, shownError])

  // A fixed error earns a brief tick (opt-in).
  const [fixed, setFixed] = useState(false)
  const [prevHasError, setPrevHasError] = useState(hasError)
  if (prevHasError !== hasError) {
    setPrevHasError(hasError)
    setFixed(Boolean(confirmFix) && !hasError)
  }
  useEffect(() => {
    if (!fixed) return
    const t = window.setTimeout(() => setFixed(false), TICK_MS)
    return () => window.clearTimeout(t)
  }, [fixed])

  // One nudge per new error per submit: a submit that finds an error this field did not have at
  // the previous submit. Transform only, ≤4px, 280ms.
  const controlRef = useRef<HTMLDivElement>(null)
  const lastSubmit = useRef(submitCount)
  const errorAtLastSubmit = useRef<ReactNode>(null)
  useEffect(() => {
    if (submitCount === undefined || submitCount === lastSubmit.current) return
    lastSubmit.current = submitCount
    const isNew = hasError && (typeof error === 'string' ? error !== errorAtLastSubmit.current : !errorAtLastSubmit.current)
    errorAtLastSubmit.current = hasError ? error : null
    const el = controlRef.current
    if (!isNew || !el || typeof el.animate !== 'function' || reducedMotion()) return
    el.animate(
      [
        { transform: 'translateX(0)' },
        { transform: 'translateX(-4px)' },
        { transform: 'translateX(3px)' },
        { transform: 'translateX(-1.5px)' },
        { transform: 'translateX(0)' },
      ],
      { duration: 280, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
    )
  }, [submitCount, hasError, error])

  const errorVisible = hasError || shownError !== null
  const lineOpen = Boolean(hasError || hint || source || hintAction || needsInput || fixed)
  // Clip only while the line is closed or moving, so a focus ring on `hintAction` is never cut.
  const [settled, setSettled] = useState(lineOpen)
  const [prevOpen, setPrevOpen] = useState(lineOpen)
  if (prevOpen !== lineOpen) {
    setPrevOpen(lineOpen)
    setSettled(false)
  }
  useEffect(() => {
    if (!lineOpen || settled) return
    const t = window.setTimeout(() => setSettled(true), reducedMotion() ? 0 : REVEAL_MS)
    return () => window.clearTimeout(t)
  }, [lineOpen, settled])
  return (
    <div
      className={cn('min-w-0', className)}
      data-invalid={hasError ? true : undefined}
      data-needs-input={needsInput ? true : undefined}
    >
      <label htmlFor={htmlFor} className="mb-1.5 block text-small font-bold text-ink">
        {critical ? (
          <IconGlyph icon={CONCEPT_ICON.critical} size={14} className="mr-1 inline-block -translate-y-px align-middle text-attention" />
        ) : null}
        {label}
        {critical ? <span className="sr-only"> (critical fact)</span> : null}
        {required ? <span className="sr-only"> (required)</span> : null}
      </label>
      <div
        ref={controlRef}
        className={cn(
          needsInput &&
            '[&_[data-slot=input]]:border-attention-line [&_[data-slot=input]]:bg-attention-tint [&_[data-slot=select-trigger]]:border-attention-line [&_[data-slot=select-trigger]]:bg-attention-tint',
        )}
      >
        {children}
      </div>
      <div className="field-reveal" data-open={lineOpen ? true : undefined} data-settled={lineOpen && settled ? true : undefined}>
        <div className="min-h-0">
          <div id={hintId} className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-1.5 text-caption font-normal">
            {source ? <SourceBadge source={source} /> : null}
            {needsInput && !source ? <SourceBadge source={{ kind: 'needed' }} /> : null}
            {errorVisible || hint || fixed ? (
              <span className="grid min-w-0 flex-1 basis-40">
                {hint ? (
                  <span className="field-swap text-ink-3" data-shown={!hasError ? true : undefined} aria-hidden={hasError || undefined}>
                    {hint}
                  </span>
                ) : null}
                {fixed && !hasError && !hint ? (
                  <span className="field-swap field-tick text-success" data-shown aria-hidden>
                    <Icon name="check" size={14} />
                  </span>
                ) : null}
                {errorVisible ? (
                  <span
                    role={hasError ? 'alert' : undefined}
                    aria-live={hasError ? 'polite' : undefined}
                    aria-hidden={!hasError || undefined}
                    data-slot="field-error"
                    data-shown={hasError ? true : undefined}
                    className="field-swap field-error flex items-start gap-1 font-semibold text-danger"
                  >
                    <Icon name="alert" size={14} className="mt-[calc((1lh-14px)/2)]" />
                    <span className="min-w-0">{hasError ? error : shownError}</span>
                  </span>
                ) : null}
              </span>
            ) : null}
            {fixed && !hasError && hint ? (
              <Icon name="check" size={14} className="field-tick text-success" />
            ) : null}
            {hintAction}
          </div>
        </div>
      </div>
    </div>
  )
}

/** The id LaField gives its hint line, for `aria-describedby` on the control. */
export const fieldHintId = (htmlFor: string) => `${htmlFor}-hint`
