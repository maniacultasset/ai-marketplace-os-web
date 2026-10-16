import { Icon } from '@/components/la/icons'
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
          'flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-control border inset-field px-2.5 py-1.5 transition-[border-color,box-shadow,background-color] duration-150 hover:border-edge-hover focus-within:border-brand focus-within:shadow-[var(--focus-ring),var(--shadow-inset-sm)]',
          invalid && 'border-danger shadow-[var(--focus-ring-danger),var(--shadow-inset-sm)]',
        )}
      >
        {value.map((t, i) => (
          <span
            key={`${t}-${i}`}
            className="inline-flex max-w-full items-center gap-1 rounded-md border border-line bg-surface py-0.5 pr-0.5 pl-2 text-xs shadow-raised-sm"
          >
            <span className="truncate">{t}</span>
            <button
              type="button"
              aria-label={`Remove ${t}`}
              className="inline-flex size-4 items-center justify-center rounded-sm text-muted-foreground hover:bg-hover hover:text-foreground active:bg-pressed focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
              onClick={() => onChange(value.filter((_, j) => j !== i))}
            >
              <Icon name="x" size={12} />
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
