import { Check, Copy } from 'lucide-react'
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
        className="inline-flex size-5 items-center justify-center rounded hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
        aria-label="Copy reference"
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
        {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
      </button>
    </span>
  )
}
