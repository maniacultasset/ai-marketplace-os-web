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
    description: (
      <span className="flex flex-col gap-0.5">
        {title ? <span>{message}</span> : null}
        {ref ? <span className="font-mono text-[11px] opacity-70">Reference: {ref}</span> : null}
      </span>
    ),
    action: ref
      ? {
          label: 'Copy ref',
          onClick: () => void navigator.clipboard?.writeText(ref).catch(() => undefined),
        }
      : undefined,
  })
}

export { toast }
