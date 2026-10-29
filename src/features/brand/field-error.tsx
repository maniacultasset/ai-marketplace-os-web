/**
 * Inline error line for the brand settings form (which keeps its own compact label layout rather
 * than LaField). Same motion as LaField: the line opens with a height + opacity reveal on the
 * spring and folds away with its last message when fixed; a fixed error gets a brief tick when
 * `confirmFix` is set. All of it is off under prefers-reduced-motion (index.css).
 */
import { useEffect, useState } from 'react'
import { Icon } from '@/components/la/icons'
import { cn } from '@/lib/utils'

/** Matches --dur-spring, like LaField. */
const FOLD_MS = 480
const TICK_MS = 1600

const reducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function FieldError({
  id,
  message,
  confirmFix,
  className,
}: {
  id?: string
  message: string | undefined
  confirmFix?: boolean
  className?: string
}) {
  const has = !!message
  // Keep the last message while the line folds away, so it never empties mid-collapse.
  const [shown, setShown] = useState<string | null>(message ?? null)
  if (has && message !== shown) setShown(message)
  useEffect(() => {
    if (has || shown === null) return
    const t = window.setTimeout(() => setShown(null), reducedMotion() ? 0 : FOLD_MS)
    return () => window.clearTimeout(t)
  }, [has, shown])

  const [fixed, setFixed] = useState(false)
  const [prevHas, setPrevHas] = useState(has)
  if (prevHas !== has) {
    setPrevHas(has)
    setFixed(Boolean(confirmFix) && !has)
  }
  useEffect(() => {
    if (!fixed) return
    const t = window.setTimeout(() => setFixed(false), TICK_MS)
    return () => window.clearTimeout(t)
  }, [fixed])

  return (
    <div className={cn('field-reveal', className)} data-open={has || fixed ? true : undefined}>
      <div className="min-h-0">
        <div className="grid pt-1">
          {fixed && !has ? (
            <span className="field-swap field-tick text-success" data-shown aria-hidden>
              <Icon name="check" size={14} />
            </span>
          ) : null}
          {shown !== null ? (
            <p
              id={has ? id : undefined}
              role={has ? 'alert' : undefined}
              aria-live={has ? 'polite' : undefined}
              aria-hidden={!has || undefined}
              data-slot="field-error"
              data-shown={has ? true : undefined}
              className="field-swap flex items-start gap-1 text-xs font-medium text-destructive"
            >
              <Icon name="alert" size={14} className="mt-[calc((1lh-14px)/2)]" />
              <span className="min-w-0">{has ? message : shown}</span>
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
