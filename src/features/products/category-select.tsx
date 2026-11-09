/**
 * Category picker: a dropdown of the categories the agent can list (./category-options.ts), in plain
 * names. The slug is what is saved. A current value with no template stays visible and says so.
 */
import type { ReactNode } from 'react'
import { fieldHintId, LaField } from '@/components/la'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { brandCategoryChoices, isMappedCategory, UNMAPPED_CATEGORY_HINT } from './category-options'

export function CategorySelect({
  id,
  value,
  onChange,
  onBlur,
  lampsEnabled,
  error,
  hint = 'Decides which marketplace template the agent fills.',
  submitCount,
  required = true,
  disabled,
}: {
  id: string
  value: string
  onChange: (slug: string) => void
  onBlur?: () => void
  /** The backend's lamps switch (features/assist/flags.ts): lamps are offered only while it is on. */
  lampsEnabled: boolean
  error?: string
  hint?: ReactNode
  submitCount?: number
  /** False while the seller lets Kuinn suggest the category (SI14). */
  required?: boolean
  disabled?: boolean
}) {
  const current = value.trim()
  const choices = brandCategoryChoices(lampsEnabled, current)
  const unmapped = current !== '' && !isMappedCategory(current)
  return (
    <LaField
      label="Category"
      htmlFor={id}
      error={error}
      hint={unmapped ? UNMAPPED_CATEGORY_HINT : hint}
      needsInput={unmapped && !error}
      source={current ? { kind: 'you' } : undefined}
      submitCount={submitCount}
      required={required}
      confirmFix
    >
      <Select
        value={current}
        disabled={disabled}
        onValueChange={(v) => {
          onChange(v)
          onBlur?.()
        }}
      >
        <SelectTrigger id={id} className="w-full" aria-invalid={error ? true : undefined} aria-describedby={fieldHintId(id)} data-testid={`${id}-trigger`}>
          <SelectValue placeholder="Choose a category" />
        </SelectTrigger>
        <SelectContent>
          {choices.map((c) => (
            <SelectItem key={c.value} value={c.value}>
              {c.mapped ? c.label : `${c.label} (no template)`}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </LaField>
  )
}

/**
 * For spreadsheets: the value to put in the `category` column for each category the agent can
 * list. `lampsEnabled` null while the lamps switch is read (same-size placeholders).
 */
export function CategoryCodes({ lampsEnabled, className }: { lampsEnabled: boolean | null; className?: string }) {
  const choices = lampsEnabled === null ? null : brandCategoryChoices(lampsEnabled).filter((c) => c.mapped)
  return (
    <ul className={cn('flex flex-wrap gap-1.5', className)} aria-busy={choices ? undefined : true} data-testid="category-codes">
      {choices
        ? choices.map((c) => (
            <li key={c.value} className="inline-flex items-center gap-1.5 rounded-md border border-line bg-subtle px-1.5 py-0.5 text-caption text-ink">
              {c.label}
              <code className="font-mono text-ink-2">{c.value}</code>
            </li>
          ))
        : [0, 1].map((i) => (
            <li key={i}>
              <Skeleton className="h-[22px] w-44 rounded-md" />
            </li>
          ))}
    </ul>
  )
}
