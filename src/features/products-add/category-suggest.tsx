/**
 * "Suggest" next to the category picker (client feedback 11 Nov, item 5): Kuinn ranks up to 3
 * categories from the name and details typed so far, each with a short reason, and the seller
 * picks one. It runs only on the button (each ask is a model call), and only while the backend's
 * classifier is on. See ./category-draft.ts for the contract.
 */
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { api, unwrap } from '@/api/client'
import { describeError, isApiError } from '@/api/errors'
import { idempotencyHeader, newIdempotencyKey } from '@/api/idempotency'
import { Icon } from '@/components/la'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { AI_PAUSED_TEXT, isAiPausedError, markAiPaused } from '@/features/ai-credit/model'
import { confidenceWord, formatConfidence } from '@/features/assist/category-model'
import { useKeys } from '@/lib/query-keys'
import { cn } from '@/lib/utils'
import { DRAFT_POLL_MS, DRAFT_WAIT_MS, draftView, type DraftIn, type DraftSuggestion } from './category-draft'

export function CategorySuggest({
  draft,
  value,
  onPick,
  disabled,
  className,
}: {
  /** What the seller typed so far; the button waits for a name. */
  draft: DraftIn
  /** The category picked now (its chip shows as chosen). */
  value: string
  onPick: (slug: string) => void
  disabled?: boolean
  className?: string
}) {
  const keys = useKeys()
  const [id, setId] = useState<string | null>(null)
  const [first, setFirst] = useState<DraftSuggestion | null>(null)
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [timedOut, setTimedOut] = useState(false)

  const read = useQuery({
    queryKey: [...keys.all(), 'catalog', 'category-suggestion', id] as const,
    queryFn: () => unwrap(api.GET('/catalog/category-suggestions/{suggestion_id}', { params: { path: { suggestion_id: id! } } })),
    enabled: !!id && !timedOut,
    refetchInterval: (q) => (q.state.data?.status === 'queued' || !q.state.data ? DRAFT_POLL_MS : false),
    retry: 1,
  })
  const answer = id ? (read.data ?? first) : first
  const view = timedOut && answer?.status === 'queued' ? ({ kind: 'failed', message: 'This is taking longer than usual. Choose the category, or try again.' } as const) : draftView(answer, asking)

  useEffect(() => {
    if (!id || answer?.status !== 'queued') return
    const t = setTimeout(() => setTimedOut(true), DRAFT_WAIT_MS)
    return () => clearTimeout(t)
  }, [id, answer?.status])

  const noName = !draft.title.trim()
  const ask = async () => {
    setError(null)
    setTimedOut(false)
    setAsking(true)
    try {
      // A new key per press: the seller may have changed the name since the last ask.
      const out = await unwrap(api.POST('/catalog/category-suggestions', { params: { header: idempotencyHeader(newIdempotencyKey()) }, body: draft }))
      setFirst(out)
      setId(out.status === 'queued' ? (out.suggestion_id ?? null) : null)
    } catch (err) {
      if (isAiPausedError(err)) {
        markAiPaused()
        setError(AI_PAUSED_TEXT)
      } else if (isApiError(err) && err.status === 429) setError('Today’s limit for suggestions is used up. Choose the category yourself.')
      else setError(describeError(err))
    } finally {
      setAsking(false)
    }
  }

  const busy = view.kind === 'asking'
  return (
    <div className={cn('flex flex-col gap-2.5', className)} data-testid="category-suggest" data-view={view.kind}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <Button type="button" variant="secondary" size="sm" onClick={() => void ask()} disabled={disabled || noName || busy} data-testid="category-suggest-ask">
          {busy ? <Spinner data-icon="inline-start" /> : <Icon name="spark" size={14} aria-hidden />}
          {view.kind === 'chips' || view.kind === 'none' || view.kind === 'failed' ? 'Suggest again' : 'Suggest'}
        </Button>
        <span className="text-caption text-ink-2" role="status" aria-live="polite">
          {busy
            ? 'Kuinn is reading the name and details.'
            : noName
              ? 'Add the product name first, then Kuinn can suggest.'
              : view.kind === 'idle'
                ? 'Not sure? Kuinn suggests from the name and details.'
                : null}
        </span>
      </div>

      {view.kind === 'chips' ? (
        <ul className="flex flex-col gap-1.5" aria-label="Suggested categories">
          {view.candidates.map((c) => {
            const on = value === c.category
            return (
              <li key={c.category}>
                <button
                  type="button"
                  onClick={() => onPick(c.category)}
                  disabled={disabled}
                  aria-pressed={on}
                  className={cn(
                    'focus-ring flex w-full flex-col items-start gap-0.5 rounded-tile border bg-surface px-3 py-2 text-left transition-colors duration-150 motion-reduce:transition-none',
                    on ? 'border-brand shadow-raised-sm' : 'border-line-strong hover:border-ink-3',
                  )}
                  data-testid="category-suggest-chip"
                  data-category={c.category}
                  data-unsure={c.unsure ? 'true' : 'false'}
                >
                  <span className="flex w-full flex-wrap items-baseline justify-between gap-x-3">
                    <span className="flex items-center gap-1.5 text-small font-semibold text-ink">
                      {on ? <Icon name="check" size={14} className="text-brand" aria-hidden /> : null}
                      {c.label}
                    </span>
                    <span className={cn('text-caption tabular-nums', c.unsure ? 'text-attention-ink' : 'text-ink-2')} data-testid="category-suggest-confidence">
                      {c.unsure ? 'Unsure' : confidenceWord(c.confidence)} · {formatConfidence(c.confidence)}
                    </span>
                  </span>
                  {c.rationale ? <span className="text-caption break-words text-ink-2">{c.rationale}</span> : null}
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
      {view.kind === 'chips' && view.candidates.every((c) => c.unsure) ? (
        <p className="text-caption text-ink-2">Kuinn isn’t sure. Check the category before you save.</p>
      ) : null}
      {view.kind === 'none' ? <p className="text-caption text-ink-2">Kuinn couldn’t tell the category from this. Choose it from the list.</p> : null}
      {view.kind === 'unavailable' ? <p className="text-caption text-ink-2">Kuinn can’t suggest a category right now. Choose it from the list.</p> : null}
      {view.kind === 'failed' ? <p className="text-caption text-ink-2">{view.message}</p> : null}
      {error ? (
        <p className="text-caption text-danger" role="alert" data-testid="category-suggest-error">
          {error}
        </p>
      ) : null}
    </div>
  )
}
