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
  brandCategories,
  error,
  hint = 'Decides which marketplace template the agent fills.',
  submitCount,
}: {
  id: string
  value: string
  onChange: (slug: string) => void
  onBlur?: () => void
  /** Categories the brand's products already use (lamps are offered only to brands that sell them). */
  brandCategories: Iterable<string>
  error?: string
  hint?: ReactNode
  submitCount?: number
}) {
  const current = value.trim()
  const choices = brandCategoryChoices(brandCategories, current)
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
      required
      confirmFix
    >
      <Select
        value={current}
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
 * list. `brandCategories` null while the brand's products load (same-size placeholders).
 */
export function CategoryCodes({ brandCategories, className }: { brandCategories: readonly string[] | null; className?: string }) {
  const choices = brandCategories ? brandCategoryChoices(brandCategories).filter((c) => c.mapped) : null
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
