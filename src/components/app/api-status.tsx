import { useQuery } from '@tanstack/react-query'
import { probe } from '@/api/client'
import { cn } from '@/lib/utils'

/** Live API readiness from GET /readyz, re-checked every minute. */
export function ApiStatus({ className }: { className?: string }) {
  const ready = useQuery({
    queryKey: ['system', 'readyz'],
    queryFn: () => probe('/readyz'),
    refetchInterval: 60_000,
    staleTime: 30_000,
  })
  const state = ready.isPending ? 'checking' : ready.data?.ok ? 'ok' : 'down'
  const label = { checking: 'Checking API…', ok: 'API connected', down: 'API not ready' }[state]
  return (
    <div className={cn('flex items-center gap-2 text-xs text-muted-foreground', className)} role="status" aria-live="polite">
      <span className="relative flex size-2" aria-hidden>
        {state === 'ok' ? (
          <span className="absolute inset-0 animate-ping rounded-full bg-success/50 [animation-duration:2.4s] [animation-iteration-count:3]" />
        ) : null}
        <span
          className={cn(
            'relative size-2 rounded-full',
            state === 'ok' && 'bg-success',
            state === 'down' && 'bg-destructive',
            state === 'checking' && 'bg-muted-foreground/40',
          )}
        />
      </span>
      {label}
    </div>
  )
}
