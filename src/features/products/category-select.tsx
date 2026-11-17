/**
 * Category picker: a searchable list of the categories the agent can list, in plain names, grouped
 * as Topwear, Bottomwear, Ethnic, Home and Other. The slug is what is saved. A current value with
 * no template stays visible and says so. The list comes from the backend (`catalog`,
 * ./catalog-categories.ts) once it is read; until then, or when the read failed, the built-in list
 * (./category-options.ts) stands in. With `onNotListed`, the last item is "My category isn’t here":
 * it leaves the category empty, so the seller can still save the product.
 */
import { ChevronsUpDown } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { fieldHintId, LaField } from '@/components/la'
import { IconGlyph } from '@/components/la/icons'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { CATEGORY_KEYWORDS } from './categories'
import { brandCategoryChoices, groupedChoices, isMappedCategory, UNMAPPED_CATEGORY_HINT, type CategoryOption } from './category-options'
import { pickerChoices, type CatalogCategory } from './catalog-categories'

export const NOT_LISTED_LABEL = 'My category isn’t here'
// No field holds the seller's own category yet (ProductCreate has none), so the note promises only what is true.
export const NOT_LISTED_NOTE = 'You can still save it now without a category, and choose one once it’s in the list.'
const NOT_LISTED_VALUE = '__not_listed__'

/** The searchable control alone (no label), for the add form, the editor and "Change category". */
export function CategoryCombobox({
  id,
  value,
  choices,
  onChange,
  onNotListed,
  notListed = false,
  disabled,
  invalid,
  describedBy,
  placeholder = 'Choose a category',
  testId,
}: {
  id: string
  value: string
  choices: readonly CategoryOption[]
  onChange: (slug: string) => void
  /** Offers "My category isn’t here" as the last item. */
  onNotListed?: () => void
  /** The seller picked "My category isn’t here" (the value is empty then). */
  notListed?: boolean
  disabled?: boolean
  invalid?: boolean
  describedBy?: string
  placeholder?: string
  testId?: string
}) {
  const [open, setOpen] = useState(false)
  const current = choices.find((c) => c.value === value)
  const shown = current ? (current.mapped ? current.label : `${current.label} (no template)`) : notListed && !value ? NOT_LISTED_LABEL : null
  const close = () => setOpen(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          disabled={disabled}
          className="w-full justify-between font-normal"
          data-testid={testId}
        >
          <span className={cn('min-w-0 truncate text-left', shown ? 'text-ink' : 'text-muted-foreground')}>{shown ?? placeholder}</span>
          <IconGlyph icon={ChevronsUpDown} size={16} className="text-ink-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-[min(18rem,calc(100vw-2rem))] p-0" align="start">
        <Command label="Categories">
          <CommandInput placeholder="Search categories" />
          <CommandList className="max-h-72">
            <CommandEmpty>{onNotListed ? 'No category matches.' : 'No category matches. Try another word.'}</CommandEmpty>
            {groupedChoices(choices).map((g) => (
              <CommandGroup key={g.group} heading={g.label}>
                {g.items.map((c) => (
                  <CommandItem
                    key={c.value}
                    value={c.value}
                    keywords={[c.label, g.label, ...(CATEGORY_KEYWORDS[c.value] ?? [])]}
                    data-checked={c.value === value ? 'true' : undefined}
                    onSelect={() => {
                      onChange(c.value)
                      close()
                    }}
                  >
                    {c.mapped ? c.label : `${c.label} (no template)`}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
            {onNotListed ? (
              <>
                <CommandSeparator alwaysRender />
                <CommandGroup forceMount>
                  <CommandItem
                    value={NOT_LISTED_VALUE}
                    forceMount
                    data-checked={notListed && !value ? 'true' : undefined}
                    className="text-ink-2"
                    onSelect={() => {
                      onNotListed()
                      close()
                    }}
                    data-testid="category-not-listed"
                  >
                    {NOT_LISTED_LABEL}
                  </CommandItem>
                </CommandGroup>
              </>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

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
  catalog,
  notListed = false,
  onNotListed,
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
  /** The backend's categories (`GET /catalog/categories`); null or absent: the built-in list. */
  catalog?: readonly CatalogCategory[] | null
  /** The seller picked "My category isn’t here": the note shows and nothing is required. */
  notListed?: boolean
  /** Offers "My category isn’t here" as the last item. */
  onNotListed?: () => void
}) {
  const current = value.trim()
  const choices = pickerChoices(catalog, lampsEnabled, current)
  const unmapped = current !== '' && (catalog ? !catalog.some((c) => c.category === current) : !isMappedCategory(current))
  const showNote = notListed && !current
  return (
    <LaField
      label="Category"
      htmlFor={id}
      error={error}
      hint={unmapped ? UNMAPPED_CATEGORY_HINT : showNote ? <span data-testid={`${id}-not-listed-note`}>{NOT_LISTED_NOTE}</span> : hint}
      needsInput={unmapped && !error}
      source={current ? { kind: 'you' } : undefined}
      submitCount={submitCount}
      required={required && !showNote}
      confirmFix
    >
      <CategoryCombobox
        id={id}
        value={current}
        choices={choices}
        notListed={notListed}
        onNotListed={
          onNotListed
            ? () => {
                onNotListed()
                onBlur?.()
              }
            : undefined
        }
        onChange={(v) => {
          onChange(v)
          onBlur?.()
        }}
        disabled={disabled}
        invalid={!!error}
        describedBy={fieldHintId(id)}
        testId={`${id}-trigger`}
      />
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
