/**
 * One photo's colour check under its row (client feedback item 9): a quiet line while it runs, once
 * it matches, or when it could not be read; a calm question when the photo may be the wrong one,
 * with "This is the right photo" (kept, recorded with who and when) or "Remove".
 */
import { useState } from 'react'
import { describeError } from '@/api/errors'
import { newIdempotencyKey } from '@/api/idempotency'
import { Icon } from '@/components/la/icons'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import { matchNote, type PhotoMatch } from './photo-match'

export function PhotoMatchNote({
  match,
  onKeep,
  onRemove,
  className,
}: {
  match: PhotoMatch | null | undefined
  /** Keep the photo; absent when the person may not. Resolves when the product was read again. */
  onKeep?: (key: string) => Promise<unknown>
  /** Open the row's delete confirm; absent when the person may not delete. */
  onRemove?: () => void
  className?: string
}) {
  const note = matchNote(match)
  const [key] = useState(newIdempotencyKey)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<unknown>(null)
  if (!note) return null

  if (!note.ask) {
    return (
      <p
        className={cn('mt-1 flex items-center gap-1.5 text-caption text-ink-3', className)}
        data-testid="photo-match"
        data-status={match?.status}
        role={note.tone === 'busy' ? 'status' : undefined}
      >
        {note.tone === 'busy' ? <Spinner className="size-3" /> : null}
        {note.tone === 'ok' ? <Icon name="check" size={12} className="shrink-0 text-success" aria-hidden /> : null}
        <span className="truncate">{note.text}</span>
      </p>
    )
  }

  const keep = async () => {
    if (!onKeep) return
    setSaving(true)
    setError(null)
    try {
      await onKeep(key)
    } catch (err) {
      setError(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className={cn('mt-2 rounded-tile border border-attention-line bg-attention-bg px-3 py-2', className)}
      data-testid="photo-match"
      data-status={match?.status}
    >
      <p className="text-small font-semibold text-ink" data-testid="photo-match-question">
        {note.ask.question}
      </p>
      {note.ask.detail ? <p className="mt-0.5 text-caption text-ink-2">{note.ask.detail}</p> : null}
      <p className="mt-0.5 text-caption text-ink-3">
        {note.ask.blocks ? 'Approval waits until you keep or remove it.' : 'You can still approve. Keep it to clear this note.'}
      </p>
      {onKeep || onRemove ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {onKeep ? (
            <Button variant="outline" size="xs" onClick={() => void keep()} disabled={saving} data-testid="photo-match-keep">
              {saving ? 'Saving…' : 'This is the right photo'}
            </Button>
          ) : null}
          {onRemove ? (
            <Button variant="ghost" size="xs" onClick={onRemove} disabled={saving} data-testid="photo-match-remove">
              Remove
            </Button>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <p className="mt-1 text-caption text-destructive" role="alert">
          {describeError(error)}
        </p>
      ) : null}
    </div>
  )
}
