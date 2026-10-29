import { Icon } from '@/components/la/icons'
import { useId, useState, type KeyboardEvent, type Ref } from 'react'
import { cn } from '@/lib/utils'
import { ErrorLine } from './error-line'
import { charCount, CONTROL_MSG } from './listing-form'

/** Control characters other than tab and line breaks (a term is one line, so those go too). */
const CONTROL = /\p{Cc}/u

/** Terms as chips: Enter or comma adds, Backspace on an empty input removes the last one. */
export function TagInput({
  id,
  name,
  ref,
  value,
  onChange,
  onBlur,
  max,
  maxLength,
  placeholder,
  invalid,
  describedBy,
}: {
  id?: string
  name?: string
  /** The text input, so react-hook-form can focus it when the field is invalid. */
  ref?: Ref<HTMLInputElement>
  value: string[]
  onChange: (next: string[]) => void
  onBlur?: () => void
  max: number
  maxLength: number
  placeholder?: string
  invalid?: boolean
  describedBy?: string
}) {
  const [draft, setDraft] = useState('')
  const [hint, setHint] = useState<string | null>(null)
  const auto = useId()
  const hintId = `${id ?? auto}-term-error`

  const commit = () => {
    const parts = draft
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    if (!parts.length) return
    const room = max - value.length
    if (room <= 0) {
      setHint(`You can add up to ${max} terms. Remove one to add another.`)
      return
    }
    if (parts.some((p) => CONTROL.test(p))) {
      setHint(CONTROL_MSG)
      return
    }
    if (parts.some((p) => charCount(p) > maxLength)) {
      setHint(`Shorten the term to ${maxLength} characters or fewer.`)
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

  const showInvalid = invalid || !!hint
  return (
    <div>
      <div
        className={cn(
          'flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-control border inset-field px-2.5 py-1.5 transition-[border-color,box-shadow,background-color] duration-200 hover:border-edge-hover focus-within:border-brand focus-within:shadow-[var(--focus-ring),var(--shadow-inset-sm)]',
          // Like Input: danger border and faint fill at rest, the danger ring only while focused.
          showInvalid &&
            'border-danger bg-field-invalid hover:border-danger focus-within:border-danger focus-within:shadow-[var(--focus-ring-danger),var(--shadow-inset-sm)]',
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
              <Icon name="x" size={14} />
            </button>
          </span>
        ))}
        <input
          id={id}
          name={name}
          ref={ref}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value)
            setHint(null)
          }}
          onKeyDown={onKeyDown}
          onBlur={() => {
            commit()
            onBlur?.()
          }}
          placeholder={value.length ? '' : placeholder}
          autoComplete="off"
          enterKeyHint="enter"
          aria-invalid={showInvalid}
          aria-describedby={hint ? hintId : describedBy}
          className="min-w-24 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      <ErrorLine message={hint} id={hintId} />
    </div>
  )
}
