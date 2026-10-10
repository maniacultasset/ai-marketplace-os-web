import { X } from 'lucide-react'
import { useState, type KeyboardEvent } from 'react'
import { cn } from '@/lib/utils'
import { charCount } from './listing-form'

/** Terms as chips: Enter or comma adds, Backspace on an empty input removes the last one. */
export function TagInput({
  id,
  value,
  onChange,
  max,
  maxLength,
  placeholder,
  invalid,
  describedBy,
}: {
  id?: string
  value: string[]
  onChange: (next: string[]) => void
  max: number
  maxLength: number
  placeholder?: string
  invalid?: boolean
  describedBy?: string
}) {
  const [draft, setDraft] = useState('')
  const [hint, setHint] = useState<string | null>(null)

  const commit = () => {
    const parts = draft
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    if (!parts.length) return
    const room = max - value.length
    if (room <= 0) {
      setHint(`At most ${max} terms.`)
      return
    }
    const tooLong = parts.find((p) => charCount(p) > maxLength)
    if (tooLong) {
      setHint(`Each term at most ${maxLength} characters.`)
      return
    }
    const fresh = parts.filter((p) => !value.includes(p)).slice(0, room)
    onChange([...value, ...fresh])
    setDraft('')
    setHint(null)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      commit()
    } else if (e.key === 'Backspace' && !draft && value.length) {
      onChange(value.slice(0, -1))
    }
  }

  return (
    <div className="space-y-1">
      <div
        className={cn(
          'flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-lg border border-input bg-card px-2.5 py-1.5 shadow-[inset_0_1px_1px_hsl(var(--shadow-color)/0.04)] transition-[border-color,box-shadow] duration-150 hover:border-border-strong focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/25 dark:bg-input/30',
          invalid && 'border-destructive ring-destructive/20',
        )}
      >
        {value.map((t, i) => (
          <span
            key={`${t}-${i}`}
            className="inline-flex max-w-full items-center gap-1 rounded-md bg-muted py-0.5 pr-0.5 pl-2 text-xs"
          >
            <span className="truncate">{t}</span>
            <button
              type="button"
              aria-label={`Remove ${t}`}
              className="inline-flex size-4 items-center justify-center rounded-sm text-muted-foreground hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
              onClick={() => onChange(value.filter((_, j) => j !== i))}
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value)
            setHint(null)
          }}
          onKeyDown={onKeyDown}
          onBlur={commit}
          placeholder={value.length ? '' : placeholder}
          aria-invalid={invalid || !!hint}
          aria-describedby={describedBy}
          className="min-w-24 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      {hint ? (
        <p role="alert" className="text-xs text-destructive">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
