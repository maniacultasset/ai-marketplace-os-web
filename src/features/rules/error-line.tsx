import { useEffect, useState } from 'react'
import { Icon } from '@/components/la/icons'
import { cn } from '@/lib/utils'

/** Matches LaField: the line opens and folds on --dur-spring. */
const EXIT_MS = 480

const reducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * An inline error under a control, with LaField's motion (index.css `.field-reveal` / `.field-swap`):
 * it opens with a height + opacity reveal and folds away with its last text once fixed. Used where
 * LaField's label row does not fit (counters on the label line, unlabeled rows). `id` and `testId`
 * sit on the live message only, so aria-describedby and tests see exactly the current error.
 */
export function ErrorLine({
  message,
  id,
  testId,
  className,
}: {
  message?: string | null
  id?: string
  testId?: string
  className?: string
}) {
  const [shown, setShown] = useState<string | null>(message || null)
  if (message && message !== shown) setShown(message)
  useEffect(() => {
    if (message || shown === null) return
    const t = window.setTimeout(() => setShown(null), reducedMotion() ? 0 : EXIT_MS)
    return () => window.clearTimeout(t)
  }, [message, shown])

  const open = !!message
  return (
    <div className={cn('field-reveal', className)} data-open={open ? true : undefined}>
      <div className="min-h-0">
        {shown !== null ? (
          <p
            role={open ? 'alert' : undefined}
            aria-hidden={!open || undefined}
            id={open ? id : undefined}
            data-testid={open ? testId : undefined}
            data-slot="field-error"
            data-shown={open ? true : undefined}
            className="field-swap field-error flex items-start gap-1 pt-1.5 text-xs font-semibold text-danger"
          >
            <Icon name="alert" size={14} className="mt-[calc((1lh-14px)/2)]" />
            <span className="min-w-0">{message || shown}</span>
          </p>
        ) : null}
      </div>
    </div>
  )
}
