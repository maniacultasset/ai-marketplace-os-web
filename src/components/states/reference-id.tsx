import { Icon } from '@/components/la/icons'
import { useState } from 'react'
import { cn } from '@/lib/utils'

/** "Reference: <X-Request-ID>" with a copy button. Shown on every error surface. */
export function ReferenceId({ id, className }: { id: string | null | undefined; className?: string }) {
  const [copied, setCopied] = useState(false)
  if (!id) return null
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs text-muted-foreground', className)}>
      Reference:
      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground/80" data-testid="error-reference">
        {id}
      </code>
      <button
        type="button"
        className="-my-2 inline-flex size-10 items-center justify-center rounded-md hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none md:size-8"
        aria-label="Copy reference ID"
        onClick={() => {
          void navigator.clipboard
            ?.writeText(id)
            .then(() => {
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            })
            .catch(() => undefined)
        }}
      >
        <Icon name={copied ? 'check' : 'copy'} size={14} />
      </button>
      <span aria-live="polite" className="sr-only">
        {copied ? 'Copied' : ''}
      </span>
    </span>
  )
}
