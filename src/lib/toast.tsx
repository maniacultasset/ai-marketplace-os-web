import { toast } from 'sonner'
import { describeError, isApiError, isNotImplemented } from '@/api/errors'

/** Error toast with the X-Request-ID reference (copyable). 501s become a neutral info toast. */
export function toastError(error: unknown, title?: string) {
  const ref = isApiError(error) ? error.correlationId : null
  const message = describeError(error)
  if (isNotImplemented(error)) {
    toast.info(title ?? 'Not available yet', { description: 'This feature is not available yet.' })
    return
  }
  toast.error(title ?? message, {
    // Errors stay up longer so the message and reference can be read.
    duration: 10000,
    description: (
      <span className="flex flex-col gap-0.5">
        {title ? <span>{message}</span> : null}
        {ref ? <span className="font-mono text-caption text-ink-3">Reference: {ref}</span> : null}
      </span>
    ),
    action: ref
      ? {
          label: 'Copy ref',
          onClick: () =>
            void navigator.clipboard
              ?.writeText(ref)
              .then(() => toast.success('Reference copied'))
              .catch(() => undefined),
        }
      : undefined,
  })
}

export { toast }
